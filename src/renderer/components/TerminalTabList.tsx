import { AnimatePresence, motion } from 'framer-motion';
import type { TerminalTab } from '../../shared/types';

const api = (window as unknown as { electronAPI: import('../../shared/types').ElectronAPI }).electronAPI;

interface TerminalTabListProps {
  tabs: TerminalTab[];
  worktreePath: string;
}

function getSubtitle(tab: TerminalTab, worktreePath: string): string {
  // Process tabs: show cleaned-up command from lastLine
  if (tab.lastLine) return tab.lastLine;
  // Shell tabs: show relative CWD
  if (tab.cwd) {
    if (tab.cwd === worktreePath) return './';
    if (tab.cwd.startsWith(worktreePath + '/')) {
      return './' + tab.cwd.substring(worktreePath.length + 1);
    }
  }
  return '';
}

export function TerminalTabList({ tabs, worktreePath }: TerminalTabListProps) {
  if (tabs.length === 0) return null;

  const handleClick = (tab: TerminalTab) => {
    api.focusTerminalTab({
      app: tab.app,
      windowId: tab.windowId,
      tabId: tab.tabId,
    });
  };

  const sorted = [...tabs].sort((a, b) => a.tabId.localeCompare(b.tabId));

  return (
    <AnimatePresence initial={false}>
      {sorted.map((tab) => {
        const subtitle = getSubtitle(tab, worktreePath);
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
            <span className={`tree-dot ${tab.port ? 'process' : 'terminal'}`} />
            <span className="tree-app-label">
              {tab.app === 'terminal' ? 'term' : 'iterm'}
            </span>
            <div className="tree-tab-info">
              <span className="tree-tab-title">{tab.title}</span>
              {subtitle && (
                <span className="tree-tab-cwd">{subtitle}</span>
              )}
            </div>
            {tab.port && <span className="tree-tab-port">:{tab.port}</span>}
          </motion.button>
        );
      })}
    </AnimatePresence>
  );
}
