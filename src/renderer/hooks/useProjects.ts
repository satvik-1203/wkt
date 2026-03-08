import { useState, useCallback, useEffect } from 'react';
import type { ProjectConfig } from '../../shared/types';

const api = (window as unknown as { electronAPI: import('../../shared/types').ElectronAPI }).electronAPI;

export function useProjects() {
  const [projects, setProjects] = useState<ProjectConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await api.listProjects();
      setProjects(list);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const pickAndAdd = useCallback(async () => {
    try {
      const folderPath = await api.pickFolder();
      if (!folderPath) return null;
      const project = await api.addProject(folderPath);
      await refresh();
      return project;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add project');
      return null;
    }
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    try {
      await api.removeProject(id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove project');
    }
  }, [refresh]);

  return { projects, loading, error, pickAndAdd, remove, refresh };
}
