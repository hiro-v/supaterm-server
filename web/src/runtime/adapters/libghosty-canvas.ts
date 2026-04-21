import { FitAddon, Terminal, init } from 'libghosty';
import type {
  TerminalFrameCell,
  TerminalFrameSnapshot,
  TerminalRendererAdapter,
  TerminalRendererAdapterDescriptor,
  TerminalRendererDiagnostics,
  TerminalVisualProfile,
} from '../contracts';

let terminalInitPromise: Promise<void> | null = null;

export type LibghostyCanvasAdapterOptions = {
  profile: TerminalVisualProfile;
};

export class LibghostyCanvasAdapter implements TerminalRendererAdapter {
  readonly descriptor: TerminalRendererAdapterDescriptor;
  private readonly profile: TerminalVisualProfile;
  private terminal: Terminal | null = null;
  private fitAddon: FitAddon | null = null;

  constructor(options: LibghostyCanvasAdapterOptions) {
    this.profile = options.profile;
    this.descriptor = {
      id: 'supaterm.renderer.libghosty-canvas',
      family: 'libghosty',
      transport: 'canvas',
      activeRenderer: 'libghosty-canvas',
      requestedRenderer: options.profile.runtime.preferredRenderer,
      fallbackReason: options.profile.runtime.preferredRenderer === 'webgpu'
        ? 'WebGPU terminal renderer remains experimental; using libghosty canvas runtime.'
        : null,
      visualProfileId: options.profile.id,
      themeId: options.profile.themeId,
    };
  }

  get cols(): number {
    return this.terminal?.cols ?? 80;
  }

  get rows(): number {
    return this.terminal?.rows ?? 24;
  }

  async start(): Promise<void> {
    terminalInitPromise ??= init();
    await terminalInitPromise;
    if (this.terminal) return;

    this.terminal = new Terminal({
      cols: 80,
      rows: 24,
      fontFamily: this.profile.fontFamily,
      fontSize: this.profile.fontSize,
      theme: this.profile.theme,
      cursorBlink: this.profile.cursorBlink,
    });
    this.fitAddon = new FitAddon();
    this.terminal.loadAddon(this.fitAddon);
  }

  mount(host: HTMLDivElement): void {
    this.terminal?.open(host);
    this.fit();
  }

  fit(): void {
    this.fitAddon?.fit();
  }

  focus(): void {
    this.terminal?.focus();
  }

  write(data: string): void {
    this.terminal?.write(data);
  }

  onData(listener: (data: string) => void): void {
    this.terminal?.onData(listener);
  }

  onResize(listener: (size: { cols: number; rows: number }) => void): void {
    this.terminal?.onResize(listener);
  }

  getDiagnostics(): TerminalRendererDiagnostics {
    const snapshot = this.captureFrameSnapshot();
    if (!snapshot) {
      return {
        rendererMetricsMode: 'fallback-canvas',
        rendererMetricsNote: 'WebGPU renderer metrics unavailable on canvas fallback.',
        activeBuffer: 'unavailable',
        cursorX: null,
        cursorY: null,
        cursorVisible: null,
        cols: 0,
        rows: 0,
        scrollbackLength: 0,
        viewportY: 0,
        wrappedRowCount: 0,
        bracketedPaste: false,
        focusEvents: false,
        mouseTracking: false,
        sgrMouseMode: false,
        viewportPreview: [],
        styledCellCount: 0,
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
      };
    }

    const previewLines: string[] = [];
    let styledCellCount = 0;
    let wrappedRowCount = 0;

    for (const line of snapshot.lines) {
      if (line.isWrapped) {
        wrappedRowCount += 1;
      }

      const translated = line.cells.map((cell) => cell.chars).join('').trim();
      if (translated.length > 0 && previewLines.length < 8) {
        previewLines.push(translated);
      }

      for (const cell of line.cells) {
        if (!cell.chars) continue;
        if (isStyledFrameCell(cell)) {
          styledCellCount += 1;
        }
      }
    }

    return {
      rendererMetricsMode: 'fallback-canvas',
      rendererMetricsNote: 'WebGPU renderer metrics unavailable on canvas fallback.',
      activeBuffer: snapshot.activeBuffer,
      cursorX: snapshot.cursorX,
      cursorY: snapshot.cursorY,
      cursorVisible: snapshot.cursorVisible,
      cols: snapshot.cols,
      rows: snapshot.rows,
      scrollbackLength: snapshot.scrollbackLength,
      viewportY: snapshot.viewportY,
      wrappedRowCount,
      bracketedPaste: this.terminal?.hasBracketedPaste?.() ?? false,
      focusEvents: this.terminal?.hasFocusEvents?.() ?? false,
      mouseTracking: this.terminal?.hasMouseTracking?.() ?? false,
      sgrMouseMode: this.terminal?.getMode?.(1006) ?? false,
      viewportPreview: previewLines,
      styledCellCount,
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
    };
  }

  captureFrameSnapshot(): TerminalFrameSnapshot | null {
    const terminal = this.terminal;
    const activeBuffer = terminal?.buffer.active;
    if (!terminal || !activeBuffer) {
      return null;
    }

    const viewportY = Math.max(0, Math.floor(terminal.getViewportY?.() ?? 0));
    const scrollbackLength = terminal.getScrollbackLength?.() ?? 0;
    const lines = [];

    for (let row = 0; row < terminal.rows; row += 1) {
      const line = activeBuffer.getLine(
        resolveViewportBufferRow(activeBuffer.type, row, terminal.rows, scrollbackLength, viewportY),
      );
      if (!line) {
        lines.push({ isWrapped: false, cells: [] });
        continue;
      }

      const cells: TerminalFrameCell[] = [];
      for (let col = 0; col < line.length; col += 1) {
        const cell = line.getCell(col);
        if (!cell) continue;
        cells.push({
          chars: cell.getChars(),
          width: Math.max(1, cell.getWidth()),
          fgColor: cell.getFgColor(),
          bgColor: cell.getBgColor(),
          bold: cell.isBold() !== 0,
          italic: cell.isItalic() !== 0,
          underline: cell.isUnderline() !== 0,
          inverse: cell.isInverse() !== 0,
          invisible: cell.isInvisible() !== 0,
        });
      }

      lines.push({
        isWrapped: line.isWrapped,
        cells,
      });
    }

    return {
      activeBuffer: activeBuffer.type,
      cols: terminal.cols,
      rows: terminal.rows,
      cursorX: activeBuffer.cursorX,
      cursorY: activeBuffer.cursorY,
      cursorVisible: terminal.getMode?.(25) ?? null,
      scrollbackLength,
      viewportY,
      backgroundColor: this.profile.theme.background,
      foregroundColor: this.profile.theme.foreground,
      cursorColor: this.profile.theme.cursor,
      lines,
    };
  }

  dispose(): void {
    this.terminal?.dispose();
    this.terminal = null;
    this.fitAddon = null;
  }
}

function isStyledFrameCell(cell: TerminalFrameCell): boolean {
  return (
    cell.fgColor !== 0 ||
    cell.bgColor !== 0 ||
    cell.bold ||
    cell.italic ||
    cell.underline
  );
}

function resolveViewportBufferRow(
  activeBufferType: 'normal' | 'alternate',
  viewportRow: number,
  visibleRows: number,
  scrollbackLength: number,
  viewportY: number,
): number {
  if (activeBufferType === 'alternate') {
    return viewportRow;
  }

  if (viewportY > 0) {
    if (viewportRow < viewportY) {
      return scrollbackLength - viewportY + viewportRow;
    }
    return scrollbackLength + viewportRow - viewportY;
  }

  return scrollbackLength + Math.min(viewportRow, visibleRows - 1);
}
