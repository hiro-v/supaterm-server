import { describe, expect, test } from 'bun:test';
import {
  addTab,
  addWorkspace,
  closePane,
  closeTab,
  closeWorkspace,
  getActivePane,
  getActiveTab,
  getActiveWorkspace,
  openClosePaneDialog,
  openRenamePaneDialog,
  renamePane,
  selectWorkspaceByIndex,
  setActivePane,
  splitPane,
} from '../../web/src/workbench/actions';
import { createInitialWorkbenchState } from '../../web/src/workbench/state';

describe('workbench actions', () => {
  test('adds and selects workspaces and tabs through state-focused helpers', () => {
    const state = createInitialWorkbenchState('seed');

    addWorkspace(state, 'seed', 'Docs');
    expect(getActiveWorkspace(state).name).toBe('Docs');

    addTab(state, 'seed');
    expect(getActiveWorkspace(state).tabs).toHaveLength(2);
    expect(getActiveTab(state).title).toBe('Tab 2');

    expect(selectWorkspaceByIndex(state, 0)).toBe(true);
    expect(getActiveWorkspace(state).name).toBe('Main');
  });

  test('splits, renames, selects, and closes panes through action helpers', () => {
    const state = createInitialWorkbenchState('seed');
    const initialPane = getActivePane(state);

    expect(splitPane(state, initialPane.id, 'row', 'after')).toBe(true);
    const createdPane = getActivePane(state);
    expect(createdPane.id).not.toBe(initialPane.id);

    expect(setActivePane(state, initialPane.id)).toBe(true);
    expect(renamePane(state, initialPane.id, 'Primary')).toBe(true);
    expect(openRenamePaneDialog(state, initialPane.id)?.value).toBe('Primary');
    expect(openClosePaneDialog(state, initialPane.id)?.scope).toBe('pane');

    const disposed = closePane(state, initialPane.id);
    expect(disposed).toEqual([initialPane.id]);
    expect(getActivePane(state).id).toBe(createdPane.id);
  });

  test('closing tabs and workspaces returns disposed pane ids', () => {
    const state = createInitialWorkbenchState('seed');
    addWorkspace(state, 'seed', 'Secondary');
    addTab(state, 'seed');
    const secondTabId = getActiveWorkspace(state).activeTabId;
    const tabDisposed = closeTab(state, secondTabId);
    expect(tabDisposed.length).toBe(1);

    const workspaceId = getActiveWorkspace(state).id;
    const workspaceDisposed = closeWorkspace(state, workspaceId);
    expect(workspaceDisposed.length).toBeGreaterThan(0);
    expect(getActiveWorkspace(state).name).toBe('Main');
  });
});
