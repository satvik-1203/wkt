import Store from 'electron-store';
import type { ProjectConfig } from '../shared/types';

interface StoreSchema {
  projects: ProjectConfig[];
}

const store = new Store<StoreSchema>({
  defaults: {
    projects: [],
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
