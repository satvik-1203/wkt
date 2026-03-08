import { AnimatePresence, motion } from 'framer-motion';
import type { BrowserTab } from '../../shared/types';

const api = (window as unknown as { electronAPI: import('../../shared/types').ElectronAPI }).electronAPI;

interface BrowserTabListProps {
  tabs: BrowserTab[];
}

export function BrowserTabList({ tabs }: BrowserTabListProps) {
  if (tabs.length === 0) return null;

  const handleClick = (tab: BrowserTab) => {
    api.focusBrowserTab({
      browser: tab.browser,
      windowId: tab.windowId,
      tabId: tab.tabId,
    });
  };

  const sorted = [...tabs].sort((a, b) => a.tabId.localeCompare(b.tabId));

  const getPath = (url: string) => {
    try {
      const u = new URL(url);
      return u.pathname + u.search + u.hash;
    } catch {
      return url;
    }
  };

  return (
    <AnimatePresence initial={false}>
      {sorted.map((tab) => {
        const path = getPath(tab.url);
        return (
          <motion.button
            key={tab.tabId}
            className="tree-tab-row"
            onClick={() => handleClick(tab)}
            layout
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.15 }}
          >
            <span className="tree-dot browser" />
            <span className="tree-app-label">
              {tab.browser === 'chrome' ? 'chrome' : 'arc'}
            </span>
            <span className="tree-tab-title">
              {tab.title || tab.url}
              {path && path !== '/' && (
                <span className="tree-tab-url">{path}</span>
              )}
            </span>
            <span className="tree-tab-port">:{tab.matchedPort}</span>
          </motion.button>
        );
      })}
    </AnimatePresence>
  );
}
