import { describe, expect, test } from 'bun:test';
import { ensureDom } from '../helpers/dom';
import { splitPane } from '../../web/src/workbench/actions';
import { beginWorkbenchResize, updateWorkbenchResize } from '../../web/src/workbench/resize';
import { createWorkspace, type WorkbenchState } from '../../web/src/workbench/state';

describe('workbench resize helpers', () => {
  test('starts and applies split-handle resize updates', () => {
    ensureDom();

    const workspace = createWorkspace('Main', null);
    const state: WorkbenchState = {
      workspaces: [workspace],
      activeWorkspaceId: workspace.id,
      sidebarCollapsed: false,
    };
    const tab = workspace.tabs[0]!;
    const originalPaneId = tab.activePaneId;
    expect(splitPane(state, originalPaneId, 'row', 'after')).toBe(true);
    expect(tab.root.kind).toBe('split');

    const split = tab.root.kind === 'split' ? tab.root : null;
    expect(split).not.toBeNull();
    if (!split) return;

    const host = document.createElement('div');
    host.dataset.splitHost = split.id;
    Object.defineProperty(host, 'getBoundingClientRect', {
      value: () => ({ width: 400, height: 240 }),
    });

    const handle = document.createElement('button');
    handle.className = 'split-handle';
    handle.dataset.splitId = split.id;
    handle.dataset.axis = 'row';
    host.append(handle);
    document.body.append(host);

    const resizeState = beginWorkbenchResize(handle, tab, { clientX: 100, clientY: 10 });
    expect(resizeState).not.toBeNull();
    if (!resizeState) return;

    const updated = updateWorkbenchResize(resizeState, tab, document.body, { clientX: 180, clientY: 10 });
    expect(updated).toBe(true);
    expect(split.ratio).toBeCloseTo(0.7, 3);
  });

  test('ignores non-split targets', () => {
    ensureDom();
    const workspace = createWorkspace('Main', null);
    const tab = workspace.tabs[0]!;
    const target = document.createElement('div');

    expect(beginWorkbenchResize(target, tab, { clientX: 0, clientY: 0 })).toBeNull();
  });
});
