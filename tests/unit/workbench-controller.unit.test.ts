import { describe, expect, test } from 'bun:test';
import {
  executeWorkbenchActionIntent,
  executeWorkbenchCommand,
  executeWorkbenchKeyboardIntent,
} from '../../web/src/workbench/controller';

describe('workbench controller dispatch', () => {
  test('maps command ids onto command handlers', () => {
    const calls: string[] = [];
    executeWorkbenchCommand('split-right', {
      addTab: () => calls.push('addTab'),
      toggleSidebar: () => calls.push('toggleSidebar'),
      openRenameTabDialog: () => calls.push('openRenameTabDialog'),
      openRenamePaneDialog: () => calls.push('openRenamePaneDialog'),
      openCloseTabDialog: () => calls.push('openCloseTabDialog'),
      splitActivePane: (axis, placement) => calls.push(`split:${axis}:${placement}`),
      openCreateSpaceDialog: () => calls.push('openCreateSpaceDialog'),
      openRenameWorkspaceDialog: () => calls.push('openRenameWorkspaceDialog'),
      openCloseWorkspaceDialog: () => calls.push('openCloseWorkspaceDialog'),
      nextTab: () => calls.push('nextTab'),
      previousTab: () => calls.push('previousTab'),
      selectTab: (tabId) => calls.push(`tab:${tabId}`),
      selectWorkspace: (workspaceId) => calls.push(`space:${workspaceId}`),
      renderOverlay: () => calls.push('renderOverlay'),
    });
    executeWorkbenchCommand('select-space:ws.2', {
      addTab: () => calls.push('addTab'),
      toggleSidebar: () => calls.push('toggleSidebar'),
      openRenameTabDialog: () => calls.push('openRenameTabDialog'),
      openRenamePaneDialog: () => calls.push('openRenamePaneDialog'),
      openCloseTabDialog: () => calls.push('openCloseTabDialog'),
      splitActivePane: (axis, placement) => calls.push(`split:${axis}:${placement}`),
      openCreateSpaceDialog: () => calls.push('openCreateSpaceDialog'),
      openRenameWorkspaceDialog: () => calls.push('openRenameWorkspaceDialog'),
      openCloseWorkspaceDialog: () => calls.push('openCloseWorkspaceDialog'),
      nextTab: () => calls.push('nextTab'),
      previousTab: () => calls.push('previousTab'),
      selectTab: (tabId) => calls.push(`tab:${tabId}`),
      selectWorkspace: (workspaceId) => calls.push(`space:${workspaceId}`),
      renderOverlay: () => calls.push('renderOverlay'),
    });

    expect(calls).toEqual(['split:row:after', 'space:ws.2']);
  });

  test('maps action and keyboard intents onto focused handlers', () => {
    const calls: string[] = [];
    executeWorkbenchActionIntent('dialog-submit', {
      openCreateSpaceDialog: () => calls.push('openCreate'),
      addTab: () => calls.push('addTab'),
      openRenameWorkspaceDialog: () => calls.push('renameWorkspace'),
      openCloseWorkspaceDialog: () => calls.push('closeWorkspace'),
      toggleSidebar: () => calls.push('toggleSidebar'),
      openPalette: () => calls.push('openPalette'),
      closeDialog: () => calls.push('closeDialog'),
      submitDialog: () => calls.push('submitDialog'),
    });
    executeWorkbenchKeyboardIntent({ type: 'select-workspace-index', index: 3 }, {
      closeDialog: () => calls.push('closeDialog'),
      submitDialog: () => calls.push('submitDialog'),
      movePaletteSelection: (delta) => calls.push(`move:${delta}`),
      runSelectedPaletteCommand: () => calls.push('runSelected'),
      openPalette: () => calls.push('openPalette'),
      addTab: () => calls.push('addTab'),
      toggleSidebar: () => calls.push('toggleSidebar'),
      splitActivePane: (axis, placement) => calls.push(`split:${axis}:${placement}`),
      closeTab: () => calls.push('closeTab'),
      closeActivePane: () => calls.push('closeActivePane'),
      previousTab: () => calls.push('previousTab'),
      nextTab: () => calls.push('nextTab'),
      selectWorkspaceByIndex: (index) => calls.push(`workspace:${index}`),
    });

    expect(calls).toEqual(['submitDialog', 'workspace:3']);
  });
});
