import { describe, expect, test } from 'bun:test';
import {
  countLeaves,
  createInitialWorkbenchState,
  createPane,
  createWorkspace,
  getFirstLeaf,
  normalizeWorkbenchState,
  removePaneNode,
  replacePaneNode,
  type PaneNode,
} from '../../web/src/workbench/state';

describe('workbench state', () => {
  test('creates an initial state when parsed state is incomplete', () => {
    const state = normalizeWorkbenchState({}, 'seed');
    expect(state.workspaces).toHaveLength(1);
    expect(state.workspaces[0]?.name).toBe('Main');
    expect(state.activeWorkspaceId).toBe(state.workspaces[0]?.id);
  });

  test('preserves explicit sidebar preference during normalization', () => {
    const initial = createInitialWorkbenchState(null);
    const state = normalizeWorkbenchState({
      workspaces: initial.workspaces,
      activeWorkspaceId: initial.activeWorkspaceId,
      sidebarCollapsed: true,
    }, null);

    expect(state.sidebarCollapsed).toBe(true);
  });

  test('replaces and removes pane nodes without leaking split structure', () => {
    const workspace = createWorkspace('Test', null);
    const originalPane = getFirstLeaf(workspace.tabs[0]!.root);
    const replacement = createPane('Replacement');
    const replaced = replacePaneNode(workspace.tabs[0]!.root, originalPane.id, replacement);

    expect(getFirstLeaf(replaced).title).toBe('Replacement');

    const splitTree: PaneNode = {
      kind: 'split',
      id: 'split.a',
      axis: 'row',
      ratio: 0.5,
      first: createPane('Left'),
      second: createPane('Right'),
    };

    const collapsed = removePaneNode(splitTree, splitTree.first.id);
    expect(collapsed?.kind).toBe('pane');
    expect(countLeaves(collapsed!)).toBe(1);
    expect(getFirstLeaf(collapsed!).title).toBe('Right');
  });
});
