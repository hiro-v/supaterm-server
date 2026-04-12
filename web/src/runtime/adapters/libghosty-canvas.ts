import { FitAddon, Terminal, init } from 'libghosty';
import type { TerminalVisualProfile } from '../profile';

const terminalInitPromise = init();

export type TerminalRendererAdapterDescriptor = {
  id: string;
  family: 'libghosty';
  transport: 'canvas';
  activeRenderer: 'libghosty-canvas';
  requestedRenderer: 'webgpu' | 'canvas';
  fallbackReason: string | null;
};

export type TerminalRendererAdapter = {
  readonly descriptor: TerminalRendererAdapterDescriptor;
  readonly cols: number;
  readonly rows: number;
  start(): Promise<void>;
  mount(host: HTMLDivElement): void;
  fit(): void;
  focus(): void;
  write(data: string): void;
  onData(listener: (data: string) => void): void;
  onResize(listener: (size: { cols: number; rows: number }) => void): void;
  dispose(): void;
};

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
        ? 'WebGPU renderer is not implemented yet; using libghosty canvas runtime.'
        : null,
    };
  }

  get cols(): number {
    return this.terminal?.cols ?? 80;
  }

  get rows(): number {
    return this.terminal?.rows ?? 24;
  }

  async start(): Promise<void> {
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

  dispose(): void {
    this.terminal?.dispose();
    this.terminal = null;
    this.fitAddon = null;
  }
}
