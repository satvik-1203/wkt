import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/constants';
import type { ElectronAPI, FocusBrowserTabParams, FocusTerminalTabParams, FocusEditorTabParams } from '../shared/types';

const api: ElectronAPI = {
  pickFolder: () => ipcRenderer.invoke(IPC_CHANNELS.PICK_FOLDER),
  addProject: (path: string) => ipcRenderer.invoke(IPC_CHANNELS.ADD_PROJECT, path),
  removeProject: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.REMOVE_PROJECT, id),
  listProjects: () => ipcRenderer.invoke(IPC_CHANNELS.LIST_PROJECTS),
  getProjectStatus: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.GET_STATUS, id),
  focusBrowserTab: (params: FocusBrowserTabParams) => ipcRenderer.invoke(IPC_CHANNELS.FOCUS_BROWSER_TAB, params),
  focusTerminalTab: (params: FocusTerminalTabParams) => ipcRenderer.invoke(IPC_CHANNELS.FOCUS_TERMINAL_TAB, params),
  focusEditorTab: (params: FocusEditorTabParams) => ipcRenderer.invoke(IPC_CHANNELS.FOCUS_EDITOR_TAB, params),
};

contextBridge.exposeInMainWorld('electronAPI', api);
