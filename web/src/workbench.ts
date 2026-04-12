import { type SessionConnectionDetails, type SessionQuery } from './session';
import { type DialogState, getFilteredDialogCommands, renderWorkbenchOverlay } from './workbench/overlay';
import {
  createDefaultPaneClientFactory,
  type PaneClientFactory,
  type PaneSessionResolver,
  type PaneView,
  renderPaneTree,
} from './workbench/panes';
import {
  createLocalStorageWorkbenchPersistence,
  type WorkbenchPersistence,
} from './workbench/persistence';
import { renderWorkbenchFooter, renderWorkbenchHeader, renderSidebarTabs, renderWorkspaceDock } from './workbench/sidebar';
import {
  buildPaneSessionId,
  countLeaves,
  createPane,
  createTab,
  createWorkspace,
  findPaneNode,
  findSplitNode,
  getFirstLeaf,
  listPaneIds,
  makeId,
  removePaneNode,
  replacePaneNode,
  type PaneLeaf,
  type TabState,
  type WorkbenchState,
  type WorkspaceState,
} from './workbench/state';
import { clamp, iconMarkup } from './workbench/shared';

type ResizeState = {
  splitId: string;
  axis: 'row' | 'column';
  startPointer: number;
  startRatio: number;
};

export type WorkbenchDependencies = {
  persistence: WorkbenchPersistence;
  createPaneClient: PaneClientFactory;
  resolveSessionConnection: PaneSessionResolver;
};

function createDefaultWorkbenchDependencies(
  sessionQuery: SessionQuery,
): WorkbenchDependencies {
  return {
    persistence: createLocalStorageWorkbenchPersistence(),
    createPaneClient: createDefaultPaneClientFactory(),
    resolveSessionConnection(workspace, tab, pane) {
      return {
        sessionId: buildPaneSessionId(workspace, tab, pane),
        token: sessionQuery.token,
      };
    },
  };
}

export class SupatermWorkbench {
  private readonly root: HTMLDivElement;
  private readonly sessionQuery: SessionQuery;
  private readonly deps: WorkbenchDependencies;
  private state: WorkbenchState;
  private resizeState: ResizeState | null = null;
  private dialog: DialogState | null = null;

  private readonly paneViews = new Map<string, PaneView>();

  private shell!: HTMLDivElement;
  private sidebarTabs!: HTMLDivElement;
  private workspaceDock!: HTMLDivElement;
  private workspaceTitle!: HTMLSpanElement;
  private headerTitle!: HTMLHeadingElement;
  private headerStatus!: HTMLSpanElement;
  private paneStage!: HTMLDivElement;
  private footerStatus!: HTMLDivElement;
  private overlayRoot!: HTMLDivElement;

  constructor(
    root: HTMLDivElement,
    sessionQuery: SessionQuery,
    dependencies: Partial<WorkbenchDependencies> = {},
  ) {
    this.root = root;
    this.sessionQuery = sessionQuery;
    const defaults = createDefaultWorkbenchDependencies(sessionQuery);
    this.deps = {
      persistence: dependencies.persistence ?? defaults.persistence,
      createPaneClient: dependencies.createPaneClient ?? defaults.createPaneClient,
      resolveSessionConnection: dependencies.resolveSessionConnection ?? defaults.resolveSessionConnection,
    };
    this.state = this.deps.persistence.load(sessionQuery.sessionId);
  }

  mount(): void {
    this.root.innerHTML = `
      <div class="workbench-app">
        <div class="workbench-shell" data-role="workbench-shell">
          <aside class="sidebar-shell">
            <div class="sidebar-brand">
              <div class="sidebar-brand-row">
                <div class="brand-mark">supaterm</div>
              </div>
              <div class="workspace-chip">
                <span class="workspace-chip-dot"></span>
                <span class="workspace-chip-title" data-role="workspace-title"></span>
                <span class="workspace-chip-actions">
                  <button data-action="rename-workspace" class="icon-button inline-icon" aria-label="Rename active space" title="Rename space">${iconMarkup('rename')}</button>
                  <button data-action="close-workspace" class="icon-button inline-icon danger" aria-label="Delete active space" title="Delete space">${iconMarkup('close')}</button>
                </span>
              </div>
            </div>
            <section class="sidebar-tabs-section">
              <div class="sidebar-section-row">
                <div class="sidebar-section-label">Tabs</div>
              </div>
              <div class="sidebar-tabs" data-role="sidebar-tabs"></div>
            </section>
            <button data-action="new-tab" class="sidebar-new-tab" aria-label="New Tab">
              <span class="sidebar-new-tab-plus">+</span>
              <span>New Tab</span>
            </button>
            <div class="space-dock">
              <div class="space-dock-list" data-role="workspace-dock"></div>
              <button data-action="new-workspace" class="space-dock-add" aria-label="Add space">+</button>
            </div>
          </aside>
          <main class="workbench-main">
            <header class="workbench-header">
              <div class="window-title">
                <button data-action="toggle-sidebar" class="icon-button inline-icon" aria-label="Toggle sidebar" title="Toggle sidebar">${iconMarkup('sidebar')}</button>
                <h2 data-role="header-title"></h2>
              </div>
              <div class="header-toolbar">
                <div class="window-status" data-role="header-status"></div>
                <button data-action="open-palette" class="icon-button inline-icon subtle" aria-label="Open command palette" title="Open command palette">${iconMarkup('command')}</button>
              </div>
            </header>
            <section class="pane-stage" data-role="pane-stage"></section>
            <footer class="footer-status" data-role="footer-status"></footer>
          </main>
        </div>
        <div class="overlay-root" data-role="overlay-root"></div>
      </div>
    `;

    this.shell = this.getRole('workbench-shell');
    this.sidebarTabs = this.getRole('sidebar-tabs');
    this.workspaceDock = this.getRole('workspace-dock');
    this.workspaceTitle = this.getRole('workspace-title') as HTMLSpanElement;
    this.headerTitle = this.getRole('header-title') as HTMLHeadingElement;
    this.headerStatus = this.getRole('header-status') as HTMLSpanElement;
    this.paneStage = this.getRole('pane-stage');
    this.footerStatus = this.getRole('footer-status');
    this.overlayRoot = this.getRole('overlay-root');

    this.root.addEventListener('click', this.handleClick);
    this.root.addEventListener('dblclick', this.handleDoubleClick);
    this.root.addEventListener('pointerdown', this.handlePointerDown);
    this.root.addEventListener('input', this.handleInput);
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('keydown', this.handleKeyDown);
    this.render();
  }

  dispose(): void {
    this.root.removeEventListener('click', this.handleClick);
    this.root.removeEventListener('dblclick', this.handleDoubleClick);
    this.root.removeEventListener('pointerdown', this.handlePointerDown);
    this.root.removeEventListener('input', this.handleInput);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('keydown', this.handleKeyDown);
    for (const view of this.paneViews.values()) {
      view.client.dispose();
    }
    this.paneViews.clear();
  }

  private readonly handleClick = (event: Event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    const button = target.closest<HTMLElement>(
      '[data-action], [data-workspace-id], [data-tab-id], [data-pane-id], [data-command-id]',
    );
    if (!button) return;

    const workspaceId = button.dataset.workspaceId;
    const tabId = button.dataset.tabId;
    const paneId = button.dataset.paneId;
    const commandId = button.dataset.commandId;
    const action = button.dataset.action;

    if (commandId) {
      this.executeCommand(commandId);
      return;
    }

    if (workspaceId) {
      this.state.activeWorkspaceId = workspaceId;
      this.commitState();
      return;
    }

    if (tabId) {
      switch (action) {
        case 'rename-tab-request':
          this.openRenameTabDialog(tabId);
          return;
        case 'close-tab-request':
          this.openCloseTabDialog(tabId);
          return;
      }
      this.getActiveWorkspace().activeTabId = tabId;
      this.commitState();
      return;
    }

    if (paneId) {
      switch (action) {
        case 'rename-pane-request':
          this.openRenamePaneDialog(paneId);
          return;
        case 'show-pane-info':
          this.openPaneInfoDialog(paneId);
          return;
        case 'close-pane':
          this.openClosePaneDialog(paneId);
          return;
        case 'split-right':
          this.splitPane(paneId, 'row', 'after');
          return;
        case 'split-down':
          this.splitPane(paneId, 'column', 'after');
          return;
      }
      this.getActiveTab().activePaneId = paneId;
      this.commitState();
      return;
    }

    switch (action) {
      case 'new-workspace':
        this.openCreateSpaceDialog();
        return;
      case 'new-tab':
        this.addTab();
        return;
      case 'rename-workspace':
        this.openRenameWorkspaceDialog();
        return;
      case 'close-workspace':
        this.openCloseWorkspaceDialog();
        return;
      case 'toggle-sidebar':
        this.toggleSidebar();
        return;
      case 'open-palette':
        this.openPalette();
        return;
      case 'dialog-cancel':
        this.closeDialog();
        return;
      case 'dialog-submit':
        this.submitDialog();
        return;
    }
  };

  private readonly handleDoubleClick = (event: Event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    const tabButton = target.closest<HTMLElement>('[data-tab-id]');
    if (tabButton?.dataset.tabId) {
      this.openRenameTabDialog(tabButton.dataset.tabId);
      return;
    }

    const paneButton = target.closest<HTMLElement>('.pane-heading');
    if (paneButton?.dataset.paneId) {
      this.openRenamePaneDialog(paneButton.dataset.paneId);
      return;
    }

    const workspaceButton = target.closest<HTMLElement>('[data-workspace-id]');
    if (workspaceButton?.dataset.workspaceId) {
      this.openRenameWorkspaceDialog(workspaceButton.dataset.workspaceId);
    }
  };

  private readonly handleInput = (event: Event) => {
    const target = event.target as HTMLInputElement | null;
    if (!target) return;

    const action = target.dataset.action;
    if (!action || this.dialog == null) return;

    if (action === 'palette-query' && this.dialog.type === 'palette') {
      this.dialog.query = target.value;
      this.dialog.selectedIndex = 0;
      this.renderOverlay();
      return;
    }

    if (
      action === 'dialog-value' &&
      this.dialog.type !== 'palette' &&
      this.dialog.type !== 'pane-info' &&
      this.dialog.type !== 'confirm-close'
    ) {
      this.dialog.value = target.value;
    }
  };

  private readonly handlePointerDown = (event: PointerEvent) => {
    const handle = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-split-id]');
    if (!handle || !handle.classList.contains('split-handle')) return;

    const axis = handle.dataset.axis === 'column' ? 'column' : 'row';
    const splitId = handle.dataset.splitId;
    if (!splitId) return;

    const split = findSplitNode(this.getActiveTab().root, splitId);
    if (!split) return;

    this.resizeState = {
      splitId,
      axis,
      startPointer: axis === 'row' ? event.clientX : event.clientY,
      startRatio: split.ratio,
    };
    document.body.classList.add('is-resizing');
    event.preventDefault();
  };

  private readonly handlePointerMove = (event: PointerEvent) => {
    if (!this.resizeState) return;

    const split = findSplitNode(this.getActiveTab().root, this.resizeState.splitId);
    if (!split) return;

    const host = this.root.querySelector<HTMLElement>(`[data-split-host="${split.id}"]`);
    if (!host) return;

    const rect = host.getBoundingClientRect();
    const total = this.resizeState.axis === 'row' ? rect.width : rect.height;
    if (total <= 0) return;

    const delta = (this.resizeState.axis === 'row' ? event.clientX : event.clientY) - this.resizeState.startPointer;
    split.ratio = clamp(this.resizeState.startRatio + (delta / total), 0.2, 0.8);
    this.persistState();
    renderPaneTree({
      paneStage: this.paneStage,
      paneViews: this.paneViews,
      workspace: this.getActiveWorkspace(),
      tab: this.getActiveTab(),
      createPaneClient: this.deps.createPaneClient,
      resolveSessionConnection: this.deps.resolveSessionConnection,
    });
  };

  private readonly handlePointerUp = () => {
    if (!this.resizeState) return;
    this.resizeState = null;
    document.body.classList.remove('is-resizing');
  };

  private readonly handleKeyDown = (event: KeyboardEvent) => {
    if (this.dialog?.type === 'palette') {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.closeDialog();
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.movePaletteSelection(1);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.movePaletteSelection(-1);
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        this.runSelectedPaletteCommand();
        return;
      }
    } else if (this.dialog) {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.closeDialog();
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        this.submitDialog();
        return;
      }
    }

    const target = event.target as HTMLElement | null;
    const isEditable = target != null && (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target.isContentEditable
    );
    const isOverlayInput = target?.closest('.overlay-panel') != null;

    const lowerKey = event.key.toLowerCase();
    const browserSafeShiftAlt = event.altKey && event.shiftKey && !event.metaKey && !event.ctrlKey;
    const browserSafeCtrlShift = event.ctrlKey && event.shiftKey && !event.metaKey && !event.altKey;
    const browserSafeAlt = event.altKey && !event.shiftKey && !event.metaKey && !event.ctrlKey;

    if (
      (event.metaKey && (lowerKey === 'p' || lowerKey === 'k')) ||
      (browserSafeCtrlShift && lowerKey === 'p')
    ) {
      event.preventDefault();
      this.openPalette();
      return;
    }

    if (isEditable && isOverlayInput) return;

    if ((event.metaKey && lowerKey === 't') || (browserSafeShiftAlt && lowerKey === 't')) {
      event.preventDefault();
      this.addTab();
      return;
    }

    if ((event.metaKey && lowerKey === 'b') || (browserSafeShiftAlt && lowerKey === 'b')) {
      event.preventDefault();
      this.toggleSidebar();
      return;
    }

    if (
      (event.metaKey && lowerKey === 'd') ||
      (browserSafeShiftAlt && lowerKey === 'l') ||
      (browserSafeShiftAlt && lowerKey === 'j')
    ) {
      event.preventDefault();
      const axis = (event.metaKey && event.shiftKey) || (browserSafeShiftAlt && lowerKey === 'j')
        ? 'column'
        : 'row';
      this.splitActivePane(axis, 'after');
      return;
    }

    if ((event.metaKey && event.altKey && lowerKey === 'w') || (browserSafeShiftAlt && lowerKey === 'x')) {
      event.preventDefault();
      this.closeTab();
      return;
    }

    if ((event.metaKey && lowerKey === 'w') || (browserSafeShiftAlt && lowerKey === 'w')) {
      event.preventDefault();
      this.closePane(this.getActiveTab().activePaneId);
      return;
    }

    if (event.metaKey && event.shiftKey && event.key === '[') {
      event.preventDefault();
      this.previousTab();
      return;
    }

    if (event.metaKey && event.shiftKey && event.key === ']') {
      event.preventDefault();
      this.nextTab();
      return;
    }

    if ((event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) || browserSafeAlt) {
      const digit = /^[0-9]$/.test(event.key)
        ? event.key
        : event.code.startsWith('Digit')
          ? event.code.slice('Digit'.length)
          : null;
      if (digit) {
        event.preventDefault();
        const index = digit === '0' ? 9 : Number(digit) - 1;
        this.selectWorkspaceByIndex(index);
      }
    }
  };

  private render(): void {
    const workspace = this.getActiveWorkspace();
    const tab = this.getActiveTab();
    renderWorkbenchHeader({
      shell: this.shell,
      workspaceTitle: this.workspaceTitle,
      headerTitle: this.headerTitle,
      headerStatus: this.headerStatus,
      state: this.state,
      workspace,
      tab,
    });
    renderSidebarTabs(this.sidebarTabs, workspace);
    renderWorkspaceDock(this.workspaceDock, this.state);
    renderPaneTree({
      paneStage: this.paneStage,
      paneViews: this.paneViews,
      workspace,
      tab,
      createPaneClient: this.deps.createPaneClient,
      resolveSessionConnection: this.deps.resolveSessionConnection,
    });
    renderWorkbenchFooter(this.footerStatus);
    this.renderOverlay();
  }

  private renderOverlay(): void {
    renderWorkbenchOverlay({
      overlayRoot: this.overlayRoot,
      dialog: this.dialog,
      state: this.state,
      activeWorkspace: this.getActiveWorkspace(),
      activeTab: this.getActiveTab(),
      activePane: this.getActivePane(),
      paneViews: this.paneViews,
      findPaneById: (paneId) => this.findPaneById(paneId),
    });
  }

  private openPalette(): void {
    this.dialog = {
      type: 'palette',
      query: '',
      selectedIndex: 0,
    };
    this.renderOverlay();
  }

  private openCreateSpaceDialog(): void {
    this.dialog = {
      type: 'create-space',
      value: `Space ${this.state.workspaces.length + 1}`,
    };
    this.renderOverlay();
  }

  private openRenameWorkspaceDialog(workspaceId: string = this.getActiveWorkspace().id): void {
    const workspace = this.state.workspaces.find((item) => item.id === workspaceId);
    if (!workspace) return;
    this.dialog = {
      type: 'rename-space',
      workspaceId,
      value: workspace.name,
    };
    this.renderOverlay();
  }

  private openRenameTabDialog(tabId: string = this.getActiveTab().id): void {
    const tab = this.getActiveWorkspace().tabs.find((item) => item.id === tabId);
    if (!tab) return;
    this.dialog = {
      type: 'rename-tab',
      tabId,
      value: tab.title,
    };
    this.renderOverlay();
  }

  private openRenamePaneDialog(paneId: string = this.getActiveTab().activePaneId): void {
    const pane = this.findPaneById(paneId);
    if (!pane) return;
    this.dialog = {
      type: 'rename-pane',
      paneId,
      value: pane.title,
    };
    this.renderOverlay();
  }

  private openPaneInfoDialog(paneId: string = this.getActiveTab().activePaneId): void {
    this.dialog = {
      type: 'pane-info',
      paneId,
    };
    this.renderOverlay();
  }

  private openCloseWorkspaceDialog(workspaceId: string = this.getActiveWorkspace().id): void {
    const workspace = this.state.workspaces.find((item) => item.id === workspaceId);
    if (!workspace || this.state.workspaces.length === 1) return;
    this.dialog = {
      type: 'confirm-close',
      scope: 'workspace',
      targetId: workspaceId,
      heading: 'Close Space?',
      detail: `Close ${workspace.name} and remove all of its tabs from this web layout?`,
      confirmLabel: 'Close Space',
    };
    this.renderOverlay();
  }

  private openCloseTabDialog(tabId: string = this.getActiveTab().id): void {
    const tab = this.getActiveWorkspace().tabs.find((item) => item.id === tabId);
    if (!tab || this.getActiveWorkspace().tabs.length === 1) return;
    this.dialog = {
      type: 'confirm-close',
      scope: 'tab',
      targetId: tabId,
      heading: 'Close Tab?',
      detail: `Close ${tab.title} and remove its pane layout from this web workspace?`,
      confirmLabel: 'Close Tab',
    };
    this.renderOverlay();
  }

  private openClosePaneDialog(paneId: string = this.getActiveTab().activePaneId): void {
    const pane = this.findPaneById(paneId);
    if (!pane || countLeaves(this.getActiveTab().root) === 1) return;
    this.dialog = {
      type: 'confirm-close',
      scope: 'pane',
      targetId: paneId,
      heading: 'Close Pane?',
      detail: `Close ${pane.title}? The split layout will update immediately.`,
      confirmLabel: 'Close Pane',
    };
    this.renderOverlay();
  }

  private closeDialog(): void {
    this.dialog = null;
    this.renderOverlay();
  }

  private submitDialog(): void {
    if (!this.dialog) return;

    if (this.dialog.type === 'palette') {
      this.runSelectedPaletteCommand();
      return;
    }

    if (this.dialog.type === 'pane-info') {
      this.closeDialog();
      return;
    }

    if (this.dialog.type === 'confirm-close') {
      this.performConfirmedClose(this.dialog);
      return;
    }

    const value = this.dialog.value.trim();
    if (value.length === 0) return;

    switch (this.dialog.type) {
      case 'create-space':
        this.addWorkspace(value);
        break;
      case 'rename-space': {
        const { workspaceId } = this.dialog;
        const workspace = this.state.workspaces.find((item) => item.id === workspaceId);
        if (!workspace) return;
        workspace.name = value;
        this.commitState();
        break;
      }
      case 'rename-tab': {
        const { tabId } = this.dialog;
        const tab = this.getActiveWorkspace().tabs.find((item) => item.id === tabId);
        if (!tab) return;
        tab.title = value;
        this.commitState();
        break;
      }
      case 'rename-pane': {
        const { paneId } = this.dialog;
        const pane = this.findPaneById(paneId);
        if (!pane) return;
        pane.title = value;
        this.commitState();
        break;
      }
      default:
        break;
    }

    this.dialog = null;
    this.renderOverlay();
  }

  private movePaletteSelection(delta: number): void {
    if (this.dialog?.type !== 'palette') return;
    const commands = getFilteredDialogCommands(
      this.dialog,
      this.state,
      this.getActiveWorkspace(),
      this.getActiveTab(),
      this.getActivePane(),
    );
    if (commands.length === 0) return;
    const next = (this.dialog.selectedIndex + delta + commands.length) % commands.length;
    this.dialog.selectedIndex = next;
    this.renderOverlay();
  }

  private runSelectedPaletteCommand(): void {
    if (this.dialog?.type !== 'palette') return;
    const commands = getFilteredDialogCommands(
      this.dialog,
      this.state,
      this.getActiveWorkspace(),
      this.getActiveTab(),
      this.getActivePane(),
    );
    const selected = commands[this.dialog.selectedIndex];
    if (!selected) return;
    this.executeCommand(selected.id);
  }

  private executeCommand(id: string): void {
    this.dialog = null;

    switch (id) {
      case 'new-tab':
        this.addTab();
        return;
      case 'toggle-sidebar':
        this.toggleSidebar();
        return;
      case 'rename-tab':
        this.openRenameTabDialog();
        return;
      case 'rename-pane':
        this.openRenamePaneDialog();
        return;
      case 'close-tab':
        this.openCloseTabDialog();
        return;
      case 'split-right':
        this.splitActivePane('row', 'after');
        return;
      case 'split-down':
        this.splitActivePane('column', 'after');
        return;
      case 'split-left':
        this.splitActivePane('row', 'before');
        return;
      case 'split-up':
        this.splitActivePane('column', 'before');
        return;
      case 'create-space':
        this.openCreateSpaceDialog();
        return;
      case 'rename-space':
        this.openRenameWorkspaceDialog();
        return;
      case 'delete-space':
        this.openCloseWorkspaceDialog();
        return;
      case 'next-tab':
        this.nextTab();
        return;
      case 'previous-tab':
        this.previousTab();
        return;
    }

    if (id.startsWith('select-tab:')) {
      const tabId = id.slice('select-tab:'.length);
      this.getActiveWorkspace().activeTabId = tabId;
      this.commitState();
      return;
    }

    if (id.startsWith('select-space:')) {
      const workspaceId = id.slice('select-space:'.length);
      this.state.activeWorkspaceId = workspaceId;
      this.commitState();
      return;
    }

    this.renderOverlay();
  }

  private toggleSidebar(): void {
    this.state.sidebarCollapsed = !this.state.sidebarCollapsed;
    this.commitState();
  }

  private performConfirmedClose(dialog: Extract<DialogState, { type: 'confirm-close' }>): void {
    switch (dialog.scope) {
      case 'workspace':
        this.closeWorkspace(dialog.targetId);
        break;
      case 'tab':
        this.closeTab(dialog.targetId);
        break;
      case 'pane':
        this.closePane(dialog.targetId);
        break;
    }
    this.dialog = null;
    this.renderOverlay();
  }

  private addWorkspace(name: string = `Space ${this.state.workspaces.length + 1}`): void {
    const workspace = createWorkspace(name, this.sessionQuery.sessionId);
    this.state.workspaces.push(workspace);
    this.state.activeWorkspaceId = workspace.id;
    this.commitState();
  }

  private closeWorkspace(workspaceId: string = this.getActiveWorkspace().id): void {
    if (this.state.workspaces.length === 1) return;
    const workspace = this.state.workspaces.find((item) => item.id === workspaceId);
    if (!workspace) return;
    for (const tab of workspace.tabs) {
      for (const paneId of listPaneIds(tab.root)) {
        this.disposePane(paneId);
      }
    }
    this.state.workspaces = this.state.workspaces.filter((item) => item.id !== workspaceId);
    if (this.state.activeWorkspaceId === workspaceId) {
      this.state.activeWorkspaceId = this.state.workspaces[0].id;
    }
    this.commitState();
  }

  private addTab(): void {
    const workspace = this.getActiveWorkspace();
    const tab = createTab(`Tab ${workspace.tabs.length + 1}`, this.sessionQuery.sessionId);
    workspace.tabs.push(tab);
    workspace.activeTabId = tab.id;
    this.commitState();
  }

  private closeTab(tabId: string = this.getActiveTab().id): void {
    const workspace = this.getActiveWorkspace();
    if (workspace.tabs.length === 1) return;
    const currentTab = workspace.tabs.find((tab) => tab.id === tabId);
    if (!currentTab) return;
    for (const paneId of listPaneIds(currentTab.root)) {
      this.disposePane(paneId);
    }
    workspace.tabs = workspace.tabs.filter((tab) => tab.id !== tabId);
    if (workspace.activeTabId === tabId) {
      workspace.activeTabId = workspace.tabs[0].id;
    }
    this.commitState();
  }

  private nextTab(): void {
    const workspace = this.getActiveWorkspace();
    const currentIndex = workspace.tabs.findIndex((tab) => tab.id === workspace.activeTabId);
    const nextIndex = (currentIndex + 1) % workspace.tabs.length;
    workspace.activeTabId = workspace.tabs[nextIndex].id;
    this.commitState();
  }

  private previousTab(): void {
    const workspace = this.getActiveWorkspace();
    const currentIndex = workspace.tabs.findIndex((tab) => tab.id === workspace.activeTabId);
    const nextIndex = (currentIndex - 1 + workspace.tabs.length) % workspace.tabs.length;
    workspace.activeTabId = workspace.tabs[nextIndex].id;
    this.commitState();
  }

  private selectWorkspaceByIndex(index: number): void {
    const workspace = this.state.workspaces[index];
    if (!workspace) return;
    this.state.activeWorkspaceId = workspace.id;
    this.commitState();
  }

  private splitActivePane(axis: 'row' | 'column', placement: 'before' | 'after'): void {
    this.splitPane(this.getActiveTab().activePaneId, axis, placement);
  }

  private splitPane(
    paneId: string,
    axis: 'row' | 'column',
    placement: 'before' | 'after',
  ): void {
    const tab = this.getActiveTab();
    const target = findPaneNode(tab.root, paneId);
    if (!target) return;

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
    this.commitState();
  }

  private closePane(paneId: string): void {
    const tab = this.getActiveTab();
    if (countLeaves(tab.root) === 1) return;
    tab.root = removePaneNode(tab.root, paneId) ?? tab.root;
    this.disposePane(paneId);
    tab.activePaneId = getFirstLeaf(tab.root).id;
    this.commitState();
  }

  private persistState(): void {
    this.deps.persistence.persist(this.state);
  }

  private commitState(): void {
    this.persistState();
    this.render();
  }

  private disposePane(paneId: string): void {
    const view = this.paneViews.get(paneId);
    if (!view) return;
    view.client.dispose();
    view.root.remove();
    this.paneViews.delete(paneId);
  }

  private getActiveWorkspace(): WorkspaceState {
    return this.state.workspaces.find((workspace) => workspace.id === this.state.activeWorkspaceId) ?? this.state.workspaces[0];
  }

  private getActiveTab(): TabState {
    const workspace = this.getActiveWorkspace();
    return workspace.tabs.find((tab) => tab.id === workspace.activeTabId) ?? workspace.tabs[0];
  }

  private getActivePane(): PaneLeaf {
    return findPaneNode(this.getActiveTab().root, this.getActiveTab().activePaneId) ?? getFirstLeaf(this.getActiveTab().root);
  }

  private findPaneById(paneId: string): PaneLeaf | null {
    return findPaneNode(this.getActiveTab().root, paneId);
  }

  private getRole(name: string): HTMLDivElement {
    const element = this.root.querySelector<HTMLElement>(`[data-role="${name}"]`);
    if (!element) {
      throw new Error(`Missing role node: ${name}`);
    }
    return element as HTMLDivElement;
  }
}
