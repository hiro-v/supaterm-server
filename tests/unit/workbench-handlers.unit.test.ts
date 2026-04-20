import { describe, expect, test } from 'bun:test';
import {
  createWorkbenchActionHandlers,
  createWorkbenchCommandHandlers,
  createWorkbenchKeyboardHandlers,
} from '../../web/src/workbench/handlers';

function createCallbacks() {
  const calls: string[] = [];
  return {
    calls,
    callbacks: {
      addTab: () => calls.push('addTab'),
      toggleSidebar: () => calls.push('toggleSidebar'),
      openRenameTabDialog: () => calls.push('openRenameTabDialog'),
      openRenamePaneDialog: () => calls.push('openRenamePaneDialog'),
      openCloseTabDialog: () => calls.push('openCloseTabDialog'),
      openClosePaneDialog: () => calls.push('openClosePaneDialog'),
      splitActivePane: (axis: 'row' | 'column', placement: 'before' | 'after') => calls.push(`split:${axis}:${placement}`),
      openCreateSpaceDialog: () => calls.push('openCreateSpaceDialog'),
      openRenameWorkspaceDialog: () => calls.push('openRenameWorkspaceDialog'),
      openCloseWorkspaceDialog: () => calls.push('openCloseWorkspaceDialog'),
      nextTab: () => calls.push('nextTab'),
      previousTab: () => calls.push('previousTab'),
      selectTab: (tabId: string) => calls.push(`selectTab:${tabId}`),
      selectWorkspace: (workspaceId: string) => calls.push(`selectWorkspace:${workspaceId}`),
      renderOverlay: () => calls.push('renderOverlay'),
      openPalette: () => calls.push('openPalette'),
      closeDialog: () => calls.push('closeDialog'),
      submitDialog: () => calls.push('submitDialog'),
      movePaletteSelection: (delta: number) => calls.push(`movePaletteSelection:${delta}`),
      runSelectedPaletteCommand: () => calls.push('runSelectedPaletteCommand'),
      closeActivePane: () => calls.push('closeActivePane'),
      selectWorkspaceByIndex: (index: number) => calls.push(`selectWorkspaceByIndex:${index}`),
    },
  };
}

describe('workbench handlers', () => {
  test('maps callbacks into command handlers without changing behavior', () => {
    const { calls, callbacks } = createCallbacks();
    const handlers = createWorkbenchCommandHandlers(callbacks);
    handlers.splitActivePane('row', 'after');
    handlers.selectWorkspace('ws.1');
    expect(calls).toEqual(['split:row:after', 'selectWorkspace:ws.1']);
  });

  test('uses close confirmation dialogs for keyboard close flows', () => {
    const { calls, callbacks } = createCallbacks();
    const handlers = createWorkbenchKeyboardHandlers(callbacks);
    handlers.closeTab();
    handlers.closeActivePane();
    expect(calls).toEqual(['openCloseTabDialog', 'openClosePaneDialog']);
  });

  test('maps callbacks into action handlers', () => {
    const { calls, callbacks } = createCallbacks();
    const handlers = createWorkbenchActionHandlers(callbacks);
    handlers.openPalette();
    handlers.submitDialog();
    expect(calls).toEqual(['openPalette', 'submitDialog']);
  });
});
