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
          tabId: normalizeTty(parts[1].trim()),
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
  const { app, windowId, tabId } = params;
  console.log('[focusTerminalTab]', params);

  let script: string;
  if (app === 'terminal') {
    // Terminal.app: use `tell window wi` block pattern for reliable property access
    script = `
      tell application "Terminal"
        activate
        set winCount to count of windows
        repeat with wi from 1 to winCount
          tell window wi
            if (id as text) is "${windowId}" then
              set tabCount to count of tabs
              repeat with ti from 1 to tabCount
                try
                  if tty of tab ti is "/dev/${tabId}" then
                    set index of window wi to 1
                    set selected of tab ti to true
                    return
                  end if
                end try
              end repeat
            end if
          end tell
        end repeat
      end tell
    `;
  } else {
    // iTerm2: use `window id N` for a stable reference that doesn't shift with indices.
    // Two-phase: find target tab index, then bring window to front and select.
    script = `
      tell application "iTerm2"
        activate
        set diag to ""
        set targetTab to -1
        try
          set w to window id ${windowId}
          tell w
            set tabCount to count of tabs
            set diag to diag & "tabCount=" & tabCount & linefeed
            repeat with ti from 1 to tabCount
              if targetTab is -1 then
                try
                  repeat with s in sessions of tab ti
                    set sid to unique ID of s
                    set diag to diag & "tab " & ti & " sid=" & sid & linefeed
                    if sid is "${tabId}" then
                      set targetTab to ti
                      set diag to diag & "MATCHED at tab " & ti & linefeed
                    end if
                  end repeat
                end try
              end if
            end repeat
          end tell
        on error errMsg
          set diag to diag & "FIND FAILED: " & errMsg & linefeed
        end try
        set diag to diag & "targetTab=" & targetTab & linefeed
        if targetTab is not -1 then
          try
            set w to window id ${windowId}
            set index of w to 1
            tell w to select tab targetTab
            repeat with s in sessions of tab targetTab of w
              if unique ID of s is "${tabId}" then
                tell s to select
              end if
            end repeat
            set diag to diag & "FOCUS OK" & linefeed
          on error errMsg
            set diag to diag & "FOCUS FAILED: " & errMsg & linefeed
          end try
        else
          set diag to diag & "NO match found" & linefeed
        end if
        return diag
      end tell
    `;
  }

  try {
    const { stdout } = await execFileAsync('osascript', ['-e', script], { timeout: 3000 });
    if (stdout.trim()) {
      console.log('[focusTerminalTab] diag:\n' + stdout);
    }
  } catch (err) {
    console.error('[focusTerminalTab] AppleScript failed:', err);
  }
}
