import type {
  BrowserRuntimeProfile,
  TerminalThemePalette,
  TerminalVisualProfile,
  WorkbenchChromePalette,
} from './contracts';

export type VisualConfig = {
  id: string;
  themeId: string;
  fontFamily: string;
  fontSize: number;
  cursorBlink: boolean;
  theme: TerminalThemePalette;
  chromePalette: WorkbenchChromePalette;
};

export type VisualConfigSource = {
  load(runtime: BrowserRuntimeProfile): VisualConfig;
};

export function createDefaultVisualConfigSource(): VisualConfigSource {
  return {
    load() {
      return {
        id: 'supaterm.neutral-green',
        themeId: 'supaterm.theme.neutral-green',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 14,
        cursorBlink: true,
        theme: {
          background: '#101319',
          foreground: '#ece7dc',
          cursor: '#ece7dc',
          cursorAccent: '#101319',
          selectionBackground: '#cfe48a',
          selectionForeground: '#101319',
          black: '#101319',
          red: '#d28978',
          green: '#c4e177',
          yellow: '#d9e98e',
          blue: '#86acd4',
          magenta: '#bc97d1',
          cyan: '#87c8c8',
          white: '#dfe7cf',
          brightBlack: '#6c7480',
          brightRed: '#e4a08f',
          brightGreen: '#d8f09a',
          brightYellow: '#ebf8b1',
          brightBlue: '#a5c6e7',
          brightMagenta: '#d3b3e5',
          brightCyan: '#9ddede',
          brightWhite: '#fff8ee',
        },
        chromePalette: {
          shellBackground: '#090909',
          shellBackgroundAlt: '#121215',
          glow: '#7db3ff',
          grid: '#1a212a',
        },
      };
    },
  };
}

export function createStaticVisualConfigSource(overrides: Partial<VisualConfig>): VisualConfigSource {
  const base = createDefaultVisualConfigSource().load({
    id: 'supaterm.runtime.canvas-only',
    terminalRenderer: 'libghosty-canvas',
    preferredRenderer: 'webgpu',
    webgpuApi: false,
    webgl2: false,
    rendererReadiness: 'canvas-only',
  });

  return {
    load() {
      return {
        ...base,
        ...overrides,
        theme: {
          ...base.theme,
          ...overrides.theme,
        },
        chromePalette: {
          ...base.chromePalette,
          ...overrides.chromePalette,
        },
      };
    },
  };
}

export function buildTerminalVisualProfile(
  runtime: BrowserRuntimeProfile,
  source: VisualConfigSource = createDefaultVisualConfigSource(),
): TerminalVisualProfile {
  const config = source.load(runtime);
  return {
    ...config,
    runtime,
  };
}
