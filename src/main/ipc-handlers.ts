import { ipcMain, dialog, BrowserWindow } from 'electron';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { IPC_CHANNELS } from '../shared/constants';
import type {
  ProjectConfig,
  ProjectStatus,
  WorktreeStatus,
  TerminalTab,
  FocusBrowserTabParams,
  FocusTerminalTabParams,
  FocusEditorTabParams,
} from '../shared/types';
import { getProjects, addProject, removeProject, getProjectById } from './store';
import { getWorktrees } from './services/git.service';
import { getPidCwdMap, getPidMaps } from './services/process.service';
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

async function buildProjectStatus(project: ProjectConfig): Promise<{ project: ProjectConfig; worktrees: WorktreeStatus[]; lastRefreshed: number }> {
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

  // Exclude our own process tree to avoid self-detection
  const ownPid = process.pid;
  const ownPids = new Set<number>([ownPid]);
  // Walk the parent map to find all descendants of our PID
  for (const [pidStr, ppid] of Object.entries(pidParentMap)) {
    const pid = parseInt(pidStr, 10);
    // Walk up from this pid to see if it's a descendant of ownPid
    let current = pid;
    for (let d = 0; d < 20; d++) {
      const parent = pidParentMap[current];
      if (parent === ownPid) { ownPids.add(pid); break; }
      if (!parent || parent === current || parent <= 1) break;
      current = parent;
    }
  }

  // Step 2: Build tty -> [PIDs] map (reverse of pidTtyMap), excluding own processes
  const ttyPidsMap: Record<string, number[]> = {};
  for (const [pidStr, tty] of Object.entries(pidTtyMap)) {
    const pid = parseInt(pidStr, 10);
    if (ownPids.has(pid)) continue;
    if (!ttyPidsMap[tty]) ttyPidsMap[tty] = [];
    ttyPidsMap[tty].push(pid);
  }

  // Step 3: Build tty -> port map.
  // Walk up the process tree and collect ALL TTYs, since tools like turbo may allocate
  // intermediate pseudo-terminals (the listening process ends up on a different TTY than
  // the shell session). Cross-validation with portsByWorktree (Step 5) prevents
  // cross-project leakage.
  const ttyPortMap: Record<string, number[]> = {};

  function addPortToTty(tty: string, port: number) {
    if (!ttyPortMap[tty]) ttyPortMap[tty] = [];
    if (!ttyPortMap[tty].includes(port)) ttyPortMap[tty].push(port);
  }

  // Filter out own processes from listening ports
  const externalPorts = listeningPorts.filter((lp) => !ownPids.has(lp.pid));

  for (const { pid, port } of externalPorts) {
    let current = pid;
    for (let depth = 0; depth < 15; depth++) {
      const tty = pidTtyMap[current];
      if (tty) {
        addPortToTty(tty, port);
      }
      const parent = pidParentMap[current];
      if (!parent || parent === current || parent <= 1) break;
      current = parent;
    }
  }

  // Step 4: Collect all HTTP dev ports per worktree.
  // Walk up the process tree from the port's PID to find a CWD matching a worktree,
  // since the listening process itself may have a different CWD than its parent shell.
  const portsByWorktree = new Map<string, number[]>();
  for (const wtPath of worktreePaths) {
    portsByWorktree.set(wtPath, []);
  }
  for (const { pid, port } of externalPorts) {
    let matched = false;
    let current = pid;
    for (let depth = 0; depth < 15 && !matched; depth++) {
      const cwd = pidCwdMap[current];
      if (cwd) {
        for (const wtPath of worktreePaths) {
          if (cwd === wtPath || cwd.startsWith(wtPath + '/')) {
            const list = portsByWorktree.get(wtPath)!;
            if (!list.includes(port)) list.push(port);
            matched = true;
            break;
          }
        }
      }
      const parent = pidParentMap[current];
      if (!parent || parent === current || parent <= 1) break;
      current = parent;
    }
  }

  // Step 5: Match terminal tabs to worktrees
  const terminalTabsByWorktree = new Map<string, TerminalTab[]>();
  for (const wtPath of worktreePaths) {
    terminalTabsByWorktree.set(wtPath, []);
  }

  for (const tab of rawTermTabs) {
    const pids = ttyPidsMap[tab.tty] || [];
    let bestWt: string | null = null;
    let bestCwd: string | null = null;

    for (const pid of pids) {
      if (ownPids.has(pid)) continue;
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
      const ttyPorts = ttyPortMap[tab.tty] || [];
      const wtPorts = portsByWorktree.get(bestWt) || [];
      // Only assign a port if it's BOTH on this TTY AND its process CWD is in this worktree.
      // This prevents cross-project port leakage when multiple projects share a terminal.
      const matchedPort = ttyPorts.find((p) => wtPorts.includes(p)) || null;
      terminalTabsByWorktree.get(bestWt)!.push({
        app: tab.app,
        windowId: tab.windowId,
        tabId: tab.tabId,
        title: tab.title,
        cwd: bestCwd,
        port: matchedPort,
      });
    }
  }

  // Step 6: Get browser tabs matching detected ports
  const allPorts = [...new Set([...portsByWorktree.values()].flat())];
  const browserTabs = await getBrowserTabs(allPorts);

  // Step 7: Match editor tabs to worktrees
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
    return buildProjectStatus(project);
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
