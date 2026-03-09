export interface ProjectConfig {
  id: string;
  name: string;
  path: string;
  addedAt: number;
}

export interface Worktree {
  path: string;
  head: string;
  branch: string | null;
  isBare: boolean;
  isMain: boolean;
  label: string;
}

export type TerminalApp = 'terminal' | 'iterm2';

export interface TerminalTab {
  app: TerminalApp;
  windowId: string;
  tabId: string;
  title: string;
  cwd: string;
  port: number | null;
}

export type BrowserType = 'chrome' | 'arc';

export interface BrowserTab {
  title: string;
  url: string;
  browser: BrowserType;
  matchedPort: number;
  windowId: string;
  tabId: string;
}

export type EditorApp = 'vscode' | 'cursor';

export interface EditorTab {
  app: EditorApp;
  windowId: string;
  title: string;
}

export interface WorktreeStatus {
  worktree: Worktree;
  terminalTabs: TerminalTab[];
  browserTabs: BrowserTab[];
  editorTabs: EditorTab[];
}

export interface ProjectStatus {
  project: ProjectConfig;
  worktrees: WorktreeStatus[];
  lastRefreshed: number;
}

export interface FocusBrowserTabParams {
  browser: BrowserType;
  windowId: string;
  tabId: string;
}

export interface FocusTerminalTabParams {
  app: TerminalApp;
  windowId: string;
  tabId: string;
}

export interface FocusEditorTabParams {
  app: EditorApp;
  windowId: string;
}

export interface ElectronAPI {
  pickFolder: () => Promise<string | null>;
  addProject: (path: string) => Promise<ProjectConfig>;
  removeProject: (id: string) => Promise<void>;
  listProjects: () => Promise<ProjectConfig[]>;
  getProjectStatus: (id: string) => Promise<ProjectStatus>;
  focusBrowserTab: (params: FocusBrowserTabParams) => Promise<void>;
  focusTerminalTab: (params: FocusTerminalTabParams) => Promise<void>;
  focusEditorTab: (params: FocusEditorTabParams) => Promise<void>;
  onWindowFocus: (cb: () => void) => () => void;
  onWindowBlur: (cb: () => void) => () => void;
}
