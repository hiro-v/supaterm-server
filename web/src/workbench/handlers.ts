import type {
  WorkbenchActionHandlers,
  WorkbenchCommandHandlers,
  WorkbenchKeyboardHandlers,
} from './controller';

export type WorkbenchHandlerCallbacks = {
  addTab(): void;
  toggleSidebar(): void;
  openRenameTabDialog(): void;
  openRenamePaneDialog(): void;
  openCloseTabDialog(): void;
  openClosePaneDialog(): void;
  splitActivePane(axis: 'row' | 'column', placement: 'before' | 'after'): void;
  openCreateSpaceDialog(): void;
  openRenameWorkspaceDialog(): void;
  openCloseWorkspaceDialog(): void;
  nextTab(): void;
  previousTab(): void;
  selectTab(tabId: string): void;
  selectWorkspace(workspaceId: string): void;
  renderOverlay(): void;
  openPalette(): void;
  closeDialog(): void;
  submitDialog(): void;
  movePaletteSelection(delta: number): void;
  runSelectedPaletteCommand(): void;
  closeActivePane(): void;
  selectWorkspaceByIndex(index: number): void;
};

export function createWorkbenchCommandHandlers(
  callbacks: WorkbenchHandlerCallbacks,
): WorkbenchCommandHandlers {
  return {
    addTab: callbacks.addTab,
    toggleSidebar: callbacks.toggleSidebar,
    openRenameTabDialog: callbacks.openRenameTabDialog,
    openRenamePaneDialog: callbacks.openRenamePaneDialog,
    openCloseTabDialog: callbacks.openCloseTabDialog,
    splitActivePane: callbacks.splitActivePane,
    openCreateSpaceDialog: callbacks.openCreateSpaceDialog,
    openRenameWorkspaceDialog: callbacks.openRenameWorkspaceDialog,
    openCloseWorkspaceDialog: callbacks.openCloseWorkspaceDialog,
    nextTab: callbacks.nextTab,
    previousTab: callbacks.previousTab,
    selectTab: callbacks.selectTab,
    selectWorkspace: callbacks.selectWorkspace,
    renderOverlay: callbacks.renderOverlay,
  };
}

export function createWorkbenchActionHandlers(
  callbacks: WorkbenchHandlerCallbacks,
): WorkbenchActionHandlers {
  return {
    openCreateSpaceDialog: callbacks.openCreateSpaceDialog,
    addTab: callbacks.addTab,
    openRenameWorkspaceDialog: callbacks.openRenameWorkspaceDialog,
    openCloseWorkspaceDialog: callbacks.openCloseWorkspaceDialog,
    toggleSidebar: callbacks.toggleSidebar,
    openPalette: callbacks.openPalette,
    closeDialog: callbacks.closeDialog,
    submitDialog: callbacks.submitDialog,
  };
}

export function createWorkbenchKeyboardHandlers(
  callbacks: WorkbenchHandlerCallbacks,
): WorkbenchKeyboardHandlers {
  return {
    closeDialog: callbacks.closeDialog,
    submitDialog: callbacks.submitDialog,
    movePaletteSelection: callbacks.movePaletteSelection,
    runSelectedPaletteCommand: callbacks.runSelectedPaletteCommand,
    openPalette: callbacks.openPalette,
    addTab: callbacks.addTab,
    toggleSidebar: callbacks.toggleSidebar,
    splitActivePane: (axis, placement) => callbacks.splitActivePane(axis, placement),
    closeTab: callbacks.openCloseTabDialog,
    closeActivePane: callbacks.openClosePaneDialog,
    previousTab: callbacks.previousTab,
    nextTab: callbacks.nextTab,
    selectWorkspaceByIndex: callbacks.selectWorkspaceByIndex,
  };
}
