import { describe, expect, test } from 'bun:test';
import { buildWorkbenchCommands, filterWorkbenchCommands, formatHeaderStatus } from '../../web/src/workbench/commands';
import { createPane, createTab, createWorkspace } from '../../web/src/workbench/state';

describe('workbench commands', () => {
  test('builds workspace and navigation commands from active context', () => {
    const workspace = createWorkspace('Main', null);
    const tab = createTab('Build', null);
    workspace.tabs.push(tab);
    workspace.activeTabId = tab.id;
    const pane = createPane('Console');
    tab.root = {
      kind: 'split',
      id: 'split.1',
      axis: 'row',
      ratio: 0.5,
      first: pane,
      second: createPane('Logs'),
    };
    tab.activePaneId = pane.id;

    const commands = buildWorkbenchCommands(
      {
        workspaces: [workspace],
        activeWorkspaceId: workspace.id,
        sidebarCollapsed: false,
      },
      workspace,
      tab,
      pane,
    );

    expect(commands.some((command) => command.id === 'rename-pane' && command.detail.includes('Console'))).toBe(true);
    expect(commands.some((command) => command.id === `select-tab:${workspace.tabs[0]!.id}`)).toBe(true);
    expect(commands.some((command) => command.id === `select-tab:${tab.id}`)).toBe(true);
  });

  test('filters commands by aliases and label text', () => {
    const workspace = createWorkspace('Working', null);
    const tab = workspace.tabs[0]!;
    const pane = createPane('Console');

    const commands = buildWorkbenchCommands(
      {
        workspaces: [workspace],
        activeWorkspaceId: workspace.id,
        sidebarCollapsed: true,
      },
      workspace,
      tab,
      pane,
    );

    const filtered = filterWorkbenchCommands(commands, 'rename workspace');
    expect(filtered.map((command) => command.id)).toContain('rename-space');
  });

  test('formats header status from pane count', () => {
    const tab = createTab('Status', null);
    tab.root = {
      kind: 'split',
      id: 'split.2',
      axis: 'column',
      ratio: 0.5,
      first: createPane('A'),
      second: createPane('B'),
    };

    expect(formatHeaderStatus(tab)).toBe('2 panes · Working');
  });
});
