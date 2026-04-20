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
        <div class="overlay-header">
          <div class="overlay-heading">Command Palette</div>
          <button data-action="dialog-cancel" class="overlay-close" aria-label="Close dialog" title="Close dialog">×</button>
        </div>
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
        <div class="overlay-header">
          <div class="overlay-heading">Pane Details</div>
          <button data-action="dialog-cancel" class="overlay-close" aria-label="Close dialog" title="Close dialog">×</button>
        </div>
        <div class="info-body">
        <div class="info-grid">
          <div class="info-row"><span class="info-label">Pane</span><span>${escapeHtml(pane?.title ?? 'Unknown')}</span></div>
          <div class="info-row"><span class="info-label">Session</span><code>${escapeHtml(sessionId)}</code></div>
          <div class="info-row"><span class="info-label">Runtime</span><span>${escapeHtml(telemetry?.runtimeProfileId ?? 'Unknown')}</span></div>
          <div class="info-row"><span class="info-label">Visual Profile</span><span>${escapeHtml(telemetry?.visualProfileId ?? 'Unknown')}</span></div>
          <div class="info-row"><span class="info-label">Theme</span><span>${escapeHtml(telemetry?.themeId ?? 'Unknown')}</span></div>
          <div class="info-row"><span class="info-label">Renderer</span><span>${escapeHtml(telemetry?.activeRenderer ?? 'Unknown')}</span></div>
          <div class="info-row"><span class="info-label">Renderer Target</span><span>${escapeHtml(telemetry?.requestedRenderer ?? 'Unknown')}</span></div>
          <div class="info-row"><span class="info-label">Fallback</span><span>${escapeHtml(telemetry?.rendererFallbackReason ?? 'None')}</span></div>
          <div class="info-row"><span class="info-label">Renderer Metrics</span><span>${escapeHtml(telemetry?.rendererMetricsMode === 'gpu-active' ? 'GPU Active' : 'Canvas Fallback')}</span></div>
          <div class="info-row"><span class="info-label">Metrics Note</span><span>${escapeHtml(telemetry?.rendererMetricsNote ?? 'None')}</span></div>
          <div class="info-row"><span class="info-label">WebGPU API</span><span>${telemetry?.webgpuApi ? 'Available' : 'Unavailable'}</span></div>
          <div class="info-row"><span class="info-label">WebGL2</span><span>${telemetry?.webgl2 ? 'Available' : 'Unavailable'}</span></div>
          <div class="info-row"><span class="info-label">Screen Buffer</span><span>${escapeHtml(telemetry?.activeBuffer ?? 'Unknown')}</span></div>
          <div class="info-row"><span class="info-label">Cursor</span><span>${escapeHtml(formatCursor(telemetry?.cursorX, telemetry?.cursorY))}</span></div>
          <div class="info-row"><span class="info-label">Cursor Visible</span><span>${formatBoolean(telemetry?.cursorVisible)}</span></div>
          <div class="info-row"><span class="info-label">Dimensions</span><span>${escapeHtml(formatDimensions(telemetry?.cols, telemetry?.rows))}</span></div>
          <div class="info-row"><span class="info-label">Scrollback</span><span>${escapeHtml(formatMetric(telemetry?.scrollbackLength, 'lines'))}</span></div>
          <div class="info-row"><span class="info-label">Viewport Y</span><span>${escapeHtml(formatMetric(telemetry?.viewportY, 'rows'))}</span></div>
          <div class="info-row"><span class="info-label">Wrapped Rows</span><span>${escapeHtml(formatMetric(telemetry?.wrappedRowCount, 'rows'))}</span></div>
          <div class="info-row"><span class="info-label">Bracketed Paste</span><span>${formatBoolean(telemetry?.bracketedPaste)}</span></div>
          <div class="info-row"><span class="info-label">Focus Events</span><span>${formatBoolean(telemetry?.focusEvents)}</span></div>
          <div class="info-row"><span class="info-label">Mouse Tracking</span><span>${formatBoolean(telemetry?.mouseTracking)}</span></div>
          <div class="info-row"><span class="info-label">SGR Mouse</span><span>${formatBoolean(telemetry?.sgrMouseMode)}</span></div>
          <div class="info-row"><span class="info-label">Styled Cells</span><span>${escapeHtml(String(telemetry?.styledCellCount ?? 0))}</span></div>
          <div class="info-row"><span class="info-label">Atlas Entries</span><span>${escapeHtml(formatMetric(telemetry?.atlasGlyphEntries, 'glyphs'))}</span></div>
          <div class="info-row"><span class="info-label">Atlas Size</span><span>${escapeHtml(formatDimensions(telemetry?.atlasWidth, telemetry?.atlasHeight))}</span></div>
          <div class="info-row"><span class="info-label">Atlas Resets</span><span>${escapeHtml(formatMetric(telemetry?.atlasResetCount, 'times'))}</span></div>
          <div class="info-row"><span class="info-label">Glyph Quads</span><span>${escapeHtml(formatMetric(telemetry?.activeGlyphQuads, 'quads'))}</span></div>
          <div class="info-row"><span class="info-label">Rect Instances</span><span>${escapeHtml(formatMetric(telemetry?.activeRects, 'rects'))}</span></div>
          <div class="info-row"><span class="info-label">Rect Buffer</span><span>${escapeHtml(formatMetric(telemetry?.rectBufferCapacityBytes, 'bytes'))}</span></div>
          <div class="info-row"><span class="info-label">Glyph Buffer</span><span>${escapeHtml(formatMetric(telemetry?.glyphBufferCapacityBytes, 'bytes'))}</span></div>
          <div class="info-row"><span class="info-label">Upload</span><span>${escapeHtml(formatMetric(telemetry?.uploadBytes, 'bytes'))}</span></div>
          <div class="info-row"><span class="info-label">Frame CPU</span><span>${escapeHtml(formatMetric(telemetry?.frameCpuMs, 'ms', { precision: 2 }))}</span></div>
          <div class="info-row"><span class="info-label">Frame CPU Avg</span><span>${escapeHtml(formatMetric(telemetry?.frameCpuAvgMs, 'ms', { precision: 2 }))}</span></div>
          <div class="info-row"><span class="info-label">Session Reused</span><span>${formatBoolean(telemetry?.sessionReused)}</span></div>
          <div class="info-row"><span class="info-label">Session Age</span><span>${escapeHtml(formatMetric(telemetry?.sessionAgeMs, 'ms'))}</span></div>
          <div class="info-row"><span class="info-label">Output Pump</span><span>${escapeHtml(formatMetric(telemetry?.outputPumpStartedMs, 'ms'))}</span></div>
          <div class="info-row"><span class="info-label">First Backend Read</span><span>${escapeHtml(formatMetric(telemetry?.firstBackendReadMs, 'ms'))}</span></div>
          <div class="info-row"><span class="info-label">First Broadcast</span><span>${escapeHtml(formatMetric(telemetry?.firstBroadcastMs, 'ms'))}</span></div>
          <div class="info-row"><span class="info-label">FPS</span><span>${escapeHtml(formatMetric(telemetry?.fps, 'fps'))}</span></div>
          <div class="info-row"><span class="info-label">Latency</span><span>${escapeHtml(formatMetric(telemetry?.latencyMs, 'ms'))}</span></div>
        </div>
        <div class="info-preview">
          <div class="info-preview-label">Viewport Preview</div>
          <pre class="info-preview-content">${escapeHtml((telemetry?.viewportPreview ?? []).join('\n') || 'No visible text')}</pre>
        </div>
        </div>
        <div class="overlay-actions">
          <button data-action="dialog-cancel" class="overlay-button primary">Close</button>
        </div>
      </div>
    `;
  } else if (dialog.type === 'confirm-close') {
    panel.innerHTML = `
      <div class="overlay-panel confirm-panel">
        <div class="overlay-header">
          <div class="overlay-heading">${escapeHtml(dialog.heading)}</div>
          <button data-action="dialog-cancel" class="overlay-close" aria-label="Close dialog" title="Close dialog">×</button>
        </div>
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
        <div class="overlay-header">
          <div class="overlay-heading">${title}</div>
          <button data-action="dialog-cancel" class="overlay-close" aria-label="Close dialog" title="Close dialog">×</button>
        </div>
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

function formatCursor(x: number | null | undefined, y: number | null | undefined): string {
  if (x == null || y == null) return 'Unknown';
  return `${x}, ${y}`;
}

function formatDimensions(cols: number | null | undefined, rows: number | null | undefined): string {
  if (cols == null || rows == null || cols <= 0 || rows <= 0) return 'Unknown';
  return `${cols} × ${rows}`;
}

function formatBoolean(value: boolean | null | undefined): string {
  if (value == null) return 'Unknown';
  return value ? 'Enabled' : 'Disabled';
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
