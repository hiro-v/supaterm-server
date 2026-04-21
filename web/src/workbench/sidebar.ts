import { formatHeaderStatus } from './commands';
import { countLeaves, workspaceMonogram, type TabState, type WorkbenchState, type WorkspaceState } from './state';
import { escapeAttribute, escapeHtml, iconMarkup } from './shared';

type HeaderRenderOptions = {
  shell: HTMLDivElement;
  workspaceTitle: HTMLSpanElement;
  headerTitle: HTMLHeadingElement;
  headerStatus: HTMLSpanElement;
  state: WorkbenchState;
  workspace: WorkspaceState;
  tab: TabState;
};

export function renderWorkbenchHeader(options: HeaderRenderOptions): void {
  const { shell, workspaceTitle, headerTitle, headerStatus, state, workspace, tab } = options;
  shell.dataset.sidebarCollapsed = String(state.sidebarCollapsed);
  workspaceTitle.textContent = workspace.name;
  headerTitle.textContent = `${workspace.name} : ${tab.title}`;
  headerStatus.textContent = formatHeaderStatus(tab);
}

export function renderSidebarTabs(
  sidebarTabs: HTMLDivElement,
  workspace: WorkspaceState,
): void {
  sidebarTabs.replaceChildren();

  for (const tab of workspace.tabs) {
    const card = document.createElement('div');
    card.className = tab.id === workspace.activeTabId ? 'tab-card active' : 'tab-card';
    card.dataset.tabId = tab.id;
    card.tabIndex = 0;
    const paneCount = countLeaves(tab.root);
    card.innerHTML = `
      <div class="tab-card-head">
        <span class="tab-card-title-wrap">
          <span class="tab-card-title">${escapeHtml(tab.title)}</span>
          <span class="tab-card-status">${tab.id === workspace.activeTabId ? 'Working' : 'Ready'}</span>
        </span>
        <span class="tab-card-actions">
          <button class="icon-button inline-icon" data-action="rename-tab-request" data-tab-id="${escapeAttribute(tab.id)}" aria-label="Rename ${escapeAttribute(tab.title)}" title="Rename tab">${iconMarkup('rename')}</button>
          <button class="icon-button inline-icon danger" data-action="close-tab-request" data-tab-id="${escapeAttribute(tab.id)}" aria-label="Close ${escapeAttribute(tab.title)}" title="Close tab">${iconMarkup('close')}</button>
        </span>
      </div>
      <div class="tab-card-meta">${paneCount} pane${paneCount === 1 ? '' : 's'}</div>
    `;
    sidebarTabs.append(card);
  }
}

export function renderWorkspaceDock(
  workspaceDock: HTMLDivElement,
  state: WorkbenchState,
): void {
  workspaceDock.replaceChildren();
  for (const [index, workspace] of state.workspaces.entries()) {
    const button = document.createElement('button');
    button.className = workspace.id === state.activeWorkspaceId ? 'space-pill active' : 'space-pill';
    button.dataset.workspaceId = workspace.id;
    button.title = workspace.name;
    button.textContent = workspaceMonogram(workspace.name, index);
    workspaceDock.append(button);
  }
}

export function renderWorkbenchFooter(footerStatus: HTMLDivElement): void {
  footerStatus.innerHTML = `
    <button data-action="open-palette" class="footer-shortcut">⌘P / ⌃⇧P Commands</button>
    <span>⌘B / ⌥⇧B Sidebar</span>
    <span>⌘T / ⌥⇧T New tab</span>
    <span>⌘D / ⌥⇧L Split right</span>
    <span>⌘⇧D / ⌥⇧J Split down</span>
    <span>⌘W / ⌥⇧W Close pane</span>
    <span>⌃1-0 / ⌥1-0 Spaces</span>
  `;
}
