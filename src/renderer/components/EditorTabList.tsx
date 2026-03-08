import { AnimatePresence, motion } from 'framer-motion';
import type { EditorTab } from '../../shared/types';

const api = (window as unknown as { electronAPI: import('../../shared/types').ElectronAPI }).electronAPI;

interface EditorTabListProps {
  tabs: EditorTab[];
}

export function EditorTabList({ tabs }: EditorTabListProps) {
  if (tabs.length === 0) return null;

  const handleClick = (tab: EditorTab) => {
    api.focusEditorTab({
      app: tab.app,
      windowId: tab.windowId,
    });
  };

  const sorted = [...tabs].sort((a, b) => a.windowId.localeCompare(b.windowId));

  return (
    <AnimatePresence initial={false}>
      {sorted.map((tab) => (
        <motion.button
          key={`${tab.app}-${tab.windowId}`}
          className="tree-tab-row"
          onClick={() => handleClick(tab)}
          layout
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -8 }}
          transition={{ duration: 0.15 }}
        >
          <span className="tree-dot editor" />
          <span className="tree-app-label">
            {tab.app === 'vscode' ? 'vscode' : 'cursor'}
          </span>
          <span className="tree-tab-title">{tab.title}</span>
        </motion.button>
      ))}
    </AnimatePresence>
  );
}
