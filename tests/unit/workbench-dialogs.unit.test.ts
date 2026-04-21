import { describe, expect, test } from 'bun:test';
import { movePaletteSelection, submitWorkbenchDialog } from '../../web/src/workbench/dialogs';
import { createInitialWorkbenchState, getFirstLeaf } from '../../web/src/workbench/state';

describe('workbench dialog helpers', () => {
  test('submits rename and create dialogs as state commits', () => {
    const state = createInitialWorkbenchState('seed');
    const workspaceId = state.activeWorkspaceId;
    const tabId = state.workspaces[0]!.activeTabId;
    const paneId = getFirstLeaf(state.workspaces[0]!.tabs[0]!.root).id;

    expect(submitWorkbenchDialog(state, {
      type: 'rename-space',
      workspaceId,
      value: 'Docs',
    }, 'seed')).toEqual({ kind: 'commit', disposedPaneIds: [] });
    expect(state.workspaces[0]!.name).toBe('Docs');

    expect(submitWorkbenchDialog(state, {
      type: 'rename-tab',
      tabId,
      value: 'Shell',
    }, 'seed')).toEqual({ kind: 'commit', disposedPaneIds: [] });
    expect(state.workspaces[0]!.tabs[0]!.title).toBe('Shell');

    expect(submitWorkbenchDialog(state, {
      type: 'rename-pane',
      paneId,
      value: 'Primary',
    }, 'seed')).toEqual({ kind: 'commit', disposedPaneIds: [] });
    expect(getFirstLeaf(state.workspaces[0]!.tabs[0]!.root).title).toBe('Primary');

    expect(submitWorkbenchDialog(state, {
      type: 'create-space',
      value: 'Next',
    }, 'seed')).toEqual({ kind: 'commit', disposedPaneIds: [] });
    expect(state.workspaces).toHaveLength(2);
    expect(state.workspaces[1]!.name).toBe('Next');
  });

  test('submits palette dialogs as runnable commands and supports movement', () => {
    const state = createInitialWorkbenchState('seed');
    const dialog = {
      type: 'palette' as const,
      query: 'rename',
      selectedIndex: 0,
    };

    expect(movePaletteSelection(dialog, state, 1)).toBe(true);
    expect(dialog.selectedIndex).toBeGreaterThanOrEqual(0);
    expect(submitWorkbenchDialog(state, dialog, 'seed').kind).toBe('run-command');
  });

  test('submits confirm-close dialogs and returns disposed pane ids', () => {
    const state = createInitialWorkbenchState('seed');
    const paneId = state.workspaces[0]!.tabs[0]!.activePaneId;
    const secondPaneResult = submitWorkbenchDialog(state, {
      type: 'create-space',
      value: 'Second',
    }, 'seed');
    expect(secondPaneResult.kind).toBe('commit');

    const workspaceId = state.workspaces[1]!.id;
    const result = submitWorkbenchDialog(state, {
      type: 'confirm-close',
      scope: 'workspace',
      targetId: workspaceId,
      heading: 'Close Space?',
      detail: 'detail',
      confirmLabel: 'Close Space',
    }, 'seed');

    expect(result.kind).toBe('commit');
    if (result.kind === 'commit') {
      expect(result.disposedPaneIds.length).toBeGreaterThan(0);
    }

    expect(submitWorkbenchDialog(state, {
      type: 'pane-info',
      paneId,
      shell: 'system',
    }, 'seed')).toEqual({ kind: 'commit', disposedPaneIds: [] });

    expect(submitWorkbenchDialog(state, {
      type: 'appearance',
      appearance: {
        ...state.appearance,
        fontSize: 18,
      },
    }, 'seed')).toEqual({ kind: 'commit', disposedPaneIds: [] });
    expect(state.appearance.fontSize).toBe(18);
  });
});
