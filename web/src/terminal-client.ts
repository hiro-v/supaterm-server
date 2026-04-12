import {
  buildSessionWebSocketUrl,
  decodeTerminalMessage,
  resolveSessionToken,
  type SessionConnectionDetails,
} from './session';
import { createPaneRuntime } from './runtime/runtime';

export type TerminalPaneClientOptions = {
  mount: HTMLDivElement;
  statsLabel: HTMLSpanElement;
  status: HTMLSpanElement;
  session: SessionConnectionDetails;
};

export type PaneTelemetry = {
  fps: number | null;
  latencyMs: number | null;
  sessionId: string;
  runtimeProfileId: string;
  activeRenderer: string;
  requestedRenderer: string;
  rendererFallbackReason: string | null;
  webgpuApi: boolean;
  webgl2: boolean;
};

export class TerminalPaneClient {
  readonly mount: HTMLDivElement;
  private readonly statsLabel: HTMLSpanElement;
  private readonly status: HTMLSpanElement;
  private readonly session: SessionConnectionDetails;
  private readonly runtime = createPaneRuntime();

  private socket: WebSocket | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private unsubscribeLatencyProbe: (() => void) | null = null;
  private disposed = false;
  private focusHandlerBound = false;
  private focusTimer: number | null = null;
  private animationFrame: number | null = null;
  private pendingResizeFrame: number | null = null;
  private queuedResize: { cols: number; rows: number } | null = null;
  private lastSentResize: { cols: number; rows: number } | null = null;
  private fpsWindowStart = 0;
  private fpsFrames = 0;
  private fps: number | null = null;
  private latencyMs: number | null = null;

  constructor(options: TerminalPaneClientOptions) {
    this.mount = options.mount;
    this.statsLabel = options.statsLabel;
    this.status = options.status;
    this.session = options.session;
    this.latencyMs = this.runtime.latencyProbe.getSnapshot().latencyMs;
    this.renderTelemetry();
  }

  async start(): Promise<void> {
    await this.runtime.renderer.start();
    if (this.disposed || this.socket) return;

    const token = await resolveSessionToken(window.location, this.session);
    if (this.disposed) return;

    this.runtime.renderer.mount(this.mount);
    this.attachFocusBridge();

    this.socket = new WebSocket(
      buildSessionWebSocketUrl(
        window.location,
        this.session.sessionId,
        token,
        this.runtime.renderer.cols,
        this.runtime.renderer.rows,
      ),
    );

    this.socket.addEventListener('open', () => {
      this.setStatus('Connected', 'connected');
      this.startTelemetry();
      this.lastSentResize = null;
      this.refit();
    });

    this.socket.addEventListener('close', () => {
      this.setStatus('Closed', 'closed');
      this.stopTelemetry();
      this.runtime.renderer.write('\r\n\x1b[33mSession closed\x1b[0m\r\n');
    });

    this.socket.addEventListener('error', () => {
      this.setStatus('Error', 'error');
    });

    this.socket.addEventListener('message', async (event: MessageEvent) => {
      const text = await decodeTerminalMessage(event.data);
      if (text.length > 0) {
        this.runtime.renderer.write(text);
      }
    });

    this.runtime.renderer.onData((data: string) => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(data);
      }
    });

    this.runtime.renderer.onResize(({ cols, rows }: { cols: number; rows: number }) => {
      this.queueResize(cols, rows);
    });

    this.resizeObserver = new ResizeObserver(() => {
      this.refit();
    });
    this.resizeObserver.observe(this.mount);
    this.setStatus('Connecting…', 'connecting');
    this.focusInput();
  }

  activate(): void {
    this.focusInput();
    this.refit();
  }

  dispose(): void {
    this.disposed = true;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    if (this.socket && this.socket.readyState <= WebSocket.OPEN) {
      this.socket.close();
    }
    this.socket = null;
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
    this.runtime.renderer.dispose();
  }

  private refit(): void {
    if (!this.mount.isConnected) return;

    queueMicrotask(() => {
      if (!this.mount.isConnected) return;
      this.runtime.renderer.fit();
      this.queueResize(this.runtime.renderer.cols, this.runtime.renderer.rows);
    });
  }

  private setStatus(label: string, tone: 'connecting' | 'connected' | 'closed' | 'error'): void {
    this.status.textContent = label;
    this.status.dataset.tone = tone;
  }

  getTelemetry(): PaneTelemetry {
    return {
      fps: this.fps,
      latencyMs: this.latencyMs,
      sessionId: this.session.sessionId,
      runtimeProfileId: this.runtime.runtimeProfile.id,
      activeRenderer: this.runtime.renderer.descriptor.activeRenderer,
      requestedRenderer: this.runtime.renderer.descriptor.requestedRenderer,
      rendererFallbackReason: this.runtime.renderer.descriptor.fallbackReason,
      webgpuApi: this.runtime.runtimeProfile.webgpuApi,
      webgl2: this.runtime.runtimeProfile.webgl2,
    };
  }

  private attachFocusBridge(): void {
    if (this.focusHandlerBound) return;
    this.mount.addEventListener('pointerdown', this.handleFocusIntent);
    this.mount.addEventListener('click', this.handleFocusIntent);
    this.focusHandlerBound = true;
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
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    if (this.lastSentResize?.cols === cols && this.lastSentResize.rows === rows) {
      return;
    }
    this.lastSentResize = { cols, rows };
    this.socket.send(JSON.stringify({ type: 'resize', cols, rows }));
  }

  private renderTelemetry(): void {
    const renderer = this.runtime.renderer.descriptor.activeRenderer;
    const fps = this.fps == null ? '-- fps' : `${Math.round(this.fps)} fps`;
    const latency = this.latencyMs == null ? '-- ms' : `${Math.round(this.latencyMs)} ms`;
    this.statsLabel.textContent = `${renderer} · ${fps} · ${latency}`;
  }
}
