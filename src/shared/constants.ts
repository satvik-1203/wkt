export const IPC_CHANNELS = {
  PICK_FOLDER: 'project:pick-folder',
  ADD_PROJECT: 'project:add',
  REMOVE_PROJECT: 'project:remove',
  LIST_PROJECTS: 'project:list',
  GET_STATUS: 'project:get-status',
  FOCUS_BROWSER_TAB: 'browser:focus-tab',
  FOCUS_TERMINAL_TAB: 'terminal:focus-tab',
  FOCUS_EDITOR_TAB: 'editor:focus-tab',
  WINDOW_FOCUS: 'window:focus',
  WINDOW_BLUR: 'window:blur',
} as const;
