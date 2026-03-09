import { useState, useCallback, useEffect } from 'react';
import type { PinnedWorktree } from '../../shared/types';

export type { PinnedWorktree };

const api = (window as unknown as { electronAPI: import('../../shared/types').ElectronAPI }).electronAPI;

export function usePinnedWorktrees() {
  const [pins, setPins] = useState<PinnedWorktree[]>([]);

  // Load pins from main process on mount
  useEffect(() => {
    api.getPins().then(setPins);
  }, []);

  const addPin = useCallback((pin: PinnedWorktree) => {
    setPins((prev) => {
      if (prev.some((p) => p.projectId === pin.projectId && p.worktreePath === pin.worktreePath)) {
        return prev;
      }
      const next = [...prev, pin];
      api.setPins(next);
      return next;
    });
  }, []);

  const removePin = useCallback((projectId: string, worktreePath: string) => {
    setPins((prev) => {
      const next = prev.filter((p) => !(p.projectId === projectId && p.worktreePath === worktreePath));
      api.setPins(next);
      return next;
    });
  }, []);

  const isPinned = useCallback(
    (projectId: string, worktreePath: string) =>
      pins.some((p) => p.projectId === projectId && p.worktreePath === worktreePath),
    [pins],
  );

  return { pins, addPin, removePin, isPinned };
}
