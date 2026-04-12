import { TerminalPaneClient, type PaneTelemetry, type TerminalPaneClientOptions } from '../terminal-client';
import type { SessionConnectionDetails } from '../session';
import { listPaneIds, type PaneLeaf, type PaneNode, type TabState, type WorkspaceState } from './state';
import { iconMarkup } from './shared';

export type PaneClient = {
  start(): Promise<void>;
  activate(): void;
  dispose(): void;
  getTelemetry(): PaneTelemetry;
};

export type PaneClientFactory = (options: TerminalPaneClientOptions) => PaneClient;

export type PaneSessionResolver = (
  workspace: WorkspaceState,
  tab: TabState,
  pane: PaneLeaf,
) => SessionConnectionDetails;

export type PaneView = {
  root: HTMLDivElement;
  title: HTMLSpanElement;
  metrics: HTMLSpanElement;
  status: HTMLSpanElement;
  client: PaneClient;
};

type RenderPaneTreeOptions = {
  paneStage: HTMLDivElement;
  paneViews: Map<string, PaneView>;
  workspace: WorkspaceState;
  tab: TabState;
  createPaneClient: PaneClientFactory;
  resolveSessionConnection: PaneSessionResolver;
};

export function renderPaneTree(options: RenderPaneTreeOptions): void {
  const { paneStage, paneViews, workspace, tab, createPaneClient, resolveSessionConnection } = options;
  paneStage.replaceChildren();
  paneStage.append(
    renderPaneNode(paneViews, workspace, tab, tab.root, createPaneClient, resolveSessionConnection),
  );

  const activePaneIds = new Set(listPaneIds(tab.root));
  for (const [paneId, view] of paneViews.entries()) {
    if (!activePaneIds.has(paneId)) {
      view.client.dispose();
      view.root.remove();
      paneViews.delete(paneId);
    }
  }
}

function renderPaneNode(
  paneViews: Map<string, PaneView>,
  workspace: WorkspaceState,
  tab: TabState,
  node: PaneNode,
  createPaneClient: PaneClientFactory,
  resolveSessionConnection: PaneSessionResolver,
): HTMLElement {
  if (node.kind === 'pane') {
    const view = ensurePaneView(
      paneViews,
      workspace,
      tab,
      node,
      createPaneClient,
      resolveSessionConnection,
    );
    view.title.textContent = node.title;
    view.root.dataset.active = String(node.id === tab.activePaneId);
    void view.client.start().catch((error: unknown) => {
      view.status.textContent = error instanceof Error ? error.message : 'Failed';
      view.status.dataset.tone = 'error';
    });
    view.client.activate();
    return view.root;
  }

  const host = document.createElement('div');
  host.className = `split-host split-${node.axis}`;
  host.dataset.splitHost = node.id;
  host.style.setProperty('--split-ratio', String(node.ratio));

  const firstWrap = document.createElement('div');
  firstWrap.className = 'split-child';
  firstWrap.append(
    renderPaneNode(paneViews, workspace, tab, node.first, createPaneClient, resolveSessionConnection),
  );

  const handle = document.createElement('div');
  handle.className = `split-handle ${node.axis}`;
  handle.dataset.splitId = node.id;
  handle.dataset.axis = node.axis;

  const secondWrap = document.createElement('div');
  secondWrap.className = 'split-child';
  secondWrap.append(
    renderPaneNode(paneViews, workspace, tab, node.second, createPaneClient, resolveSessionConnection),
  );

  host.append(firstWrap, handle, secondWrap);
  return host;
}

function ensurePaneView(
  paneViews: Map<string, PaneView>,
  workspace: WorkspaceState,
  tab: TabState,
  pane: PaneLeaf,
  createPaneClient: PaneClientFactory,
  resolveSessionConnection: PaneSessionResolver,
): PaneView {
  const existing = paneViews.get(pane.id);
  if (existing) {
    return existing;
  }

  const root = document.createElement('div');
  root.className = 'pane-card';
  root.dataset.paneId = pane.id;
  root.innerHTML = `
    <div class="pane-toolbar">
      <button class="pane-heading" data-pane-id="${pane.id}">
        <span class="pane-title"></span>
      </button>
      <div class="pane-actions">
        <span class="pane-metrics">-- fps · -- ms</span>
        <span class="pane-status" data-tone="connecting">Booting…</span>
        <button class="mini-button" data-action="show-pane-info" data-pane-id="${pane.id}" title="Pane details" aria-label="Pane details">i</button>
        <button class="mini-button" data-action="rename-pane-request" data-pane-id="${pane.id}" title="Rename pane" aria-label="Rename pane">${iconMarkup('rename')}</button>
        <button class="mini-button" data-action="split-right" data-pane-id="${pane.id}" title="Split right" aria-label="Split right">→</button>
        <button class="mini-button" data-action="split-down" data-pane-id="${pane.id}" title="Split down" aria-label="Split down">↓</button>
        <button class="pane-close" data-action="close-pane" data-pane-id="${pane.id}" title="Close pane" aria-label="Close pane">${iconMarkup('close')}</button>
      </div>
    </div>
    <div class="pane-terminal"></div>
  `;

  const title = root.querySelector('.pane-title') as HTMLSpanElement;
  const metrics = root.querySelector('.pane-metrics') as HTMLSpanElement;
  const status = root.querySelector('.pane-status') as HTMLSpanElement;
  const mount = root.querySelector('.pane-terminal') as HTMLDivElement;

  const client = createPaneClient({
      mount,
      statsLabel: metrics,
      status,
      session: resolveSessionConnection(workspace, tab, pane),
    });

  const view: PaneView = { root, title, metrics, status, client };
  paneViews.set(pane.id, view);
  return view;
}

export function createDefaultPaneClientFactory(): PaneClientFactory {
  return (options) => new TerminalPaneClient(options);
}
