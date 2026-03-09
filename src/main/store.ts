import Store from 'electron-store';
import type { ProjectConfig, PinnedWorktree } from '../shared/types';

interface StoreSchema {
  projects: ProjectConfig[];
  pinnedWorktrees: PinnedWorktree[];
}

const store = new Store<StoreSchema>({
  defaults: {
    projects: [],
    pinnedWorktrees: [],
  },
});

export function getProjects(): ProjectConfig[] {
  return store.get('projects');
}

export function addProject(project: ProjectConfig): void {
  const projects = getProjects();
  projects.push(project);
  store.set('projects', projects);
}

export function removeProject(id: string): void {
  const projects = getProjects().filter((p) => p.id !== id);
  store.set('projects', projects);
}

export function getProjectById(id: string): ProjectConfig | undefined {
  return getProjects().find((p) => p.id === id);
}

export function getPinnedWorktrees(): PinnedWorktree[] {
  return store.get('pinnedWorktrees');
}

export function setPinnedWorktrees(pins: PinnedWorktree[]): void {
  store.set('pinnedWorktrees', pins);
}
