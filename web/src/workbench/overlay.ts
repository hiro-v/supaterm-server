import { type PaneView } from './panes';
import { buildWorkbenchCommands, filterWorkbenchCommands, type CommandItem } from './commands';
import { listFontPresetOptions, type WorkbenchAppearance } from './appearance';
import { buildPaneSessionId, type PaneLeaf, type TabState, type WorkspaceState, type WorkbenchState } from './state';
import { clamp, escapeAttribute, escapeHtml, formatMetric } from './shared';
import type { PaneShell, ShellCapabilities } from '../session';

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
      shell: PaneShell;
    }
  | {
      type: 'appearance';
      appearance: WorkbenchAppearance;
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
  shellCapabilities: ShellCapabilities | null;
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
  const { overlayRoot, dialog, state, activeWorkspace, activeTab, activePane, paneViews, findPaneById, shellCapabilities } = options;
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
    const shellOptions = buildShellOptions(dialog.shell, shellCapabilities);
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
          <div class="info-row"><span class="info-label">Shell</span><span>${escapeHtml(formatShellLabel(dialog.shell, shellCapabilities))}</span></div>
          <div class="info-row info-row-select"><span class="info-label">Choose Shell</span><select class="overlay-select" data-action="pane-shell">${shellOptions}</select></div>
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
          <button data-action="dialog-cancel" class="overlay-button secondary">Close</button>
          <button data-action="dialog-submit" class="overlay-button primary">Apply</button>
        </div>
      </div>
    `;
  } else if (dialog.type === 'appearance') {
    panel.innerHTML = `
      <div class="overlay-panel appearance-panel">
        <div class="overlay-header">
          <div class="overlay-heading">Appearance</div>
          <button data-action="dialog-cancel" class="overlay-close" aria-label="Close dialog" title="Close dialog">×</button>
        </div>
        <div class="info-body">
          <div class="appearance-grid">
            <label class="appearance-field">
              <span class="info-label">Font Preset</span>
              <select class="overlay-select" data-action="appearance-field" data-appearance-field="fontPreset">
                ${buildFontPresetOptions(dialog.appearance.fontPreset)}
              </select>
            </label>
            <label class="appearance-field">
              <span class="info-label">Custom Font Family</span>
              <input
                class="overlay-input compact"
                data-action="appearance-field"
                data-appearance-field="fontFamily"
                value="${escapeAttribute(dialog.appearance.fontFamily)}"
                placeholder='"MesloLGS NF", monospace'
              />
            </label>
            <label class="appearance-field">
              <span class="info-label">Font Size</span>
              <input
                class="overlay-input compact"
                data-action="appearance-field"
                data-appearance-field="fontSize"
                type="number"
                min="11"
                max="32"
                value="${escapeAttribute(String(dialog.appearance.fontSize))}"
              />
            </label>
            <label class="appearance-field">
              <span class="info-label">Cursor Blink</span>
              <select class="overlay-select" data-action="appearance-field" data-appearance-field="cursorBlink">
                <option value="true"${dialog.appearance.cursorBlink ? ' selected' : ''}>Enabled</option>
                <option value="false"${dialog.appearance.cursorBlink ? '' : ' selected'}>Disabled</option>
              </select>
            </label>
          </div>
          <div class="appearance-section">
            <div class="appearance-section-title">Terminal Colors</div>
            <div class="appearance-color-grid">
              ${buildColorField('Background', 'theme.background', dialog.appearance.theme.background)}
              ${buildColorField('Foreground', 'theme.foreground', dialog.appearance.theme.foreground)}
              ${buildColorField('Cursor', 'theme.cursor', dialog.appearance.theme.cursor)}
              ${buildColorField('Selection BG', 'theme.selectionBackground', dialog.appearance.theme.selectionBackground)}
              ${buildColorField('Selection FG', 'theme.selectionForeground', dialog.appearance.theme.selectionForeground)}
              ${buildColorField('Red', 'theme.red', dialog.appearance.theme.red)}
              ${buildColorField('Green', 'theme.green', dialog.appearance.theme.green)}
              ${buildColorField('Yellow', 'theme.yellow', dialog.appearance.theme.yellow)}
              ${buildColorField('Blue', 'theme.blue', dialog.appearance.theme.blue)}
              ${buildColorField('Magenta', 'theme.magenta', dialog.appearance.theme.magenta)}
              ${buildColorField('Cyan', 'theme.cyan', dialog.appearance.theme.cyan)}
              ${buildColorField('White', 'theme.white', dialog.appearance.theme.white)}
            </div>
          </div>
        </div>
        <div class="overlay-actions">
          <button data-action="dialog-cancel" class="overlay-button secondary">Cancel</button>
          <button data-action="dialog-submit" class="overlay-button primary">Apply</button>
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

function buildFontPresetOptions(selected: WorkbenchAppearance['fontPreset']): string {
  return listFontPresetOptions().map((option) => `
    <option value="${escapeAttribute(option.id)}"${option.id === selected ? ' selected' : ''}>
      ${escapeHtml(option.label)}
    </option>
  `).join('');
}

function buildColorField(label: string, field: string, value: string): string {
  return `
    <label class="appearance-color-field">
      <span class="info-label">${escapeHtml(label)}</span>
      <span class="appearance-color-control">
        <input
          class="appearance-color"
          data-action="appearance-field"
          data-appearance-field="${escapeAttribute(field)}"
          type="color"
          value="${escapeAttribute(value)}"
        />
        <code>${escapeHtml(value)}</code>
      </span>
    </label>
  `;
}

function focusOverlayInput(overlayRoot: HTMLDivElement): void {
  queueMicrotask(() => {
    const input = overlayRoot.querySelector<HTMLInputElement>('.overlay-input');
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
      return;
    }
    overlayRoot.querySelector<HTMLSelectElement>('.overlay-select')?.focus();
  });
}

function buildShellOptions(selected: PaneShell, capabilities: ShellCapabilities | null): string {
  const supported: PaneShell[] = ['system', 'fish', 'zsh', 'bash', 'sh'];
  return supported.map((shell) => {
    const available = shell === 'system' ? true : (capabilities?.shells.find((entry) => entry.id === shell)?.available ?? false);
    const label = formatShellLabel(shell, capabilities);
    const disabled = !available && shell !== selected ? ' disabled' : '';
    const isSelected = shell === selected ? ' selected' : '';
    return `<option value="${escapeAttribute(shell)}"${isSelected}${disabled}>${escapeHtml(label)}</option>`;
  }).join('');
}

function formatShellLabel(shell: PaneShell, capabilities: ShellCapabilities | null): string {
  if (shell === 'system') {
    return capabilities?.default_shell ? `System Default (${capabilities.default_shell})` : 'System Default';
  }
  const available = capabilities?.shells.find((entry) => entry.id === shell)?.available ?? false;
  return available ? shell : `${shell} (missing)`;
}
