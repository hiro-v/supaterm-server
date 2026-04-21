import { describe, expect, test } from 'bun:test';
import { ensureDom } from '../helpers/dom';
import { renderPaneTree, type PaneClientFactory } from '../../web/src/workbench/panes';
import { createPane, createTab, createWorkspace, type PaneLeaf } from '../../web/src/workbench/state';

function createTestRoot(): HTMLDivElement {
  ensureDom();
  const root = document.createElement('div');
  document.body.append(root);
  return root;
}

describe('workbench pane tree', () => {
  test('creates pane clients through the injected factory and disposes removed panes', async () => {
    const paneStage = createTestRoot();
    const workspace = createWorkspace('Main', null);
    const tab = createTab('Tab 1', null);
    workspace.tabs = [tab];
    workspace.activeTabId = tab.id;

    const disposed: string[] = [];
    const created: string[] = [];
    const paneViews = new Map();

    const createPaneClient: PaneClientFactory = ({ session }) => {
      created.push(session.sessionId);
      return {
        async start() {},
        activate() {},
        dispose() {
          disposed.push(session.sessionId);
        },
        getTelemetry() {
          return {
            fps: null,
            latencyMs: null,
            sessionId: session.sessionId,
            runtimeProfileId: 'runtime',
            visualProfileId: 'supaterm.blackout',
            themeId: 'supaterm.theme.blackout',
            activeRenderer: 'libghosty-canvas',
            requestedRenderer: 'webgpu',
            rendererFallbackReason: null,
            rendererMetricsMode: 'fallback-canvas',
            rendererMetricsNote: 'WebGPU renderer metrics unavailable on canvas fallback.',
            webgpuApi: false,
            webgl2: true,
            activeBuffer: 'normal',
            cursorX: 1,
            cursorY: 0,
            cursorVisible: true,
            cols: 80,
            rows: 24,
            scrollbackLength: 0,
            viewportY: 0,
            wrappedRowCount: 0,
            bracketedPaste: false,
            focusEvents: false,
            mouseTracking: false,
            sgrMouseMode: false,
            viewportPreview: ['session:preview'],
            styledCellCount: 3,
            atlasGlyphEntries: null,
            atlasWidth: null,
            atlasHeight: null,
            atlasResetCount: null,
            activeGlyphQuads: null,
            activeRects: null,
            rectBufferCapacityBytes: null,
            glyphBufferCapacityBytes: null,
            uploadBytes: null,
            frameCpuMs: null,
            frameCpuAvgMs: null,
            sessionReused: null,
            sessionAgeMs: null,
            outputPumpStartedMs: null,
            firstBackendReadMs: null,
            firstBroadcastMs: null,
          };
        },
      };
    };

    const resolveSessionConnection = (_workspace: typeof workspace, _tab: typeof tab, pane: PaneLeaf) => ({
      sessionId: `session:${pane.id}`,
      token: null,
      shell: pane.shell,
    });

    const secondPane = createPane('Pane 2');
    tab.root = {
      kind: 'split',
      id: 'split.1',
      axis: 'row',
      ratio: 0.5,
      first: getFirstPane(tab.root),
      second: secondPane,
    };
    tab.activePaneId = secondPane.id;

    renderPaneTree({
      paneStage,
      paneViews,
      workspace,
      tab,
      createPaneClient,
      resolveSessionConnection,
    });

    expect(created).toHaveLength(2);
    expect(paneViews.size).toBe(2);

    tab.root = getFirstPane(tab.root);
    tab.activePaneId = tab.root.id;

    renderPaneTree({
      paneStage,
      paneViews,
      workspace,
      tab,
      createPaneClient,
      resolveSessionConnection,
    });

    expect(disposed).toContain(`session:${secondPane.id}`);
    expect(paneViews.size).toBe(1);
    paneStage.remove();
  });
});

function getFirstPane(node: ReturnType<typeof createTab>['root']): PaneLeaf {
  return node.kind === 'pane' ? node : getFirstPane(node.first);
}
