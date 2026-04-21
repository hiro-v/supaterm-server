import {
  createWorkbenchActionHandlers,
  createWorkbenchCommandHandlers,
  createWorkbenchKeyboardHandlers,
} from './handlers';

export type WorkbenchHandlerHost = {
  addTab(): void;
  toggleSidebar(): void;
  openAppearanceDialog(): void;
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
  selectWorkspaceByIndex(index: number): void;
};

export function createWorkbenchHandlerSets(host: WorkbenchHandlerHost) {
  const callbacks = {
    addTab: () => host.addTab(),
    toggleSidebar: () => host.toggleSidebar(),
    openAppearanceDialog: () => host.openAppearanceDialog(),
    openRenameTabDialog: () => host.openRenameTabDialog(),
    openRenamePaneDialog: () => host.openRenamePaneDialog(),
    openCloseTabDialog: () => host.openCloseTabDialog(),
    openClosePaneDialog: () => host.openClosePaneDialog(),
    splitActivePane: (axis: 'row' | 'column', placement: 'before' | 'after') => host.splitActivePane(axis, placement),
    openCreateSpaceDialog: () => host.openCreateSpaceDialog(),
    openRenameWorkspaceDialog: () => host.openRenameWorkspaceDialog(),
    openCloseWorkspaceDialog: () => host.openCloseWorkspaceDialog(),
    nextTab: () => host.nextTab(),
    previousTab: () => host.previousTab(),
    selectTab: (tabId: string) => host.selectTab(tabId),
    selectWorkspace: (workspaceId: string) => host.selectWorkspace(workspaceId),
    renderOverlay: () => host.renderOverlay(),
    openPalette: () => host.openPalette(),
    closeDialog: () => host.closeDialog(),
    submitDialog: () => host.submitDialog(),
    movePaletteSelection: (delta: number) => host.movePaletteSelection(delta),
    runSelectedPaletteCommand: () => host.runSelectedPaletteCommand(),
    closeActivePane: () => host.openClosePaneDialog(),
    selectWorkspaceByIndex: (index: number) => host.selectWorkspaceByIndex(index),
  };

  return {
    commands: createWorkbenchCommandHandlers(callbacks),
    actions: createWorkbenchActionHandlers(callbacks),
    keyboard: createWorkbenchKeyboardHandlers(callbacks),
  };
}
