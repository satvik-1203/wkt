import { execFile } from 'child_process';
import { promisify } from 'util';
import type { BrowserTab, BrowserType, FocusBrowserTabParams } from '../../shared/types';

const execFileAsync = promisify(execFile);

interface BrowserConfig {
  type: BrowserType;
  appName: string;
}

const BROWSERS: BrowserConfig[] = [
  { type: 'chrome', appName: 'Google Chrome' },
  { type: 'arc', appName: 'Arc' },
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

async function getTabsFromBrowser(
  browser: BrowserConfig
): Promise<{ url: string; title: string; windowId: string; tabId: string }[]> {
  const running = await isAppRunning(browser.appName);
  if (!running) return [];

  try {
    // Use `tell window wi` block syntax (required by Arc, works for Chrome too).
    // IMPORTANT: Arc breaks when storing tab in a variable (`set t to tab ti`),
    // so always reference `tab ti` inline.
    const script = `
      set output to ""
      tell application "${browser.appName}"
        set winCount to count of windows
        repeat with wi from 1 to winCount
          tell window wi
            set wId to id
            set tabCount to count of tabs
            repeat with ti from 1 to tabCount
              try
                set tabId to id of tab ti
                set tabURL to URL of tab ti
                set tabTitle to title of tab ti
                set output to output & wId & "|||" & tabId & "|||" & tabURL & "|||" & tabTitle & linefeed
              end try
            end repeat
          end tell
        end repeat
      end tell
      return output
    `;

    const { stdout } = await execFileAsync('osascript', ['-e', script], { timeout: 8000 });
    const tabs: { url: string; title: string; windowId: string; tabId: string }[] = [];

    for (const line of stdout.trim().split('\n')) {
      if (!line) continue;
      const parts = line.split('|||');
      if (parts.length < 4) continue;
      tabs.push({
        windowId: parts[0].trim(),
        tabId: parts[1].trim(),
        url: parts[2].trim(),
        title: parts.slice(3).join('|||').trim(),
      });
    }
    return tabs;
  } catch {
    return [];
  }
}

/**
 * Get all browser tabs matching localhost on any of the given ports.
 */
export async function getBrowserTabs(ports: number[]): Promise<BrowserTab[]> {
  if (ports.length === 0) return [];

  const results: BrowserTab[] = [];
  const browserResults = await Promise.all(
    BROWSERS.map(async (browser) => {
      const tabs = await getTabsFromBrowser(browser);
      return { browser, tabs };
    })
  );

  for (const { browser, tabs } of browserResults) {
    for (const tab of tabs) {
      for (const port of ports) {
        if (
          tab.url.includes(`localhost:${port}`) ||
          tab.url.includes(`127.0.0.1:${port}`) ||
          tab.url.includes(`[::1]:${port}`)
        ) {
          results.push({
            title: tab.title,
            url: tab.url,
            browser: browser.type,
            matchedPort: port,
            windowId: tab.windowId,
            tabId: tab.tabId,
          });
          break;
        }
      }
    }
  }

  return results;
}

/**
 * Focus a specific browser tab by its stable tab ID.
 */
export async function focusBrowserTab(params: FocusBrowserTabParams): Promise<void> {
  const { browser, windowId, tabId } = params;
  const appName = browser === 'chrome' ? 'Google Chrome' : 'Arc';

  // Find the tab by its stable ID and select it.
  // Arc: `tell tab to select`; Chrome: `set active tab index`
  let script: string;
  if (browser === 'arc') {
    script = `
      tell application "Arc"
        activate
        set winCount to count of windows
        repeat with wi from 1 to winCount
          tell window wi
            if (id as text) is "${windowId}" then
              repeat with t in tabs
                if (id of t as text) is "${tabId}" then
                  tell t to select
                  return
                end if
              end repeat
            end if
          end tell
        end repeat
      end tell
    `;
  } else {
    script = `
      tell application "Google Chrome"
        activate
        set winCount to count of windows
        repeat with wi from 1 to winCount
          tell window wi
            if (id as text) is "${windowId}" then
              set index to 1
              set tabCount to count of tabs
              repeat with ti from 1 to tabCount
                if (id of tab ti as text) is "${tabId}" then
                  set active tab index to ti
                  return
                end if
              end repeat
            end if
          end tell
        end repeat
      end tell
    `;
  }

  try {
    await execFileAsync('osascript', ['-e', script], { timeout: 5000 });
  } catch {
    // Focus may fail if window/tab was closed
  }
}
