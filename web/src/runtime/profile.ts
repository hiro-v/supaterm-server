import type { BrowserRuntimeProfile } from './renderer';

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

export type TerminalVisualProfile = {
  id: string;
  fontFamily: string;
  fontSize: number;
  cursorBlink: boolean;
  theme: TerminalThemePalette;
  runtime: BrowserRuntimeProfile;
};

export function createTerminalVisualProfile(runtime: BrowserRuntimeProfile): TerminalVisualProfile {
  return {
    id: 'supaterm.neutral-green',
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
    runtime,
  };
}
