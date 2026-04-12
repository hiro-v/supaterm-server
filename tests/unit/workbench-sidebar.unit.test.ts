import { describe, expect, test } from 'bun:test';
import { ensureDom } from '../helpers/dom';
import {
  renderSidebarTabs,
  renderWorkbenchFooter,
  renderWorkbenchHeader,
  renderWorkspaceDock,
} from '../../web/src/workbench/sidebar';
import { createPane, createTab, createWorkspace } from '../../web/src/workbench/state';

describe('workbench sidebar rendering', () => {
  test('renders header, tab list, workspace dock, and footer as isolated components', () => {
    ensureDom();
    const shell = document.createElement('div');
    const workspaceTitle = document.createElement('span');
    const headerTitle = document.createElement('h2');
    const headerStatus = document.createElement('span');
    const sidebarTabs = document.createElement('div');
    const workspaceDock = document.createElement('div');
    const footer = document.createElement('div');

    const workspace = createWorkspace('Main', null);
    const extraTab = createTab('Patch', null);
    extraTab.root = {
      kind: 'split',
      id: 'split.1',
      axis: 'row',
      ratio: 0.5,
      first: createPane('Console'),
      second: createPane('Logs'),
    };
    workspace.tabs.push(extraTab);
    workspace.activeTabId = extraTab.id;

    renderWorkbenchHeader({
      shell,
      workspaceTitle,
      headerTitle,
      headerStatus,
      state: {
        workspaces: [workspace],
        activeWorkspaceId: workspace.id,
        sidebarCollapsed: true,
      },
      workspace,
      tab: extraTab,
    });
    renderSidebarTabs(sidebarTabs, workspace);
    renderWorkspaceDock(workspaceDock, {
      workspaces: [workspace],
      activeWorkspaceId: workspace.id,
      sidebarCollapsed: true,
    });
    renderWorkbenchFooter(footer);

    expect(shell.dataset.sidebarCollapsed).toBe('true');
    expect(workspaceTitle.textContent).toBe('Main');
    expect(headerTitle.textContent).toBe('Main : Patch');
    expect(headerStatus.textContent).toBe('2 panes · Working');
    expect(sidebarTabs.querySelectorAll('.tab-card')).toHaveLength(2);
    expect(sidebarTabs.querySelector('.tab-card.active')?.textContent).toContain('Patch');
    expect(workspaceDock.querySelectorAll('.space-pill')).toHaveLength(1);
    expect(footer.textContent).toContain('New tab');
  });
});
