import type {
  BrowserRuntimeProfile,
  TerminalThemePalette,
  TerminalVisualProfile,
  WorkbenchChromePalette,
} from './contracts';

export type FontPresetId = 'meslo' | 'jetbrains' | 'iosevka' | 'sfmono' | 'system' | 'custom';

export const FONT_PRESET_FAMILIES: Record<Exclude<FontPresetId, 'custom'>, string> = {
  meslo:
    '"MesloLGS NF", "MesloLGS Nerd Font Mono", "Symbols Nerd Font Mono", monospace',
  jetbrains:
    '"JetBrains Mono", "JetBrainsMono Nerd Font", "Symbols Nerd Font Mono", monospace',
  iosevka:
    '"Iosevka Term", "Symbols Nerd Font Mono", monospace',
  sfmono:
    '"SF Mono", ui-monospace, monospace',
  system:
    'ui-monospace, monospace',
};

export function resolveFontPresetFamily(preset: Exclude<FontPresetId, 'custom'>): string {
  return FONT_PRESET_FAMILIES[preset];
}

export const DEFAULT_TERMINAL_THEME: TerminalThemePalette = {
  background: '#000000',
  foreground: '#ffffff',
  cursor: '#ffffff',
  cursorAccent: '#000000',
  selectionBackground: '#303030',
  selectionForeground: '#ffffff',
  black: '#000000',
  red: '#ff5f5f',
  green: '#5fff87',
  yellow: '#ffd75f',
  blue: '#5fafff',
  magenta: '#d787ff',
  cyan: '#5fffff',
  white: '#ffffff',
  brightBlack: '#666666',
  brightRed: '#ff8787',
  brightGreen: '#87ffaf',
  brightYellow: '#ffe58a',
  brightBlue: '#87c7ff',
  brightMagenta: '#ebb9ff',
  brightCyan: '#87ffff',
  brightWhite: '#ffffff',
};

export const DEFAULT_CHROME_PALETTE: WorkbenchChromePalette = {
  shellBackground: '#000000',
  shellBackgroundAlt: '#050505',
  glow: '#424242',
  grid: '#111111',
};

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
        id: 'supaterm.blackout',
        themeId: 'supaterm.theme.blackout',
        fontFamily: FONT_PRESET_FAMILIES.meslo,
        fontSize: 15,
        cursorBlink: true,
        theme: DEFAULT_TERMINAL_THEME,
        chromePalette: DEFAULT_CHROME_PALETTE,
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
