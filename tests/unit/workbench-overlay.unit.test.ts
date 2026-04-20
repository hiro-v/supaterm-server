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
                visualProfileId: 'supaterm.neutral-green',
                themeId: 'supaterm.theme.neutral-green',
                activeRenderer: 'libghosty-canvas',
                requestedRenderer: 'webgpu',
                rendererFallbackReason: 'fallback',
                rendererMetricsMode: 'fallback-canvas',
                rendererMetricsNote: 'WebGPU renderer metrics unavailable on canvas fallback.',
                webgpuApi: true,
                webgl2: true,
                activeBuffer: 'alternate',
                cursorX: 7,
                cursorY: 3,
                cursorVisible: true,
                cols: 80,
                rows: 24,
                scrollbackLength: 12,
                viewportY: 2,
                wrappedRowCount: 4,
                bracketedPaste: true,
                focusEvents: false,
                mouseTracking: true,
                sgrMouseMode: true,
                viewportPreview: ['ALT HEADER', 'ALT BODY'],
                styledCellCount: 12,
                atlasGlyphEntries: 48,
                atlasWidth: 1024,
                atlasHeight: 1024,
                atlasResetCount: 1,
                activeGlyphQuads: 26,
                activeRects: 9,
                rectBufferCapacityBytes: 8192,
                glyphBufferCapacityBytes: 16384,
                uploadBytes: 4096,
                frameCpuMs: 1.5,
                frameCpuAvgMs: 1.2,
                sessionReused: false,
                sessionAgeMs: 9,
                outputPumpStartedMs: 1,
                firstBackendReadMs: 118,
                firstBroadcastMs: 121,
              };
            },
          },
        }],
      ]),
      findPaneById: () => pane,
    });

    expect(overlayRoot.querySelector('.info-panel')).toBeTruthy();
    expect(overlayRoot.textContent).toContain('runtime.ready');
    expect(overlayRoot.textContent).toContain('supaterm.neutral-green');
    expect(overlayRoot.textContent).toContain('supaterm.theme.neutral-green');
    expect(overlayRoot.textContent).toContain('alternate');
    expect(overlayRoot.textContent).toContain('Canvas Fallback');
    expect(overlayRoot.textContent).toContain('WebGPU renderer metrics unavailable on canvas fallback.');
    expect(overlayRoot.textContent).toContain('7, 3');
    expect(overlayRoot.textContent).toContain('Enabled');
    expect(overlayRoot.textContent).toContain('80 × 24');
    expect(overlayRoot.textContent).toContain('12 lines');
    expect(overlayRoot.textContent).toContain('2 rows');
    expect(overlayRoot.textContent).toContain('ALT HEADER');
    expect(overlayRoot.textContent).toContain('12');
    expect(overlayRoot.textContent).toContain('48 glyphs');
    expect(overlayRoot.textContent).toContain('1024 × 1024');
    expect(overlayRoot.textContent).toContain('1 times');
    expect(overlayRoot.textContent).toContain('26 quads');
    expect(overlayRoot.textContent).toContain('9 rects');
    expect(overlayRoot.textContent).toContain('8192 bytes');
    expect(overlayRoot.textContent).toContain('16384 bytes');
    expect(overlayRoot.textContent).toContain('4096 bytes');
    expect(overlayRoot.textContent).toContain('1.50 ms');
    expect(overlayRoot.textContent).toContain('1.20 ms');
    expect(overlayRoot.textContent).toContain('Disabled');
    expect(overlayRoot.textContent).toContain('9 ms');
    expect(overlayRoot.textContent).toContain('118 ms');
    expect(overlayRoot.textContent).toContain('121 ms');
    expect(overlayRoot.textContent).toContain('60 fps');
    expect(overlayRoot.textContent).toContain('12 ms');
  });
});
