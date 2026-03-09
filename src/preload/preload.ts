import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/constants';
import type { ElectronAPI, FocusBrowserTabParams, FocusTerminalTabParams, FocusEditorTabParams, PinnedWorktree } from '../shared/types';

const api: ElectronAPI = {
  pickFolder: () => ipcRenderer.invoke(IPC_CHANNELS.PICK_FOLDER),
  addProject: (path: string) => ipcRenderer.invoke(IPC_CHANNELS.ADD_PROJECT, path),
  removeProject: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.REMOVE_PROJECT, id),
  listProjects: () => ipcRenderer.invoke(IPC_CHANNELS.LIST_PROJECTS),
  getProjectStatus: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.GET_STATUS, id),
  focusBrowserTab: (params: FocusBrowserTabParams) => ipcRenderer.invoke(IPC_CHANNELS.FOCUS_BROWSER_TAB, params),
  focusTerminalTab: (params: FocusTerminalTabParams) => ipcRenderer.invoke(IPC_CHANNELS.FOCUS_TERMINAL_TAB, params),
  focusEditorTab: (params: FocusEditorTabParams) => ipcRenderer.invoke(IPC_CHANNELS.FOCUS_EDITOR_TAB, params),
  getPins: () => ipcRenderer.invoke(IPC_CHANNELS.GET_PINS),
  setPins: (pins: PinnedWorktree[]) => ipcRenderer.invoke(IPC_CHANNELS.SET_PINS, pins),
  onWindowFocus: (cb: () => void) => {
    ipcRenderer.on('window:focus', cb);
    return () => { ipcRenderer.removeListener('window:focus', cb); };
  },
  onWindowBlur: (cb: () => void) => {
    ipcRenderer.on('window:blur', cb);
    return () => { ipcRenderer.removeListener('window:blur', cb); };
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);
