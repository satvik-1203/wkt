import { ipcMain, dialog, BrowserWindow } from 'electron';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { IPC_CHANNELS } from '../shared/constants';
import type {
  ProjectConfig,
  ProjectStatus,
  TerminalTab,
  FocusBrowserTabParams,
  FocusTerminalTabParams,
  FocusEditorTabParams,
} from '../shared/types';
import { getProjects, addProject, removeProject, getProjectById } from './store';
import { getWorktrees } from './services/git.service';
import { getPidCwdMap, getPidMaps, hasAncestorOnTty } from './services/process.service';
import { getListeningPorts } from './services/port.service';
import { getRawTerminalTabs, focusTerminalTab } from './services/terminal-tabs.service';
import { getBrowserTabs, focusBrowserTab } from './services/browser-tabs.service';
import { getEditorTabsForWorktrees, focusEditorTab } from './services/editor-tabs.service';

const execFileAsync = promisify(execFile);

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

async function isGitRepo(dirPath: string): Promise<boolean> {
  try {
    await execFileAsync('git', ['-C', dirPath, 'rev-parse', '--git-dir']);
    return true;
  } catch {
    return false;
  }
}

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.PICK_FOLDER, async () => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      title: 'Select a Git Repository',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle(IPC_CHANNELS.ADD_PROJECT, async (_event, dirPath: string): Promise<ProjectConfig> => {
    const isRepo = await isGitRepo(dirPath);
    if (!isRepo) throw new Error(`"${dirPath}" is not a git repository`);
    const existing = getProjects().find((p) => p.path === dirPath);
    if (existing) throw new Error(`Project already added: ${existing.name}`);
    const project: ProjectConfig = {
      id: generateId(),
      name: path.basename(dirPath),
      path: dirPath,
      addedAt: Date.now(),
    };
    addProject(project);
    return project;
  });

  ipcMain.handle(IPC_CHANNELS.REMOVE_PROJECT, async (_event, id: string): Promise<void> => {
    removeProject(id);
  });

  ipcMain.handle(IPC_CHANNELS.LIST_PROJECTS, async (): Promise<ProjectConfig[]> => {
    return getProjects();
  });

  ipcMain.handle(IPC_CHANNELS.GET_STATUS, async (_event, id: string): Promise<ProjectStatus> => {
    const project = getProjectById(id);
    if (!project) throw new Error(`Project not found: ${id}`);

    // Step 1: Gather all data in parallel
    const [worktrees, pidCwdMap, pidMaps, listeningPorts, rawTermTabs] = await Promise.all([
      getWorktrees(project.path),
      getPidCwdMap(),
      getPidMaps(),
      getListeningPorts(),
      getRawTerminalTabs(),
    ]);

    const { pidTtyMap, pidParentMap } = pidMaps;
    const worktreePaths = worktrees.map((w) => w.path);

    // Step 2: Build tty -> [PIDs] map (reverse of pidTtyMap)
    const ttyPidsMap: Record<string, number[]> = {};
    for (const [pidStr, tty] of Object.entries(pidTtyMap)) {
      if (!ttyPidsMap[tty]) ttyPidsMap[tty] = [];
      ttyPidsMap[tty].push(parseInt(pidStr, 10));
    }

    // Step 3: Build tty -> port map
    // A port belongs to a tty if:
    //   - the listening PID is directly on that tty, OR
    //   - the listening PID has an ancestor on that tty (e.g. turbo spawns child on new tty)
    const ttyPortMap: Record<string, number[]> = {};

    function addPortToTty(tty: string, port: number) {
      if (!ttyPortMap[tty]) ttyPortMap[tty] = [];
      if (!ttyPortMap[tty].includes(port)) ttyPortMap[tty].push(port);
    }

    for (const { pid, port } of listeningPorts) {
      // Walk the ancestor chain and collect every tty we pass through
      const seenTtys = new Set<string>();
      let current = pid;
      for (let depth = 0; depth < 15; depth++) {
        const tty = pidTtyMap[current];
        if (tty && !seenTtys.has(tty)) {
          seenTtys.add(tty);
          addPortToTty(tty, port);
        }
        const parent = pidParentMap[current];
        if (!parent || parent === current || parent <= 1) break;
        current = parent;
      }
    }

    // Step 4: Match terminal tabs to worktrees
    const terminalTabsByWorktree = new Map<string, TerminalTab[]>();
    for (const wtPath of worktreePaths) {
      terminalTabsByWorktree.set(wtPath, []);
    }

    for (const tab of rawTermTabs) {
      const pids = ttyPidsMap[tab.tty] || [];
      let bestWt: string | null = null;
      let bestCwd: string | null = null;

      for (const pid of pids) {
        const cwd = pidCwdMap[pid];
        if (!cwd) continue;
        for (const wtPath of worktreePaths) {
          if (cwd === wtPath || cwd.startsWith(wtPath + '/')) {
            if (!bestWt || wtPath.length > bestWt.length) {
              bestWt = wtPath;
              bestCwd = cwd;
            }
            break;
          }
        }
      }

      if (bestWt && bestCwd) {
        const ports = ttyPortMap[tab.tty] || [];
        terminalTabsByWorktree.get(bestWt)!.push({
          app: tab.app,
          windowId: tab.windowId,
          tabId: tab.tabId,
          title: tab.title,
          cwd: bestCwd,
          port: ports[0] || null,
        });
      }
    }

    // Step 5: Collect all HTTP dev ports per worktree (from any process, not just terminal tabs)
    const portsByWorktree = new Map<string, number[]>();
    for (const wtPath of worktreePaths) {
      portsByWorktree.set(wtPath, []);
    }
    for (const { pid, port } of listeningPorts) {
      const cwd = pidCwdMap[pid];
      if (!cwd) continue;
      for (const wtPath of worktreePaths) {
        if (cwd === wtPath || cwd.startsWith(wtPath + '/')) {
          const list = portsByWorktree.get(wtPath)!;
          if (!list.includes(port)) list.push(port);
          break;
        }
      }
    }

    // Step 6: Get browser tabs matching detected ports
    const allPorts = [...new Set([...portsByWorktree.values()].flat())];
    const browserTabs = await getBrowserTabs(allPorts);

    // Step 7: Match editor tabs to worktrees (uses ps + pidCwdMap, no Accessibility permission)
    const editorTabsByWorktree = await getEditorTabsForWorktrees(worktreePaths, pidCwdMap);

    // Step 8: Assemble WorktreeStatus
    const worktreeStatuses = worktrees.map((worktree) => {
      const wtPorts = portsByWorktree.get(worktree.path) || [];
      const wtBrowserTabs = browserTabs.filter((tab) => wtPorts.includes(tab.matchedPort));
      const wtTerminalTabs = terminalTabsByWorktree.get(worktree.path) || [];
      const wtEditorTabs = editorTabsByWorktree.get(worktree.path) || [];

      return {
        worktree,
        terminalTabs: wtTerminalTabs,
        browserTabs: wtBrowserTabs,
        editorTabs: wtEditorTabs,
      };
    });

    return {
      project,
      worktrees: worktreeStatuses,
      lastRefreshed: Date.now(),
    };
  });

  ipcMain.handle(IPC_CHANNELS.FOCUS_BROWSER_TAB, async (_event, params: FocusBrowserTabParams) => {
    await focusBrowserTab(params);
  });

  ipcMain.handle(IPC_CHANNELS.FOCUS_TERMINAL_TAB, async (_event, params: FocusTerminalTabParams) => {
    await focusTerminalTab(params);
  });

  ipcMain.handle(IPC_CHANNELS.FOCUS_EDITOR_TAB, async (_event, params: FocusEditorTabParams) => {
    await focusEditorTab(params);
  });
}
