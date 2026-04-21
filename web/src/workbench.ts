import { getShellCapabilities, type SessionConnectionDetails, type SessionQuery, type ShellCapabilities } from './session';
import { createAppRuntime, type AppRuntime } from './runtime/runtime';
import {
  addTab,
  addWorkspace,
  closePane,
  closeTab,
  closeWorkspace,
  findPaneById,
  getActivePane,
  getActiveTab,
  getActiveWorkspace,
  nextTab,
  openClosePaneDialog,
  openCloseTabDialog,
  openCloseWorkspaceDialog,
  openAppearanceDialog,
  openCreateSpaceDialog,
  openPaletteDialog,
  openPaneInfoDialog,
  openRenamePaneDialog,
  openRenameTabDialog,
  openRenameWorkspaceDialog,
  previousTab,
  renamePane,
  renameTab,
  renameWorkspace,
  selectWorkspaceByIndex,
  setActivePane,
  setActiveTab,
  setActiveWorkspace,
  splitPane,
  toggleSidebar,
} from './workbench/actions';
import { createVisualConfigSourceForAppearance } from './workbench/appearance';
import { resolveFontPresetFamily } from './runtime/config';
import {
  resolveClickIntent,
  resolveDoubleClickIntent,
  resolveKeyboardIntent,
} from './workbench/intents';
import {
  executeWorkbenchActionIntent,
  executeWorkbenchCommand,
  executeWorkbenchKeyboardIntent,
} from './workbench/controller';
import { type DialogState, getFilteredDialogCommands, renderWorkbenchOverlay } from './workbench/overlay';
import {
  movePaletteSelection,
  submitWorkbenchDialog,
} from './workbench/dialogs';
import {
  createDefaultPaneClientFactory,
  type PaneClientFactory,
  type PaneSessionResolver,
  type PaneView,
  renderPaneTree,
} from './workbench/panes';
import {
  createServerWorkbenchPersistence,
  type WorkbenchPersistence,
  type WorkbenchPersistenceIdentity,
} from './workbench/persistence';
import { renderWorkbenchFooter, renderWorkbenchHeader, renderSidebarTabs, renderWorkspaceDock } from './workbench/sidebar';
import { mountWorkbenchView } from './workbench/view';
import {
  buildPaneSessionId,
  type PaneLeaf,
  type TabState,
  type WorkbenchState,
  type WorkspaceState,
} from './workbench/state';
import { beginWorkbenchResize, updateWorkbenchResize, type ResizeState } from './workbench/resize';
import { createWorkbenchHandlerSets } from './workbench/wiring';

export type WorkbenchDependencies = {
  appRuntime: AppRuntime;
  persistence: WorkbenchPersistence;
  createPaneClient: PaneClientFactory;
  resolveSessionConnection: PaneSessionResolver;
};

function createDefaultWorkbenchDependencies(
  sessionQuery: SessionQuery,
): Omit<WorkbenchDependencies, 'appRuntime' | 'createPaneClient'> {
  return {
    persistence: createServerWorkbenchPersistence(),
    resolveSessionConnection(workspace, tab, pane) {
      return {
        sessionId: buildPaneSessionId(workspace, tab, pane),
        token: sessionQuery.token,
        shell: pane.shell,
      };
    },
  };
}

export class SupatermWorkbench {
  private readonly root: HTMLDivElement;
  private readonly sessionQuery: SessionQuery;
  private readonly deps: WorkbenchDependencies;
  private readonly hasCustomPaneClientFactory: boolean;
  private appRuntime: AppRuntime;
  private chromeSurface: ReturnType<AppRuntime['createChromeSurface']>;
  private readonly handlerSets = createWorkbenchHandlerSets(this);
  private state: WorkbenchState;
  private stateVersion = 0;
  private resizeState: ResizeState | null = null;
  private dialog: DialogState | null = null;
  private shellCapabilities: ShellCapabilities | null = null;

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
    const persistence = dependencies.persistence ?? defaults.persistence;
    const initialState = persistence.load(sessionQuery.sessionId);
    this.appRuntime = dependencies.appRuntime ?? this.createRuntimeForState(initialState);
    this.deps = {
      appRuntime: this.appRuntime,
      persistence,
      createPaneClient: dependencies.createPaneClient ?? createDefaultPaneClientFactory(this.appRuntime),
      resolveSessionConnection: dependencies.resolveSessionConnection ?? defaults.resolveSessionConnection,
    };
    this.hasCustomPaneClientFactory = dependencies.createPaneClient != null;
    this.chromeSurface = this.appRuntime.createChromeSurface();
    this.state = initialState;
  }

  mount(): void {
    const view = mountWorkbenchView(this.root);
    this.shell = view.shell;
    this.sidebarTabs = view.sidebarTabs;
    this.workspaceDock = view.workspaceDock;
    this.workspaceTitle = view.workspaceTitle;
    this.headerTitle = view.headerTitle;
    this.headerStatus = view.headerStatus;
    this.paneStage = view.paneStage;
    this.footerStatus = view.footerStatus;
    this.overlayRoot = view.overlayRoot;

    this.applyVisualProfile();
    this.chromeSurface.mount(this.shell);
    this.root.addEventListener('click', this.handleClick);
    this.root.addEventListener('dblclick', this.handleDoubleClick);
    this.root.addEventListener('pointerdown', this.handlePointerDown);
    this.root.addEventListener('input', this.handleInput);
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('keydown', this.handleKeyDown);
    this.render();
    void this.hydrateRemoteState();
    void this.hydrateShellCapabilities();
  }

  dispose(): void {
    this.root.removeEventListener('click', this.handleClick);
    this.root.removeEventListener('dblclick', this.handleDoubleClick);
    this.root.removeEventListener('pointerdown', this.handlePointerDown);
    this.root.removeEventListener('input', this.handleInput);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('keydown', this.handleKeyDown);
    this.chromeSurface.dispose();
    for (const view of this.paneViews.values()) {
      view.client.dispose();
    }
    this.paneViews.clear();
  }

  private readonly handleClick = (event: Event) => {
    const intent = resolveClickIntent(event.target as HTMLElement | null);
    if (!intent) return;

    switch (intent.type) {
      case 'command':
        this.executeCommand(intent.commandId);
        return;
      case 'select-workspace':
        if (setActiveWorkspace(this.state, intent.workspaceId)) this.commitState();
        return;
      case 'select-tab':
        if (setActiveTab(this.state, intent.tabId)) this.commitState();
        return;
      case 'rename-tab':
        this.openRenameTabDialog(intent.tabId);
        return;
      case 'close-tab':
        this.openCloseTabDialog(intent.tabId);
        return;
      case 'select-pane':
        if (setActivePane(this.state, intent.paneId)) this.commitState();
        return;
      case 'rename-pane':
        this.openRenamePaneDialog(intent.paneId);
        return;
      case 'show-pane-info':
        this.openPaneInfoDialog(intent.paneId);
        return;
      case 'close-pane':
        this.openClosePaneDialog(intent.paneId);
        return;
      case 'split-pane':
        this.splitPane(intent.paneId, intent.axis, 'after');
        return;
      case 'action':
        executeWorkbenchActionIntent(intent.action, this.handlerSets.actions);
        return;
    }
  };

  private readonly handleDoubleClick = (event: Event) => {
    const intent = resolveDoubleClickIntent(event.target as HTMLElement | null);
    if (!intent) return;

    switch (intent.type) {
      case 'rename-tab':
        this.openRenameTabDialog(intent.tabId);
        return;
      case 'rename-pane':
        this.openRenamePaneDialog(intent.paneId);
        return;
      case 'rename-workspace':
        this.openRenameWorkspaceDialog(intent.workspaceId);
        return;
    }
  };

  private readonly handleInput = (event: Event) => {
    const target = event.target as HTMLInputElement | HTMLSelectElement | null;
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
      this.dialog.type !== 'confirm-close' &&
      this.dialog.type !== 'appearance'
    ) {
      this.dialog.value = target.value;
      return;
    }

    if (action === 'pane-shell' && this.dialog.type === 'pane-info') {
      this.dialog.shell = target.value as typeof this.dialog.shell;
      return;
    }

    if (action === 'appearance-field' && this.dialog.type === 'appearance') {
      this.updateAppearanceDialogField(target);
      if (target instanceof HTMLSelectElement || target.type === 'color') {
        this.renderOverlay();
      }
    }
  };

  private readonly handlePointerDown = (event: PointerEvent) => {
    this.resizeState = beginWorkbenchResize(
      event.target as HTMLElement | null,
      this.getActiveTab(),
      event,
    );
    if (!this.resizeState) return;
    document.body.classList.add('is-resizing');
    event.preventDefault();
  };

  private readonly handlePointerMove = (event: PointerEvent) => {
    if (!this.resizeState) return;
    if (!updateWorkbenchResize(this.resizeState, this.getActiveTab(), this.root, event)) return;
    this.persistState();
    renderPaneTree({
      paneStage: this.paneStage,
      paneViews: this.paneViews,
      workspace: this.getActiveWorkspace(),
      tab: this.getActiveTab(),
      createPaneClient: this.deps.createPaneClient,
      resolveSessionConnection: this.deps.resolveSessionConnection,
    });
    this.chromeSurface.resize();
  };

  private readonly handlePointerUp = () => {
    if (!this.resizeState) return;
    this.resizeState = null;
    document.body.classList.remove('is-resizing');
  };

  private readonly handleKeyDown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    const isEditable = target != null && (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target.isContentEditable
    );
    const isOverlayInput = target?.closest('.overlay-panel') != null;
    const intent = resolveKeyboardIntent(event, {
      dialogMode: this.dialog?.type === 'palette'
        ? 'palette'
        : this.dialog
          ? 'dialog'
          : 'none',
      isEditable,
      isOverlayInput,
    });
    if (!intent) return;

    event.preventDefault();
    executeWorkbenchKeyboardIntent(intent, this.handlerSets.keyboard);
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
    this.chromeSurface.resize();
    renderWorkbenchFooter(this.footerStatus);
    this.renderOverlay();
  }

  private applyVisualProfile(): void {
    const { chromePalette, theme } = this.appRuntime.visualProfile;
    this.root.style.setProperty('--chrome-shell-bg', chromePalette.shellBackground);
    this.root.style.setProperty('--chrome-shell-bg-alt', chromePalette.shellBackgroundAlt);
    this.root.style.setProperty('--chrome-shell-glow', chromePalette.glow);
    this.root.style.setProperty('--chrome-shell-grid', chromePalette.grid);
    this.root.style.setProperty('--bg', theme.background);
    this.root.style.setProperty('--bg-2', chromePalette.shellBackgroundAlt);
    this.root.style.setProperty('--sidebar', chromePalette.shellBackgroundAlt);
    this.root.style.setProperty('--panel', chromePalette.shellBackground);
    this.root.style.setProperty('--panel-2', chromePalette.shellBackgroundAlt);
    this.root.style.setProperty('--panel-3', chromePalette.grid);
    this.root.style.setProperty('--panel-4', chromePalette.grid);
    this.root.style.setProperty('--text', theme.foreground);
    this.root.style.setProperty('--accent', theme.foreground);
    this.root.style.setProperty('--accent-2', theme.cursor);
    this.root.style.setProperty('--accent-soft', `${theme.selectionBackground}33`);
    this.root.style.setProperty('--border', `${theme.foreground}1a`);
    this.root.style.setProperty('--border-strong', `${theme.foreground}2e`);
    this.root.style.setProperty('--muted', `${theme.foreground}99`);
    this.root.style.setProperty('--muted-2', `${theme.foreground}66`);
  }

  renderOverlay(): void {
    renderWorkbenchOverlay({
      overlayRoot: this.overlayRoot,
      dialog: this.dialog,
      state: this.state,
      activeWorkspace: this.getActiveWorkspace(),
      activeTab: this.getActiveTab(),
      activePane: this.getActivePane(),
      paneViews: this.paneViews,
      findPaneById: (paneId) => findPaneById(this.state, paneId),
      shellCapabilities: this.shellCapabilities,
    });
  }

  openPalette(): void {
    this.dialog = openPaletteDialog();
    this.renderOverlay();
  }

  openCreateSpaceDialog(): void {
    this.dialog = openCreateSpaceDialog(this.state);
    this.renderOverlay();
  }

  openRenameWorkspaceDialog(workspaceId: string = this.getActiveWorkspace().id): void {
    this.dialog = openRenameWorkspaceDialog(this.state, workspaceId);
    this.renderOverlay();
  }

  openRenameTabDialog(tabId: string = this.getActiveTab().id): void {
    this.dialog = openRenameTabDialog(this.state, tabId);
    this.renderOverlay();
  }

  openRenamePaneDialog(paneId: string = this.getActiveTab().activePaneId): void {
    this.dialog = openRenamePaneDialog(this.state, paneId);
    this.renderOverlay();
  }

  openPaneInfoDialog(paneId: string = this.getActiveTab().activePaneId): void {
    this.dialog = openPaneInfoDialog(this.state, paneId);
    this.renderOverlay();
  }

  openAppearanceDialog(): void {
    this.dialog = openAppearanceDialog(this.state);
    this.renderOverlay();
  }

  openCloseWorkspaceDialog(workspaceId: string = this.getActiveWorkspace().id): void {
    this.dialog = openCloseWorkspaceDialog(this.state, workspaceId);
    this.renderOverlay();
  }

  openCloseTabDialog(tabId: string = this.getActiveTab().id): void {
    this.dialog = openCloseTabDialog(this.state, tabId);
    this.renderOverlay();
  }

  openClosePaneDialog(paneId: string = this.getActiveTab().activePaneId): void {
    this.dialog = openClosePaneDialog(this.state, paneId);
    this.renderOverlay();
  }

  closeDialog(): void {
    this.dialog = null;
    this.renderOverlay();
  }

  submitDialog(): void {
    const previousAppearance = JSON.stringify(this.state.appearance);
    const result = submitWorkbenchDialog(this.state, this.dialog, this.sessionQuery.sessionId);
    switch (result.kind) {
      case 'run-command':
        this.executeCommand(result.commandId);
        return;
      case 'close':
        this.closeDialog();
        return;
      case 'commit':
        for (const paneId of result.disposedPaneIds) {
          this.disposePane(paneId);
        }
        if (previousAppearance !== JSON.stringify(this.state.appearance)) {
          this.refreshAppearanceRuntime();
        }
        this.dialog = null;
        this.commitState();
        return;
      case 'noop':
        return;
    }
  }

  movePaletteSelection(delta: number): void {
    if (this.dialog?.type !== 'palette') return;
    if (!movePaletteSelection(this.dialog, this.state, delta)) return;
    this.renderOverlay();
  }

  runSelectedPaletteCommand(): void {
    if (this.dialog?.type !== 'palette') return;
    const result = submitWorkbenchDialog(this.state, this.dialog, this.sessionQuery.sessionId);
    if (result.kind !== 'run-command') return;
    this.executeCommand(result.commandId);
  }

  executeCommand(id: string): void {
    this.dialog = null;
    executeWorkbenchCommand(id, this.handlerSets.commands);
  }

  toggleSidebar(): void {
    toggleSidebar(this.state);
    this.commitState();
  }

  addWorkspace(name: string = `Space ${this.state.workspaces.length + 1}`): void {
    addWorkspace(this.state, this.sessionQuery.sessionId, name);
    this.commitState();
  }

  closeWorkspace(workspaceId: string = this.getActiveWorkspace().id): void {
    for (const paneId of closeWorkspace(this.state, workspaceId)) {
      this.disposePane(paneId);
    }
    this.commitState();
  }

  addTab(): void {
    addTab(this.state, this.sessionQuery.sessionId);
    this.commitState();
  }

  closeTab(tabId: string = this.getActiveTab().id): void {
    for (const paneId of closeTab(this.state, tabId)) {
      this.disposePane(paneId);
    }
    this.commitState();
  }

  nextTab(): void {
    nextTab(this.state);
    this.commitState();
  }

  previousTab(): void {
    previousTab(this.state);
    this.commitState();
  }

  selectWorkspaceByIndex(index: number): void {
    if (selectWorkspaceByIndex(this.state, index)) this.commitState();
  }

  splitActivePane(axis: 'row' | 'column', placement: 'before' | 'after'): void {
    this.splitPane(this.getActiveTab().activePaneId, axis, placement);
  }

  splitPane(
    paneId: string,
    axis: 'row' | 'column',
    placement: 'before' | 'after',
  ): void {
    if (splitPane(this.state, paneId, axis, placement)) this.commitState();
  }

  closePane(paneId: string): void {
    for (const disposedPaneId of closePane(this.state, paneId)) {
      this.disposePane(disposedPaneId);
    }
    this.commitState();
  }

  private persistState(): void {
    this.deps.persistence.persist(this.state, this.persistenceIdentity());
  }

  private commitState(): void {
    this.stateVersion += 1;
    this.persistState();
    this.render();
  }

  private updateAppearanceDialogField(target: HTMLInputElement | HTMLSelectElement): void {
    if (this.dialog?.type !== 'appearance') return;
    const dialog = this.dialog;
    const field = target.dataset.appearanceField;
    if (!field) return;

    switch (field) {
      case 'fontPreset':
        dialog.appearance.fontPreset = target.value as typeof dialog.appearance.fontPreset;
        if (dialog.appearance.fontPreset !== 'custom') {
          dialog.appearance.fontFamily = resolveFontPresetFamily(dialog.appearance.fontPreset);
        }
        dialog.appearance.presetId = 'custom';
        break;
      case 'fontFamily':
        dialog.appearance.fontFamily = target.value;
        dialog.appearance.fontPreset = 'custom';
        dialog.appearance.presetId = 'custom';
        break;
      case 'fontSize':
        dialog.appearance.fontSize = Number(target.value);
        dialog.appearance.presetId = 'custom';
        break;
      case 'cursorBlink':
        dialog.appearance.cursorBlink = target.value === 'true';
        dialog.appearance.presetId = 'custom';
        break;
      default:
        if (field.startsWith('theme.')) {
          const themeKey = field.slice('theme.'.length) as keyof typeof dialog.appearance.theme;
          dialog.appearance.theme[themeKey] = target.value;
          dialog.appearance.presetId = 'custom';
        }
        break;
    }

    if (field !== 'fontPreset' || dialog.appearance.fontPreset === 'custom') {
      dialog.appearance.presetId = 'custom';
    }
  }

  private refreshAppearanceRuntime(): void {
    this.chromeSurface.dispose();
    for (const view of this.paneViews.values()) {
      view.client.dispose();
      view.root.remove();
    }
    this.paneViews.clear();
    this.appRuntime = this.createRuntimeForState(this.state);
    if (!this.hasCustomPaneClientFactory) {
      this.deps.createPaneClient = createDefaultPaneClientFactory(this.appRuntime);
    }
    this.deps.appRuntime = this.appRuntime;
    this.chromeSurface = this.appRuntime.createChromeSurface();
    this.applyVisualProfile();
    this.chromeSurface.mount(this.shell);
  }

  private createRuntimeForState(state: WorkbenchState): AppRuntime {
    return createAppRuntime({
      visualConfigSource: createVisualConfigSourceForAppearance(state.appearance),
    });
  }

  private disposePane(paneId: string): void {
    const view = this.paneViews.get(paneId);
    if (!view) return;
    view.client.dispose();
    view.root.remove();
    this.paneViews.delete(paneId);
  }

  private getActiveWorkspace(): WorkspaceState {
    return getActiveWorkspace(this.state);
  }

  private getActiveTab(): TabState {
    return getActiveTab(this.state);
  }

  private getActivePane(): PaneLeaf {
    return getActivePane(this.state);
  }

  private findPaneById(paneId: string): PaneLeaf | null {
    return findPaneById(this.state, paneId);
  }

  selectTab(tabId: string): void {
    if (setActiveTab(this.state, tabId)) this.commitState();
  }

  selectWorkspace(workspaceId: string): void {
    if (setActiveWorkspace(this.state, workspaceId)) this.commitState();
  }

  private persistenceIdentity(): WorkbenchPersistenceIdentity {
    return {
      workbenchId: this.sessionQuery.sessionId,
      token: this.sessionQuery.token,
    };
  }

  private async hydrateRemoteState(): Promise<void> {
    const hydrationVersion = this.stateVersion;
    const remoteState = await this.deps.persistence.hydrate(this.persistenceIdentity()).catch(() => null);
    if (remoteState == null) {
      if (hydrationVersion === this.stateVersion) {
        this.persistState();
      }
      return;
    }
    if (hydrationVersion !== this.stateVersion) {
      return;
    }
    const previousAppearance = JSON.stringify(this.state.appearance);
    this.state = remoteState;
    if (previousAppearance !== JSON.stringify(this.state.appearance)) {
      this.refreshAppearanceRuntime();
    }
    this.render();
  }

  private async hydrateShellCapabilities(): Promise<void> {
    this.shellCapabilities = await getShellCapabilities(window.location).catch(() => null);
    this.renderOverlay();
  }
}
