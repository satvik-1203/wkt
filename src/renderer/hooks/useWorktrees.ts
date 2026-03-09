import { useState, useCallback, useEffect } from 'react';
import type { ProjectStatus } from '../../shared/types';
import { usePolling } from './usePolling';

const api = (window as unknown as { electronAPI: import('../../shared/types').ElectronAPI }).electronAPI;

export function useWorktrees(projectId: string | null) {
  const [status, setStatus] = useState<ProjectStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Clear stale data immediately when switching projects
  useEffect(() => {
    setStatus(null);
    setError(null);
  }, [projectId]);

  const fetchStatus = useCallback(async () => {
    if (!projectId) {
      setStatus(null);
      return;
    }
    setLoading(true);
    try {
      const result = await api.getProjectStatus(projectId);
      setStatus(result);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to get project status');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  usePolling(fetchStatus, !!projectId);

  return { status, loading, error, refresh: fetchStatus };
}
