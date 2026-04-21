export type TerminalThemePalette = {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selectionBackground: string;
  selectionForeground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
};

export type WorkbenchChromePalette = {
  shellBackground: string;
  shellBackgroundAlt: string;
  glow: string;
  grid: string;
};

export type BrowserRuntimeProfile = {
  id: string;
  terminalRenderer: 'libghosty-canvas' | 'webgpu-experimental';
  preferredRenderer: 'webgpu';
  webgpuApi: boolean;
  webgl2: boolean;
  rendererReadiness: 'webgpu-ready' | 'canvas-only';
};

export type TerminalVisualProfile = {
  id: string;
  themeId: string;
  fontFamily: string;
  fontSize: number;
  cursorBlink: boolean;
  theme: TerminalThemePalette;
  chromePalette: WorkbenchChromePalette;
  runtime: BrowserRuntimeProfile;
};

export type TerminalRendererAdapterDescriptor = {
  id: string;
  family: 'libghosty';
  transport: 'canvas' | 'webgpu';
  activeRenderer: 'libghosty-canvas' | 'webgpu-buffer-rasterized';
  requestedRenderer: 'webgpu' | 'canvas';
  fallbackReason: string | null;
  visualProfileId: string;
  themeId: string;
};

export type TerminalFrameCell = {
  chars: string;
  width: number;
  fgColor: number;
  bgColor: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  inverse: boolean;
  invisible: boolean;
};

export type TerminalFrameLine = {
  isWrapped: boolean;
  cells: TerminalFrameCell[];
};

export type TerminalFrameSnapshot = {
  activeBuffer: 'normal' | 'alternate';
  cols: number;
  rows: number;
  cursorX: number | null;
  cursorY: number | null;
  cursorVisible: boolean | null;
  scrollbackLength: number;
  viewportY: number;
  backgroundColor: string;
  foregroundColor: string;
  cursorColor: string;
  lines: TerminalFrameLine[];
};

export type TerminalRendererDiagnostics = {
  rendererMetricsMode: 'gpu-active' | 'fallback-canvas';
  rendererMetricsNote: string | null;
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
  getDiagnostics(): TerminalRendererDiagnostics;
  dispose(): void;
};

export type WorkbenchChromeSurfaceDescriptor = {
  id: string;
  activeSurface: 'webgpu-gradient' | 'none';
  requestedSurface: 'webgpu-gradient';
  fallbackReason: string | null;
  visualProfileId: string;
};

export type WorkbenchChromeSurface = {
  readonly descriptor: WorkbenchChromeSurfaceDescriptor;
  mount(host: HTMLDivElement): void;
  resize(): void;
  dispose(): void;
};
