import { type SessionConnectionDetails } from './session';
import { markSupatermPerf, updateSupatermAttachTrace } from './perf';
import { createPaneRuntime, type AppRuntime } from './runtime/runtime';
import { TerminalSessionConnection } from './terminal-session';
import { createLocalStorageTerminalHydrationStore, type TerminalHydrationStore } from './terminal-hydration';

export type TerminalPaneClientOptions = {
  mount: HTMLDivElement;
  statsLabel: HTMLSpanElement;
  status: HTMLSpanElement;
  session: SessionConnectionDetails;
  hydrationStore?: TerminalHydrationStore;
};

export type PaneTelemetry = {
  fps: number | null;
  latencyMs: number | null;
  sessionId: string;
  runtimeProfileId: string;
  visualProfileId: string;
  themeId: string;
  activeRenderer: string;
  requestedRenderer: string;
  rendererFallbackReason: string | null;
  rendererMetricsMode: 'gpu-active' | 'fallback-canvas';
  rendererMetricsNote: string | null;
  webgpuApi: boolean;
  webgl2: boolean;
  activeBuffer: 'normal' | 'alternate' | 'unavailable';
  cursorX: number | null;
  cursorY: number | null;
  cursorVisible: boolean | null;
  cols: number;
  rows: number;
  scrollbackLength: number;
  viewportY: number;
  wrappedRowCount: number;
  bracketedPaste: boolean;
  focusEvents: boolean;
  mouseTracking: boolean;
  sgrMouseMode: boolean;
  viewportPreview: string[];
  styledCellCount: number;
  atlasGlyphEntries: number | null;
  atlasWidth: number | null;
  atlasHeight: number | null;
  atlasResetCount: number | null;
  activeGlyphQuads: number | null;
  activeRects: number | null;
  rectBufferCapacityBytes: number | null;
  glyphBufferCapacityBytes: number | null;
  uploadBytes: number | null;
  frameCpuMs: number | null;
  frameCpuAvgMs: number | null;
  sessionReused: boolean | null;
  sessionAgeMs: number | null;
  outputPumpStartedMs: number | null;
  firstBackendReadMs: number | null;
  firstBroadcastMs: number | null;
};

export class TerminalPaneClient {
  readonly mount: HTMLDivElement;
  private readonly statsLabel: HTMLSpanElement;
  private readonly status: HTMLSpanElement;
  private readonly session: SessionConnectionDetails;
  private readonly runtime;
  private readonly hydrationStore: TerminalHydrationStore;

  private connection: TerminalSessionConnection | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private unsubscribeLatencyProbe: (() => void) | null = null;
  private disposed = false;
  private focusHandlerBound = false;
  private focusTimer: number | null = null;
  private animationFrame: number | null = null;
  private pendingResizeFrame: number | null = null;
  private reconnectTimer: number | null = null;
  private queuedResize: { cols: number; rows: number } | null = null;
  private lastSentResize: { cols: number; rows: number } | null = null;
  private reconnectAttempts = 0;
  private startPromise: Promise<void> | null = null;
  private fpsWindowStart = 0;
  private fpsFrames = 0;
  private fps: number | null = null;
  private latencyMs: number | null = null;
  private sessionReused: boolean | null = null;
  private sessionAgeMs: number | null = null;
  private outputPumpStartedMs: number | null = null;
  private firstBackendReadMs: number | null = null;
  private firstBroadcastMs: number | null = null;
  private rendererReady = false;
  private rendererBridged = false;
  private hydratedRenderer = false;
  private pendingOutput = '';
  private pendingRefit = false;

  constructor(options: TerminalPaneClientOptions, appRuntime?: AppRuntime) {
    this.mount = options.mount;
    this.statsLabel = options.statsLabel;
    this.status = options.status;
    this.session = options.session;
    this.runtime = createPaneRuntime(appRuntime);
    this.hydrationStore = options.hydrationStore ?? createLocalStorageTerminalHydrationStore();
    this.latencyMs = this.runtime.latencyProbe.getSnapshot().latencyMs;
    this.renderTelemetry();
  }

  async start(): Promise<void> {
    if (this.disposed) return;
    if (this.startPromise) {
      await this.startPromise;
      return;
    }

    this.startPromise = this.startInternal().finally(() => {
      this.startPromise = null;
    });
    await this.startPromise;
  }

  activate(): void {
    this.focusInput();
    this.refit();
  }

  dispose(): void {
    this.disposed = true;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    this.connection?.dispose();
    this.connection = null;
    if (this.reconnectTimer != null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.detachFocusBridge();
    this.stopTelemetry();
    if (this.focusTimer !== null) {
      window.clearTimeout(this.focusTimer);
      this.focusTimer = null;
    }
    if (this.pendingResizeFrame != null) {
      window.cancelAnimationFrame(this.pendingResizeFrame);
      this.pendingResizeFrame = null;
    }
    this.startPromise = null;
    this.runtime.renderer.dispose();
  }

  private async startInternal(): Promise<void> {
    if (!this.rendererReady) {
      this.setStatus('Connecting…', 'connecting');
      const connectPromise = this.openConnection();
      await this.runtime.renderer.start();
      if (this.disposed) return;

      this.runtime.renderer.mount(this.mount);
      this.attachFocusBridge();
      this.rendererReady = true;
      markSupatermPerf('renderer-ready');
      this.attachRendererBridges();
      this.flushPendingOutput();
      if (this.pendingRefit) {
        this.pendingRefit = false;
        this.refit();
      }
      await connectPromise.catch(() => {
        if (!this.disposed) {
          this.scheduleReconnect();
        }
      });
    } else if (!this.connection) {
      this.setStatus(this.reconnectAttempts > 0 ? 'Reconnecting…' : 'Connecting…', 'connecting');
      await this.openConnection().catch(() => {
        if (!this.disposed) {
          this.scheduleReconnect();
        }
      });
    }

    if (this.resizeObserver == null) {
      this.resizeObserver = new ResizeObserver(() => {
        this.refit();
      });
      this.resizeObserver.observe(this.mount);
    }
    this.focusInput();
  }

  private attachRendererBridges(): void {
    if (this.rendererBridged) return;
    this.rendererBridged = true;
    this.runtime.renderer.onData((data: string) => {
      this.connection?.sendInput(data);
    });
    this.runtime.renderer.onResize(({ cols, rows }: { cols: number; rows: number }) => {
      this.queueResize(cols, rows);
    });
  }

  private refit(): void {
    if (!this.rendererReady || !this.mount.isConnected) {
      this.pendingRefit = true;
      return;
    }

    queueMicrotask(() => {
      if (!this.rendererReady || !this.mount.isConnected) return;
      this.runtime.renderer.fit();
      this.queueResize(this.runtime.renderer.cols, this.runtime.renderer.rows);
    });
  }

  private setStatus(label: string, tone: 'connecting' | 'connected' | 'closed' | 'error'): void {
    this.status.textContent = label;
    this.status.dataset.tone = tone;
  }

  getTelemetry(): PaneTelemetry {
    const diagnostics = this.runtime.renderer.getDiagnostics();
    return {
      fps: this.fps,
      latencyMs: this.latencyMs,
      sessionId: this.session.sessionId,
      runtimeProfileId: this.runtime.runtimeProfile.id,
      visualProfileId: this.runtime.visualProfile.id,
      themeId: this.runtime.visualProfile.themeId,
      activeRenderer: this.runtime.renderer.descriptor.activeRenderer,
      requestedRenderer: this.runtime.renderer.descriptor.requestedRenderer,
      rendererFallbackReason: this.runtime.renderer.descriptor.fallbackReason,
      rendererMetricsMode: diagnostics.rendererMetricsMode,
      rendererMetricsNote: diagnostics.rendererMetricsNote,
      webgpuApi: this.runtime.runtimeProfile.webgpuApi,
      webgl2: this.runtime.runtimeProfile.webgl2,
      activeBuffer: diagnostics.activeBuffer,
      cursorX: diagnostics.cursorX,
      cursorY: diagnostics.cursorY,
      cursorVisible: diagnostics.cursorVisible,
      cols: diagnostics.cols,
      rows: diagnostics.rows,
      scrollbackLength: diagnostics.scrollbackLength,
      viewportY: diagnostics.viewportY,
      wrappedRowCount: diagnostics.wrappedRowCount,
      bracketedPaste: diagnostics.bracketedPaste,
      focusEvents: diagnostics.focusEvents,
      mouseTracking: diagnostics.mouseTracking,
      sgrMouseMode: diagnostics.sgrMouseMode,
      viewportPreview: diagnostics.viewportPreview,
      styledCellCount: diagnostics.styledCellCount,
      atlasGlyphEntries: diagnostics.atlasGlyphEntries,
      atlasWidth: diagnostics.atlasWidth,
      atlasHeight: diagnostics.atlasHeight,
      atlasResetCount: diagnostics.atlasResetCount,
      activeGlyphQuads: diagnostics.activeGlyphQuads,
      activeRects: diagnostics.activeRects,
      rectBufferCapacityBytes: diagnostics.rectBufferCapacityBytes,
      glyphBufferCapacityBytes: diagnostics.glyphBufferCapacityBytes,
      uploadBytes: diagnostics.uploadBytes,
      frameCpuMs: diagnostics.frameCpuMs,
      frameCpuAvgMs: diagnostics.frameCpuAvgMs,
      sessionReused: this.sessionReused,
      sessionAgeMs: this.sessionAgeMs,
      outputPumpStartedMs: this.outputPumpStartedMs,
      firstBackendReadMs: this.firstBackendReadMs,
      firstBroadcastMs: this.firstBroadcastMs,
    };
  }

  private attachFocusBridge(): void {
    if (this.focusHandlerBound) return;
    this.mount.addEventListener('pointerdown', this.handleFocusIntent);
    this.mount.addEventListener('click', this.handleFocusIntent);
    this.focusHandlerBound = true;
  }

  private async openConnection(): Promise<void> {
    if (this.disposed || this.connection) return;
    this.setStatus(this.reconnectAttempts > 0 ? 'Reconnecting…' : 'Connecting…', 'connecting');
    this.connection = new TerminalSessionConnection({
      session: this.session,
      onOpen: () => {
        this.reconnectAttempts = 0;
        if (this.reconnectTimer != null) {
          window.clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
        this.setStatus('Connected', 'connected');
        markSupatermPerf('first-pane-connected');
        this.startTelemetry();
        this.lastSentResize = null;
        if (this.rendererReady) {
          this.refit();
        } else {
          this.pendingRefit = true;
        }
      },
      onSocketOpen: () => {
        markSupatermPerf('websocket-open');
      },
      onClose: () => {
        this.connection = null;
        this.stopTelemetry();
        if (this.disposed) {
          this.setStatus('Closed', 'closed');
          return;
        }
        this.scheduleReconnect();
      },
      onError: () => {
        if (!this.disposed) {
          this.setStatus('Reconnecting…', 'connecting');
        } else {
          this.setStatus('Error', 'error');
        }
      },
      onText: (text) => {
        this.hydrationStore.append(this.session.sessionId, text);
        if (!this.rendererReady) {
          this.pendingOutput += text;
          return;
        }
        this.runtime.renderer.write(text);
      },
      onFirstText: () => {
        markSupatermPerf('first-terminal-bytes');
      },
      onAttachTrace: (trace) => {
        this.sessionReused = trace.session_reused;
        this.sessionAgeMs = trace.session_age_ms;
        this.outputPumpStartedMs = trace.output_pump_started_ms;
        this.firstBackendReadMs = trace.first_backend_read_ms;
        this.firstBroadcastMs = trace.first_broadcast_ms;
        updateSupatermAttachTrace({
          sessionReused: trace.session_reused,
          sessionAgeMs: trace.session_age_ms,
          outputPumpStartedMs: trace.output_pump_started_ms,
          firstBackendReadMs: trace.first_backend_read_ms,
          firstBroadcastMs: trace.first_broadcast_ms,
        });
      },
    });
    try {
      await this.connection.connect({
        cols: this.runtime.renderer.cols,
        rows: this.runtime.renderer.rows,
      });
    } catch (error) {
      this.connection = null;
      throw error;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer != null || this.disposed) return;
    const delayMs = Math.min(200 * (2 ** this.reconnectAttempts), 2_000);
    this.reconnectAttempts += 1;
    this.setStatus('Reconnecting…', 'connecting');
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      void this.openConnection().catch(() => {
        if (!this.disposed) {
          this.scheduleReconnect();
        }
      });
    }, delayMs);
  }

  private hydrateFromStore(): void {
    if (this.hydratedRenderer) return;
    this.hydratedRenderer = true;
    const snapshot = this.hydrationStore.read(this.session.sessionId);
    if (!snapshot) return;
    this.runtime.renderer.write(snapshot);
  }

  private flushPendingOutput(): void {
    if (!this.rendererReady) return;
    if (this.pendingOutput.length === 0) return;
    if (!this.hydratedRenderer) {
      this.hydrateFromStore();
    }
    this.runtime.renderer.write(this.pendingOutput);
    this.pendingOutput = '';
  }

  private detachFocusBridge(): void {
    if (!this.focusHandlerBound) return;
    this.mount.removeEventListener('pointerdown', this.handleFocusIntent);
    this.mount.removeEventListener('click', this.handleFocusIntent);
    this.focusHandlerBound = false;
  }

  private readonly handleFocusIntent = () => {
    this.focusInput();
    if (this.focusTimer !== null) {
      window.clearTimeout(this.focusTimer);
    }
    this.focusTimer = window.setTimeout(() => {
      this.focusTimer = null;
      this.focusInput();
    }, 32);
  };

  private focusInput(): void {
    if (!this.mount.isConnected) return;
    const textarea = this.mount.querySelector('textarea');
    if (textarea instanceof HTMLTextAreaElement) {
      textarea.focus();
      return;
    }
    this.runtime.renderer.focus();
  }

  private startTelemetry(): void {
    if (this.animationFrame == null) {
      this.fpsWindowStart = performance.now();
      this.fpsFrames = 0;
      this.animationFrame = window.requestAnimationFrame(this.sampleFrame);
    }

    if (this.unsubscribeLatencyProbe == null) {
      this.unsubscribeLatencyProbe = this.runtime.latencyProbe.subscribe((snapshot) => {
        this.latencyMs = snapshot.latencyMs;
        this.renderTelemetry();
      });
    }
  }

  private stopTelemetry(): void {
    if (this.animationFrame != null) {
      window.cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    if (this.unsubscribeLatencyProbe != null) {
      this.unsubscribeLatencyProbe();
      this.unsubscribeLatencyProbe = null;
    }
  }

  private readonly sampleFrame = (timestamp: number) => {
    if (this.disposed) return;
    this.fpsFrames += 1;
    const elapsed = timestamp - this.fpsWindowStart;
    if (elapsed >= 500) {
      this.fps = (this.fpsFrames * 1000) / elapsed;
      this.fpsFrames = 0;
      this.fpsWindowStart = timestamp;
      this.renderTelemetry();
    }
    this.animationFrame = window.requestAnimationFrame(this.sampleFrame);
  };

  private queueResize(cols: number, rows: number): void {
    this.queuedResize = { cols, rows };
    if (this.pendingResizeFrame != null) return;
    this.pendingResizeFrame = window.requestAnimationFrame(() => {
      this.pendingResizeFrame = null;
      const next = this.queuedResize;
      this.queuedResize = null;
      if (!next) return;
      this.sendResizeIfNeeded(next.cols, next.rows);
    });
  }

  private sendResizeIfNeeded(cols: number, rows: number): void {
    if (this.lastSentResize?.cols === cols && this.lastSentResize.rows === rows) {
      return;
    }
    this.lastSentResize = { cols, rows };
    this.connection?.resize(cols, rows);
  }

  private renderTelemetry(): void {
    const renderer = this.runtime.renderer.descriptor.activeRenderer;
    const fps = this.fps == null ? '-- fps' : `${Math.round(this.fps)} fps`;
    const latency = this.latencyMs == null ? '-- ms' : `${Math.round(this.latencyMs)} ms`;
    this.statsLabel.textContent = `${renderer} · ${fps} · ${latency}`;
  }
}
