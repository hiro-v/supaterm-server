import { type PaneView } from './panes';
import { buildWorkbenchCommands, filterWorkbenchCommands, type CommandItem } from './commands';
import { buildPaneSessionId, type PaneLeaf, type TabState, type WorkspaceState, type WorkbenchState } from './state';
import { clamp, escapeAttribute, escapeHtml, formatMetric } from './shared';

export type DialogState =
  | {
      type: 'palette';
      query: string;
      selectedIndex: number;
    }
  | {
      type: 'create-space';
      value: string;
    }
  | {
      type: 'rename-space';
      workspaceId: string;
      value: string;
    }
  | {
      type: 'rename-tab';
      tabId: string;
      value: string;
    }
  | {
      type: 'rename-pane';
      paneId: string;
      value: string;
    }
  | {
      type: 'pane-info';
      paneId: string;
    }
  | {
      type: 'confirm-close';
      scope: 'workspace' | 'tab' | 'pane';
      targetId: string;
      heading: string;
      detail: string;
      confirmLabel: string;
    };

type RenderOverlayOptions = {
  overlayRoot: HTMLDivElement;
  dialog: DialogState | null;
  state: WorkbenchState;
  activeWorkspace: WorkspaceState;
  activeTab: TabState;
  activePane: PaneLeaf;
  paneViews: Map<string, PaneView>;
  findPaneById: (paneId: string) => PaneLeaf | null;
};

export function getFilteredDialogCommands(
  dialog: DialogState | null,
  state: WorkbenchState,
  activeWorkspace: WorkspaceState,
  activeTab: TabState,
  activePane: PaneLeaf,
): CommandItem[] {
  if (dialog?.type !== 'palette') return [];
  return filterWorkbenchCommands(
    buildWorkbenchCommands(state, activeWorkspace, activeTab, activePane),
    dialog.query,
  );
}

export function renderWorkbenchOverlay(options: RenderOverlayOptions): void {
  const { overlayRoot, dialog, state, activeWorkspace, activeTab, activePane, paneViews, findPaneById } = options;
  overlayRoot.replaceChildren();
  if (!dialog) return;

  const panel = document.createElement('div');
  panel.className = 'overlay-scrim';

  if (dialog.type === 'palette') {
    const commands = getFilteredDialogCommands(dialog, state, activeWorkspace, activeTab, activePane);
    const selectedIndex = commands.length === 0 ? 0 : clamp(dialog.selectedIndex, 0, commands.length - 1);
    dialog.selectedIndex = selectedIndex;
    panel.innerHTML = `
      <div class="overlay-panel palette-panel">
        <div class="overlay-heading">Command Palette</div>
        <input
          class="overlay-input"
          data-action="palette-query"
          value="${escapeAttribute(dialog.query)}"
          placeholder="Type a command, tab, or space"
        />
        <div class="palette-list">
          ${
            commands.length === 0
              ? '<div class="palette-empty">No matching commands</div>'
              : commands.map((command, index) => `
                <button
                  class="palette-item${index === selectedIndex ? ' active' : ''}"
                  data-command-id="${escapeAttribute(command.id)}"
                >
                  <span class="palette-label-wrap">
                    <span class="palette-label">${escapeHtml(command.label)}</span>
                    <span class="palette-detail">${escapeHtml(command.detail)}</span>
                  </span>
                  <span class="palette-hotkey">${escapeHtml(command.hotkey ?? '')}</span>
                </button>
              `).join('')
          }
        </div>
        <div class="overlay-actions">
          <button data-action="dialog-cancel" class="overlay-button secondary">Cancel</button>
          <button data-action="dialog-submit" class="overlay-button primary">Run</button>
        </div>
      </div>
    `;
  } else if (dialog.type === 'pane-info') {
    const pane = findPaneById(dialog.paneId);
    const view = paneViews.get(dialog.paneId) ?? null;
    const telemetry = view?.client.getTelemetry() ?? null;
    const sessionId = pane ? buildPaneSessionId(activeWorkspace, activeTab, pane) : 'unknown';
    panel.innerHTML = `
      <div class="overlay-panel info-panel">
        <div class="overlay-heading">Pane Details</div>
        <div class="info-grid">
          <div class="info-row"><span class="info-label">Pane</span><span>${escapeHtml(pane?.title ?? 'Unknown')}</span></div>
          <div class="info-row"><span class="info-label">Session</span><code>${escapeHtml(sessionId)}</code></div>
          <div class="info-row"><span class="info-label">Runtime</span><span>${escapeHtml(telemetry?.runtimeProfileId ?? 'Unknown')}</span></div>
          <div class="info-row"><span class="info-label">Renderer</span><span>${escapeHtml(telemetry?.activeRenderer ?? 'Unknown')}</span></div>
          <div class="info-row"><span class="info-label">Renderer Target</span><span>${escapeHtml(telemetry?.requestedRenderer ?? 'Unknown')}</span></div>
          <div class="info-row"><span class="info-label">Fallback</span><span>${escapeHtml(telemetry?.rendererFallbackReason ?? 'None')}</span></div>
          <div class="info-row"><span class="info-label">WebGPU API</span><span>${telemetry?.webgpuApi ? 'Available' : 'Unavailable'}</span></div>
          <div class="info-row"><span class="info-label">WebGL2</span><span>${telemetry?.webgl2 ? 'Available' : 'Unavailable'}</span></div>
          <div class="info-row"><span class="info-label">FPS</span><span>${escapeHtml(formatMetric(telemetry?.fps, 'fps'))}</span></div>
          <div class="info-row"><span class="info-label">Latency</span><span>${escapeHtml(formatMetric(telemetry?.latencyMs, 'ms'))}</span></div>
        </div>
        <div class="overlay-actions">
          <button data-action="dialog-cancel" class="overlay-button primary">Close</button>
        </div>
      </div>
    `;
  } else if (dialog.type === 'confirm-close') {
    panel.innerHTML = `
      <div class="overlay-panel confirm-panel">
        <div class="overlay-heading">${escapeHtml(dialog.heading)}</div>
        <div class="overlay-copy">${escapeHtml(dialog.detail)}</div>
        <div class="overlay-actions">
          <button data-action="dialog-cancel" class="overlay-button secondary">Cancel</button>
          <button data-action="dialog-submit" class="overlay-button primary danger">${escapeHtml(dialog.confirmLabel)}</button>
        </div>
      </div>
    `;
  } else {
    const isCreate = dialog.type === 'create-space';
    const title = isCreate
      ? 'Create Space'
      : dialog.type === 'rename-space'
        ? 'Rename Space'
        : dialog.type === 'rename-tab'
          ? 'Rename Tab'
          : 'Rename Pane';
    const placeholder = isCreate ? 'space-name' : 'new-name';
    const confirm = isCreate ? 'Create' : 'Save';
    panel.innerHTML = `
      <div class="overlay-panel dialog-panel">
        <div class="overlay-heading">${title}</div>
        <input
          class="overlay-input"
          data-action="dialog-value"
          value="${escapeAttribute(dialog.value)}"
          placeholder="${placeholder}"
        />
        <div class="overlay-actions">
          <button data-action="dialog-cancel" class="overlay-button secondary">Cancel</button>
          <button data-action="dialog-submit" class="overlay-button primary">${confirm}</button>
        </div>
      </div>
    `;
  }

  overlayRoot.append(panel);
  focusOverlayInput(overlayRoot);
}

function focusOverlayInput(overlayRoot: HTMLDivElement): void {
  queueMicrotask(() => {
    const input = overlayRoot.querySelector<HTMLInputElement>('.overlay-input');
    input?.focus();
    if (input) {
      input.setSelectionRange(input.value.length, input.value.length);
    }
  });
}
