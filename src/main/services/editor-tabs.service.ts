import { execFile } from 'child_process';
import { promisify } from 'util';
import type { EditorApp, EditorTab, FocusEditorTabParams } from '../../shared/types';

const execFileAsync = promisify(execFile);

interface EditorConfig {
  app: EditorApp;
  /** Substrings to match in the `comm` column of `ps` output */
  processPatterns: string[];
  cliCommand: string;
}

const EDITORS: EditorConfig[] = [
  {
    app: 'vscode',
    processPatterns: ['Code Helper', '/Code.app/'],
    cliCommand: 'code',
  },
  {
    app: 'cursor',
    processPatterns: ['Cursor Helper', '/Cursor.app/'],
    cliCommand: 'cursor',
  },
];

/**
 * Detect editor windows by finding helper processes whose CWD matches a worktree.
 * Plugin helpers (extension-host) inherit the project folder CWD.
 * Uses `ps` + the existing `pidCwdMap` from lsof — no Accessibility permission needed.
 */
export async function getEditorTabsForWorktrees(
  worktreePaths: string[],
  pidCwdMap: Record<string, string>
): Promise<Map<string, EditorTab[]>> {
  const result = new Map<string, EditorTab[]>();
  for (const wtPath of worktreePaths) {
    result.set(wtPath, []);
  }

  // Find editor PIDs by process name
  let psOutput: string;
  try {
    const { stdout } = await execFileAsync('ps', ['-eo', 'pid,comm'], { timeout: 3000 });
    psOutput = stdout;
  } catch {
    return result;
  }

  for (const editor of EDITORS) {
    const pids: number[] = [];
    for (const line of psOutput.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const spaceIdx = trimmed.indexOf(' ');
      if (spaceIdx === -1) continue;
      const pid = parseInt(trimmed.substring(0, spaceIdx), 10);
      const comm = trimmed.substring(spaceIdx + 1).trim();
      if (isNaN(pid)) continue;

      if (editor.processPatterns.some((pat) => comm.includes(pat))) {
        pids.push(pid);
      }
    }

    // Match PIDs to worktrees via CWD — deduplicate per editor+worktree
    const seenWorktrees = new Set<string>();
    for (const pid of pids) {
      const cwd = pidCwdMap[pid];
      if (!cwd || cwd === '/') continue;

      for (const wtPath of worktreePaths) {
        if (cwd === wtPath || cwd.startsWith(wtPath + '/')) {
          const key = `${editor.app}:${wtPath}`;
          if (!seenWorktrees.has(key)) {
            seenWorktrees.add(key);
            result.get(wtPath)!.push({
              app: editor.app,
              windowId: wtPath,
              title: wtPath.split('/').pop() || wtPath,
            });
          }
          break;
        }
      }
    }
  }

  return result;
}

/**
 * Focus editor by opening the folder with the CLI command.
 * `code <folder>` / `cursor <folder>` reuses existing window and brings to front.
 */
export async function focusEditorTab(params: FocusEditorTabParams): Promise<void> {
  const config = EDITORS.find((e) => e.app === params.app);
  if (!config) return;

  try {
    await execFileAsync(config.cliCommand, [params.windowId], { timeout: 5000 });
  } catch {
    try {
      const appName = params.app === 'vscode' ? 'Visual Studio Code' : 'Cursor';
      await execFileAsync('osascript', ['-e', `tell application "${appName}" to activate`], { timeout: 3000 });
    } catch {
      // Best effort
    }
  }
}
