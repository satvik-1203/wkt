import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { PinnedWorktree } from '../hooks/usePinnedWorktrees';

interface Props {
  pins: PinnedWorktree[];
  currentPin: { projectId: string; projectName: string; worktreePath: string; worktreeLabel: string } | null;
  currentIsPinned: boolean;
  onSelectPin: (projectId: string, worktreePath: string) => void;
  onAddPin: (pin: PinnedWorktree) => void;
  onRemovePin: (projectId: string, worktreePath: string) => void;
}

export function PinDropdown({ pins, currentPin, currentIsPinned, onSelectPin, onAddPin, onRemovePin }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Click-outside to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const hasPins = pins.length > 0;

  return (
    <div className="pin-dropdown-anchor" ref={ref}>
      <button
        className={`pin-btn${open || hasPins ? ' pin-btn-active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title="Pinned worktrees"
      >
        {hasPins ? '★' : '☆'}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="pin-dropdown"
            initial={{ opacity: 0, y: -6, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.95 }}
            transition={{ duration: 0.15 }}
          >
            {pins.length === 0 && !currentPin && (
              <div className="pin-dropdown-empty">No pinned worktrees</div>
            )}

            {pins.map((pin) => (
              <button
                key={`${pin.projectId}:${pin.worktreePath}`}
                className="pin-dropdown-item"
                onClick={() => {
                  onSelectPin(pin.projectId, pin.worktreePath);
                  setOpen(false);
                }}
              >
                <span className="pin-dropdown-item-label">
                  {pin.projectName}
                  <span className="pin-dropdown-item-sep"> / </span>
                  {pin.worktreeLabel}
                </span>
                <span
                  className="pin-dropdown-item-remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemovePin(pin.projectId, pin.worktreePath);
                  }}
                >
                  ×
                </span>
              </button>
            ))}

            {currentPin && (
              <>
                {pins.length > 0 && <div className="pin-dropdown-divider" />}
                <button
                  className="pin-dropdown-action"
                  onClick={() => {
                    if (currentIsPinned) {
                      onRemovePin(currentPin.projectId, currentPin.worktreePath);
                    } else {
                      onAddPin(currentPin);
                    }
                  }}
                >
                  {currentIsPinned ? 'Unpin this worktree' : 'Pin this worktree'}
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
