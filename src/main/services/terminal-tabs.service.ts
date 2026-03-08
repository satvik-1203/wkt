import { execFile } from 'child_process';
import { promisify } from 'util';
import type { TerminalApp, FocusTerminalTabParams } from '../../shared/types';

const execFileAsync = promisify(execFile);

export interface RawTerminalTab {
  app: TerminalApp;
  windowId: string;
  tabId: string;
  tty: string; // normalized, e.g. "ttys001"
  title: string;
}

interface TerminalAppConfig {
  app: TerminalApp;
  appName: string;
}

const TERMINALS: TerminalAppConfig[] = [
  { app: 'terminal', appName: 'Terminal' },
  { app: 'iterm2', appName: 'iTerm2' },
];

async function isAppRunning(appName: string): Promise<boolean> {
  try {
    const script = `tell application "System Events" to (name of processes) contains "${appName}"`;
    const { stdout } = await execFileAsync('osascript', ['-e', script]);
    return stdout.trim() === 'true';
  } catch {
    return false;
  }
}

function normalizeTty(tty: string): string {
  return tty.replace(/^\/dev\//, '');
}

async function getTerminalAppTabs(config: TerminalAppConfig): Promise<RawTerminalTab[]> {
  const running = await isAppRunning(config.appName);
  if (!running) return [];

  try {
    let script: string;
    if (config.app === 'terminal') {
      // Terminal.app: tabs don't have their own id, use window_id + tty as stable key
      script = `
        set output to ""
        tell application "Terminal"
          repeat with w in windows
            set wId to id of w
            set tabCount to count of tabs of w
            repeat with ti from 1 to tabCount
              set t to tab ti of w
              try
                set tabTTY to tty of t
                set tabTitle to name of t
                set output to output & wId & "|||" & tabTTY & "|||" & tabTTY & "|||" & tabTitle & linefeed
              end try
            end repeat
          end repeat
        end tell
        return output
      `;
    } else {
      // iTerm2: iterate ALL sessions (including split panes), not just current session
      script = `
        set output to ""
        tell application "iTerm2"
          repeat with w in windows
            set wId to id of w
            set tabCount to count of tabs of w
            repeat with ti from 1 to tabCount
              set t to tab ti of w
              try
                repeat with s in sessions of t
                  set sId to unique ID of s
                  set sTTY to tty of s
                  set sName to name of s
                  set output to output & wId & "|||" & sId & "|||" & sTTY & "|||" & sName & "|||" & ti & linefeed
                end repeat
              end try
            end repeat
          end repeat
        end tell
        return output
      `;
    }

    const { stdout } = await execFileAsync('osascript', ['-e', script], { timeout: 5000 });
    const tabs: RawTerminalTab[] = [];

    for (const line of stdout.trim().split('\n')) {
      if (!line) continue;
      const parts = line.split('|||');
      if (config.app === 'iterm2') {
        // Format: windowId ||| sessionId ||| tty ||| name ||| tabIndex
        if (parts.length < 5) continue;
        tabs.push({
          app: config.app,
          windowId: parts[0].trim(),
          tabId: parts[1].trim(),
          tty: normalizeTty(parts[2].trim()),
          title: parts[3].trim(),
        });
      } else {
        // Terminal.app: windowId ||| tty ||| tty ||| title
        if (parts.length < 4) continue;
        tabs.push({
          app: config.app,
          windowId: parts[0].trim(),
          tabId: parts[1].trim(),
          tty: normalizeTty(parts[2].trim()),
          title: parts.slice(3).join('|||').trim(),
        });
      }
    }
    return tabs;
  } catch {
    return [];
  }
}

/**
 * Get all terminal tabs from Terminal.app and iTerm2.
 */
export async function getRawTerminalTabs(): Promise<RawTerminalTab[]> {
  const results = await Promise.all(TERMINALS.map(getTerminalAppTabs));
  return results.flat();
}

/**
 * Focus a specific terminal tab by its stable session/tab ID.
 */
export async function focusTerminalTab(params: FocusTerminalTabParams): Promise<void> {
  const { app, tabId } = params;

  let script: string;
  if (app === 'terminal') {
    // Terminal.app: tabId is the tty, find by matching
    script = `
      tell application "Terminal"
        activate
        repeat with w in windows
          set tabCount to count of tabs of w
          repeat with ti from 1 to tabCount
            set t to tab ti of w
            try
              if tty of t is "/dev/${tabId}" then
                set index of w to 1
                set selected of t to true
                return
              end if
            end try
          end repeat
        end repeat
      end tell
    `;
  } else {
    // iTerm2: search ALL sessions (including split panes) by unique ID
    script = `
      tell application "iTerm2"
        activate
        repeat with w in windows
          set tabCount to count of tabs of w
          repeat with ti from 1 to tabCount
            set t to tab ti of w
            try
              repeat with s in sessions of t
                if unique ID of s is "${tabId}" then
                  set index of w to 1
                  tell w to select tab ti
                  tell s to select
                  return
                end if
              end repeat
            end try
          end repeat
        end repeat
      end tell
    `;
  }

  try {
    await execFileAsync('osascript', ['-e', script], { timeout: 3000 });
  } catch {
    // Focus may fail if window was closed
  }
}
