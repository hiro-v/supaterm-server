import type { KeyboardIntent } from './intents';

export type WorkbenchCommandHandlers = {
  addTab(): void;
  toggleSidebar(): void;
  openAppearanceDialog(): void;
  openRenameTabDialog(): void;
  openRenamePaneDialog(): void;
  openCloseTabDialog(): void;
  splitActivePane(axis: 'row' | 'column', placement: 'before' | 'after'): void;
  openCreateSpaceDialog(): void;
  openRenameWorkspaceDialog(): void;
  openCloseWorkspaceDialog(): void;
  nextTab(): void;
  previousTab(): void;
  selectTab(tabId: string): void;
  selectWorkspace(workspaceId: string): void;
  renderOverlay(): void;
};

export type WorkbenchActionHandlers = {
  openCreateSpaceDialog(): void;
  addTab(): void;
  openAppearanceDialog(): void;
  openRenameWorkspaceDialog(): void;
  openCloseWorkspaceDialog(): void;
  toggleSidebar(): void;
  openPalette(): void;
  closeDialog(): void;
  submitDialog(): void;
};

export type WorkbenchKeyboardHandlers = {
  closeDialog(): void;
  submitDialog(): void;
  movePaletteSelection(delta: number): void;
  runSelectedPaletteCommand(): void;
  openPalette(): void;
  addTab(): void;
  toggleSidebar(): void;
  splitActivePane(axis: 'row' | 'column', placement: 'after'): void;
  closeTab(): void;
  closeActivePane(): void;
  previousTab(): void;
  nextTab(): void;
  selectWorkspaceByIndex(index: number): void;
};

export function executeWorkbenchCommand(
  id: string,
  handlers: WorkbenchCommandHandlers,
): void {
  switch (id) {
    case 'new-tab':
      handlers.addTab();
      return;
    case 'toggle-sidebar':
      handlers.toggleSidebar();
      return;
    case 'open-appearance':
      handlers.openAppearanceDialog();
      return;
    case 'rename-tab':
      handlers.openRenameTabDialog();
      return;
    case 'rename-pane':
      handlers.openRenamePaneDialog();
      return;
    case 'close-tab':
      handlers.openCloseTabDialog();
      return;
    case 'split-right':
      handlers.splitActivePane('row', 'after');
      return;
    case 'split-down':
      handlers.splitActivePane('column', 'after');
      return;
    case 'split-left':
      handlers.splitActivePane('row', 'before');
      return;
    case 'split-up':
      handlers.splitActivePane('column', 'before');
      return;
    case 'create-space':
      handlers.openCreateSpaceDialog();
      return;
    case 'rename-space':
      handlers.openRenameWorkspaceDialog();
      return;
    case 'delete-space':
      handlers.openCloseWorkspaceDialog();
      return;
    case 'next-tab':
      handlers.nextTab();
      return;
    case 'previous-tab':
      handlers.previousTab();
      return;
  }

  if (id.startsWith('select-tab:')) {
    handlers.selectTab(id.slice('select-tab:'.length));
    return;
  }

  if (id.startsWith('select-space:')) {
    handlers.selectWorkspace(id.slice('select-space:'.length));
    return;
  }

  handlers.renderOverlay();
}

export function executeWorkbenchActionIntent(
  action:
    | 'new-workspace'
    | 'new-tab'
    | 'rename-workspace'
    | 'close-workspace'
    | 'toggle-sidebar'
    | 'open-appearance'
    | 'open-palette'
    | 'dialog-cancel'
    | 'dialog-submit',
  handlers: WorkbenchActionHandlers,
): void {
  switch (action) {
    case 'new-workspace':
      handlers.openCreateSpaceDialog();
      return;
    case 'new-tab':
      handlers.addTab();
      return;
    case 'rename-workspace':
      handlers.openRenameWorkspaceDialog();
      return;
    case 'close-workspace':
      handlers.openCloseWorkspaceDialog();
      return;
    case 'toggle-sidebar':
      handlers.toggleSidebar();
      return;
    case 'open-appearance':
      handlers.openAppearanceDialog();
      return;
    case 'open-palette':
      handlers.openPalette();
      return;
    case 'dialog-cancel':
      handlers.closeDialog();
      return;
    case 'dialog-submit':
      handlers.submitDialog();
      return;
  }
}

export function executeWorkbenchKeyboardIntent(
  intent: KeyboardIntent,
  handlers: WorkbenchKeyboardHandlers,
): void {
  switch (intent.type) {
    case 'close-dialog':
      handlers.closeDialog();
      return;
    case 'submit-dialog':
      handlers.submitDialog();
      return;
    case 'move-palette-selection':
      handlers.movePaletteSelection(intent.delta);
      return;
    case 'run-selected-palette-command':
      handlers.runSelectedPaletteCommand();
      return;
    case 'open-palette':
      handlers.openPalette();
      return;
    case 'new-tab':
      handlers.addTab();
      return;
    case 'toggle-sidebar':
      handlers.toggleSidebar();
      return;
    case 'split-active-pane':
      handlers.splitActivePane(intent.axis, 'after');
      return;
    case 'close-tab':
      handlers.closeTab();
      return;
    case 'close-active-pane':
      handlers.closeActivePane();
      return;
    case 'previous-tab':
      handlers.previousTab();
      return;
    case 'next-tab':
      handlers.nextTab();
      return;
    case 'select-workspace-index':
      handlers.selectWorkspaceByIndex(intent.index);
      return;
  }
}
