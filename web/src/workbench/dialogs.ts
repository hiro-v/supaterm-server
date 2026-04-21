import {
  addWorkspace,
  closePane,
  closeTab,
  closeWorkspace,
  getActivePane,
  getActiveTab,
  getActiveWorkspace,
  renamePane,
  renameTab,
  renameWorkspace,
  setPaneShell,
  setWorkbenchAppearance,
} from './actions';
import { buildWorkbenchCommands, filterWorkbenchCommands } from './commands';
import type { DialogState } from './overlay';
import type { WorkbenchState } from './state';

export type DialogSubmitResult =
  | { kind: 'noop' }
  | { kind: 'close' }
  | { kind: 'run-command'; commandId: string }
  | { kind: 'commit'; disposedPaneIds: string[] };

export function movePaletteSelection(
  dialog: Extract<DialogState, { type: 'palette' }>,
  state: WorkbenchState,
  delta: number,
): boolean {
  const commands = getPaletteCommands(dialog, state);
  if (commands.length === 0) return false;
  dialog.selectedIndex = (dialog.selectedIndex + delta + commands.length) % commands.length;
  return true;
}

export function getSelectedPaletteCommandId(
  dialog: Extract<DialogState, { type: 'palette' }>,
  state: WorkbenchState,
): string | null {
  const commands = getPaletteCommands(dialog, state);
  return commands[dialog.selectedIndex]?.id ?? null;
}

export function submitWorkbenchDialog(
  state: WorkbenchState,
  dialog: DialogState | null,
  seedSessionId: string | null,
): DialogSubmitResult {
  if (!dialog) return { kind: 'noop' };

  if (dialog.type === 'palette') {
    const commandId = getSelectedPaletteCommandId(dialog, state);
    return commandId ? { kind: 'run-command', commandId } : { kind: 'noop' };
  }

  if (dialog.type === 'pane-info') {
    return setPaneShell(state, dialog.paneId, dialog.shell)
      ? { kind: 'commit', disposedPaneIds: [] }
      : { kind: 'noop' };
  }

  if (dialog.type === 'appearance') {
    return setWorkbenchAppearance(state, dialog.appearance)
      ? { kind: 'commit', disposedPaneIds: [] }
      : { kind: 'noop' };
  }

  if (dialog.type === 'confirm-close') {
    switch (dialog.scope) {
      case 'workspace':
        return { kind: 'commit', disposedPaneIds: closeWorkspace(state, dialog.targetId) };
      case 'tab':
        return { kind: 'commit', disposedPaneIds: closeTab(state, dialog.targetId) };
      case 'pane':
        return { kind: 'commit', disposedPaneIds: closePane(state, dialog.targetId) };
    }
  }

  const value = dialog.value.trim();
  if (value.length === 0) return { kind: 'noop' };

  switch (dialog.type) {
    case 'create-space':
      addWorkspace(state, seedSessionId, value);
      return { kind: 'commit', disposedPaneIds: [] };
    case 'rename-space':
      return renameWorkspace(state, dialog.workspaceId, value)
        ? { kind: 'commit', disposedPaneIds: [] }
        : { kind: 'noop' };
    case 'rename-tab':
      return renameTab(state, dialog.tabId, value)
        ? { kind: 'commit', disposedPaneIds: [] }
        : { kind: 'noop' };
    case 'rename-pane':
      return renamePane(state, dialog.paneId, value)
        ? { kind: 'commit', disposedPaneIds: [] }
        : { kind: 'noop' };
  }
}

function getPaletteCommands(
  dialog: Extract<DialogState, { type: 'palette' }>,
  state: WorkbenchState,
) {
  return filterWorkbenchCommands(
    buildWorkbenchCommands(
      state,
      getActiveWorkspace(state),
      getActiveTab(state),
      getActivePane(state),
    ),
    dialog.query,
  );
}
