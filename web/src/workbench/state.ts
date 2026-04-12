export type PaneLeaf = {
  kind: 'pane';
  id: string;
  title: string;
};

export type SplitNode = {
  kind: 'split';
  id: string;
  axis: 'row' | 'column';
  ratio: number;
  first: PaneNode;
  second: PaneNode;
};

export type PaneNode = PaneLeaf | SplitNode;

export type TabState = {
  id: string;
  title: string;
  root: PaneNode;
  activePaneId: string;
};

export type WorkspaceState = {
  id: string;
  name: string;
  tabs: TabState[];
  activeTabId: string;
};

export type WorkbenchState = {
  workspaces: WorkspaceState[];
  activeWorkspaceId: string;
  sidebarCollapsed: boolean;
};

export function createWorkspace(name: string, seedSessionId: string | null): WorkspaceState {
  const tab = createTab('Tab 1', seedSessionId);
  return {
    id: makeId('ws'),
    name,
    tabs: [tab],
    activeTabId: tab.id,
  };
}

export function createTab(title: string, seedSessionId: string | null = null): TabState {
  const pane = createPane(seedSessionId ? `Pane ${seedSessionId}` : 'Pane 1');
  return {
    id: makeId('tab'),
    title,
    root: pane,
    activePaneId: pane.id,
  };
}

export function createPane(title: string): PaneLeaf {
  return {
    kind: 'pane',
    id: makeId('pane'),
    title,
  };
}

export function buildPaneSessionId(workspace: WorkspaceState, tab: TabState, pane: PaneLeaf): string {
  return `${workspace.id}.${tab.id}.${pane.id}`;
}

export function findPaneNode(node: PaneNode, paneId: string): PaneLeaf | null {
  if (node.kind === 'pane') return node.id === paneId ? node : null;
  return findPaneNode(node.first, paneId) ?? findPaneNode(node.second, paneId);
}

export function findSplitNode(node: PaneNode, splitId: string): SplitNode | null {
  if (node.kind === 'pane') return null;
  if (node.id === splitId) return node;
  return findSplitNode(node.first, splitId) ?? findSplitNode(node.second, splitId);
}

export function replacePaneNode(node: PaneNode, paneId: string, replacement: PaneNode): PaneNode {
  if (node.kind === 'pane') return node.id === paneId ? replacement : node;
  return {
    ...node,
    first: replacePaneNode(node.first, paneId, replacement),
    second: replacePaneNode(node.second, paneId, replacement),
  };
}

export function removePaneNode(node: PaneNode, paneId: string): PaneNode | null {
  if (node.kind === 'pane') return node.id === paneId ? null : node;

  const first = removePaneNode(node.first, paneId);
  const second = removePaneNode(node.second, paneId);
  if (!first) return second;
  if (!second) return first;
  return { ...node, first, second };
}

export function getFirstLeaf(node: PaneNode): PaneLeaf {
  return node.kind === 'pane' ? node : getFirstLeaf(node.first);
}

export function countLeaves(node: PaneNode): number {
  return node.kind === 'pane' ? 1 : countLeaves(node.first) + countLeaves(node.second);
}

export function listPaneIds(node: PaneNode): string[] {
  return node.kind === 'pane' ? [node.id] : [...listPaneIds(node.first), ...listPaneIds(node.second)];
}

export function workspaceMonogram(name: string, fallbackIndex: number): string {
  const trimmed = name.trim();
  if (trimmed.length > 0) return trimmed[0].toUpperCase();
  return String((fallbackIndex % 10) + 1);
}

export function makeId(prefix: string): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 10)
    : Math.random().toString(36).slice(2, 12);
  return `${prefix}.${random}`;
}

function createInitialState(seedSessionId: string | null): WorkbenchState {
  const workspace = createWorkspace('Main', seedSessionId);
  return {
    workspaces: [workspace],
    activeWorkspaceId: workspace.id,
    sidebarCollapsed: false,
  };
}

export function createInitialWorkbenchState(seedSessionId: string | null): WorkbenchState {
  return createInitialState(seedSessionId);
}

export function normalizeWorkbenchState(
  parsed: Partial<WorkbenchState>,
  seedSessionId: string | null,
): WorkbenchState {
  if (!parsed.workspaces || parsed.workspaces.length === 0 || !parsed.activeWorkspaceId) {
    return createInitialState(seedSessionId);
  }

  return {
    workspaces: parsed.workspaces,
    activeWorkspaceId: parsed.activeWorkspaceId,
    sidebarCollapsed: parsed.sidebarCollapsed ?? false,
  };
}
