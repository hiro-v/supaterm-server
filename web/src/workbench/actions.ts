import type { DialogState } from './overlay';
import type { PaneShell } from '../session';
import {
  cloneWorkbenchAppearance,
  normalizeWorkbenchAppearance,
  type WorkbenchAppearance,
} from './appearance';
import {
  countLeaves,
  createPane,
  createTab,
  createWorkspace,
  findPaneNode,
  getFirstLeaf,
  listPaneIds,
  makeId,
  removePaneNode,
  replacePaneNode,
  type PaneLeaf,
  type TabState,
  type WorkbenchState,
  type WorkspaceState,
} from './state';

export function getActiveWorkspace(state: WorkbenchState): WorkspaceState {
  return state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId) ?? state.workspaces[0]!;
}

export function getActiveTab(state: WorkbenchState): TabState {
  const workspace = getActiveWorkspace(state);
  return workspace.tabs.find((tab) => tab.id === workspace.activeTabId) ?? workspace.tabs[0]!;
}

export function getActivePane(state: WorkbenchState): PaneLeaf {
  const tab = getActiveTab(state);
  return findPaneNode(tab.root, tab.activePaneId) ?? getFirstLeaf(tab.root);
}

export function findPaneById(state: WorkbenchState, paneId: string): PaneLeaf | null {
  return findPaneNode(getActiveTab(state).root, paneId);
}

export function openPaletteDialog(): DialogState {
  return {
    type: 'palette',
    query: '',
    selectedIndex: 0,
  };
}

export function openCreateSpaceDialog(state: WorkbenchState): DialogState {
  return {
    type: 'create-space',
    value: `Space ${state.workspaces.length + 1}`,
  };
}

export function openRenameWorkspaceDialog(state: WorkbenchState, workspaceId = getActiveWorkspace(state).id): DialogState | null {
  const workspace = state.workspaces.find((item) => item.id === workspaceId);
  if (!workspace) return null;
  return {
    type: 'rename-space',
    workspaceId,
    value: workspace.name,
  };
}

export function openRenameTabDialog(state: WorkbenchState, tabId = getActiveTab(state).id): DialogState | null {
  const tab = getActiveWorkspace(state).tabs.find((item) => item.id === tabId);
  if (!tab) return null;
  return {
    type: 'rename-tab',
    tabId,
    value: tab.title,
  };
}

export function openRenamePaneDialog(state: WorkbenchState, paneId = getActiveTab(state).activePaneId): DialogState | null {
  const pane = findPaneById(state, paneId);
  if (!pane) return null;
  return {
    type: 'rename-pane',
    paneId,
    value: pane.title,
  };
}

export function openPaneInfoDialog(state: WorkbenchState, paneId = getActiveTab(state).activePaneId): DialogState {
  const pane = findPaneById(state, paneId);
  return {
    type: 'pane-info',
    paneId,
    shell: pane?.shell ?? 'system',
  };
}

export function openAppearanceDialog(state: WorkbenchState): DialogState {
  return {
    type: 'appearance',
    appearance: cloneWorkbenchAppearance(state.appearance),
  };
}

export function openCloseWorkspaceDialog(state: WorkbenchState, workspaceId = getActiveWorkspace(state).id): DialogState | null {
  const workspace = state.workspaces.find((item) => item.id === workspaceId);
  if (!workspace || state.workspaces.length === 1) return null;
  return {
    type: 'confirm-close',
    scope: 'workspace',
    targetId: workspaceId,
    heading: 'Close Space?',
    detail: `Close ${workspace.name} and remove all of its tabs from this web layout?`,
    confirmLabel: 'Close Space',
  };
}

export function openCloseTabDialog(state: WorkbenchState, tabId = getActiveTab(state).id): DialogState | null {
  const workspace = getActiveWorkspace(state);
  const tab = workspace.tabs.find((item) => item.id === tabId);
  if (!tab || workspace.tabs.length === 1) return null;
  return {
    type: 'confirm-close',
    scope: 'tab',
    targetId: tabId,
    heading: 'Close Tab?',
    detail: `Close ${tab.title} and remove its pane layout from this web workspace?`,
    confirmLabel: 'Close Tab',
  };
}

export function openClosePaneDialog(state: WorkbenchState, paneId = getActiveTab(state).activePaneId): DialogState | null {
  const pane = findPaneById(state, paneId);
  if (!pane || countLeaves(getActiveTab(state).root) === 1) return null;
  return {
    type: 'confirm-close',
    scope: 'pane',
    targetId: paneId,
    heading: 'Close Pane?',
    detail: `Close ${pane.title}? The split layout will update immediately.`,
    confirmLabel: 'Close Pane',
  };
}

export function renameWorkspace(state: WorkbenchState, workspaceId: string, name: string): boolean {
  const workspace = state.workspaces.find((item) => item.id === workspaceId);
  if (!workspace) return false;
  workspace.name = name;
  return true;
}

export function renameTab(state: WorkbenchState, tabId: string, title: string): boolean {
  const tab = getActiveWorkspace(state).tabs.find((item) => item.id === tabId);
  if (!tab) return false;
  tab.title = title;
  return true;
}

export function renamePane(state: WorkbenchState, paneId: string, title: string): boolean {
  const pane = findPaneById(state, paneId);
  if (!pane) return false;
  pane.title = title;
  return true;
}

export function setPaneShell(state: WorkbenchState, paneId: string, shell: PaneShell): boolean {
  const pane = findPaneById(state, paneId);
  if (!pane) return false;
  pane.shell = shell;
  return true;
}

export function setWorkbenchAppearance(state: WorkbenchState, appearance: WorkbenchAppearance): boolean {
  state.appearance = normalizeWorkbenchAppearance(appearance);
  return true;
}

export function setActiveWorkspace(state: WorkbenchState, workspaceId: string): boolean {
  if (!state.workspaces.some((workspace) => workspace.id === workspaceId)) return false;
  state.activeWorkspaceId = workspaceId;
  return true;
}

export function setActiveTab(state: WorkbenchState, tabId: string): boolean {
  const workspace = getActiveWorkspace(state);
  if (!workspace.tabs.some((tab) => tab.id === tabId)) return false;
  workspace.activeTabId = tabId;
  return true;
}

export function setActivePane(state: WorkbenchState, paneId: string): boolean {
  const tab = getActiveTab(state);
  if (!findPaneNode(tab.root, paneId)) return false;
  tab.activePaneId = paneId;
  return true;
}

export function toggleSidebar(state: WorkbenchState): void {
  state.sidebarCollapsed = !state.sidebarCollapsed;
}

export function addWorkspace(state: WorkbenchState, seedSessionId: string | null, name = `Space ${state.workspaces.length + 1}`): void {
  const workspace = createWorkspace(name, seedSessionId);
  state.workspaces.push(workspace);
  state.activeWorkspaceId = workspace.id;
}

export function closeWorkspace(state: WorkbenchState, workspaceId = getActiveWorkspace(state).id): string[] {
  if (state.workspaces.length === 1) return [];
  const workspace = state.workspaces.find((item) => item.id === workspaceId);
  if (!workspace) return [];
  const disposedPaneIds = workspace.tabs.flatMap((tab) => listPaneIds(tab.root));
  state.workspaces = state.workspaces.filter((item) => item.id !== workspaceId);
  if (state.activeWorkspaceId === workspaceId) {
    state.activeWorkspaceId = state.workspaces[0]!.id;
  }
  return disposedPaneIds;
}

export function addTab(state: WorkbenchState, seedSessionId: string | null): void {
  const workspace = getActiveWorkspace(state);
  const tab = createTab(`Tab ${workspace.tabs.length + 1}`, seedSessionId);
  workspace.tabs.push(tab);
  workspace.activeTabId = tab.id;
}

export function closeTab(state: WorkbenchState, tabId = getActiveTab(state).id): string[] {
  const workspace = getActiveWorkspace(state);
  if (workspace.tabs.length === 1) return [];
  const currentTab = workspace.tabs.find((tab) => tab.id === tabId);
  if (!currentTab) return [];
  const disposedPaneIds = listPaneIds(currentTab.root);
  workspace.tabs = workspace.tabs.filter((tab) => tab.id !== tabId);
  if (workspace.activeTabId === tabId) {
    workspace.activeTabId = workspace.tabs[0]!.id;
  }
  return disposedPaneIds;
}

export function nextTab(state: WorkbenchState): void {
  const workspace = getActiveWorkspace(state);
  const currentIndex = workspace.tabs.findIndex((tab) => tab.id === workspace.activeTabId);
  const nextIndex = (currentIndex + 1) % workspace.tabs.length;
  workspace.activeTabId = workspace.tabs[nextIndex]!.id;
}

export function previousTab(state: WorkbenchState): void {
  const workspace = getActiveWorkspace(state);
  const currentIndex = workspace.tabs.findIndex((tab) => tab.id === workspace.activeTabId);
  const nextIndex = (currentIndex - 1 + workspace.tabs.length) % workspace.tabs.length;
  workspace.activeTabId = workspace.tabs[nextIndex]!.id;
}

export function selectWorkspaceByIndex(state: WorkbenchState, index: number): boolean {
  const workspace = state.workspaces[index];
  if (!workspace) return false;
  state.activeWorkspaceId = workspace.id;
  return true;
}

export function splitPane(
  state: WorkbenchState,
  paneId: string,
  axis: 'row' | 'column',
  placement: 'before' | 'after',
): boolean {
  const tab = getActiveTab(state);
  const target = findPaneNode(tab.root, paneId);
  if (!target) return false;

  const newPane = createPane(`Pane ${countLeaves(tab.root) + 1}`);
  const first = placement === 'before' ? newPane : target;
  const second = placement === 'before' ? target : newPane;
  tab.root = replacePaneNode(tab.root, paneId, {
    kind: 'split',
    id: makeId('split'),
    axis,
    ratio: 0.5,
    first,
    second,
  });
  tab.activePaneId = newPane.id;
  return true;
}

export function closePane(state: WorkbenchState, paneId: string): string[] {
  const tab = getActiveTab(state);
  if (countLeaves(tab.root) === 1) return [];
  tab.root = removePaneNode(tab.root, paneId) ?? tab.root;
  tab.activePaneId = getFirstLeaf(tab.root).id;
  return [paneId];
}
