import { describe, expect, test } from 'bun:test';
import { ensureDom } from '../helpers/dom';
import { getFilteredDialogCommands, renderWorkbenchOverlay, type DialogState } from '../../web/src/workbench/overlay';
import { createPane, createTab, createWorkspace, type WorkbenchState } from '../../web/src/workbench/state';

describe('workbench overlay rendering', () => {
  test('filters palette commands and renders the command palette panel', () => {
    ensureDom();
    const overlayRoot = document.createElement('div');
    document.body.append(overlayRoot);

    const workspace = createWorkspace('Working', null);
    const tab = workspace.tabs[0]!;
    const pane = createPane('Console');
    const state: WorkbenchState = {
      workspaces: [workspace],
      activeWorkspaceId: workspace.id,
      sidebarCollapsed: false,
    };
    const dialog: DialogState = {
      type: 'palette',
      query: 'rename tab',
      selectedIndex: 0,
    };

    const commands = getFilteredDialogCommands(dialog, state, workspace, tab, pane);
    expect(commands.map((command) => command.id)).toContain('rename-tab');

    renderWorkbenchOverlay({
      overlayRoot,
      dialog,
      state,
      activeWorkspace: workspace,
      activeTab: tab,
      activePane: pane,
      paneViews: new Map(),
      findPaneById: () => pane,
    });

    expect(overlayRoot.querySelector('.palette-panel')).toBeTruthy();
    expect(overlayRoot.textContent).toContain('Rename Tab');
  });

  test('renders pane info with injected telemetry without requiring a live terminal', () => {
    ensureDom();
    const overlayRoot = document.createElement('div');
    document.body.append(overlayRoot);

    const workspace = createWorkspace('Main', null);
    const tab = workspace.tabs[0]!;
    const pane = createPane('Inspect');
    const dialog: DialogState = {
      type: 'pane-info',
      paneId: pane.id,
    };

    renderWorkbenchOverlay({
      overlayRoot,
      dialog,
      state: {
        workspaces: [workspace],
        activeWorkspaceId: workspace.id,
        sidebarCollapsed: false,
      },
      activeWorkspace: workspace,
      activeTab: tab,
      activePane: pane,
      paneViews: new Map([
        [pane.id, {
          root: document.createElement('div'),
          title: document.createElement('span'),
          metrics: document.createElement('span'),
          status: document.createElement('span'),
          client: {
            async start() {},
            activate() {},
            dispose() {},
            getTelemetry() {
              return {
                fps: 60,
                latencyMs: 12,
                sessionId: 'session:inspect',
                runtimeProfileId: 'runtime.ready',
                activeRenderer: 'libghosty-canvas',
                requestedRenderer: 'webgpu',
                rendererFallbackReason: 'fallback',
                webgpuApi: true,
                webgl2: true,
              };
            },
          },
        }],
      ]),
      findPaneById: () => pane,
    });

    expect(overlayRoot.querySelector('.info-panel')).toBeTruthy();
    expect(overlayRoot.textContent).toContain('runtime.ready');
    expect(overlayRoot.textContent).toContain('60 fps');
    expect(overlayRoot.textContent).toContain('12 ms');
  });
});
