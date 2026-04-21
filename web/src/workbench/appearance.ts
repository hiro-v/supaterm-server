import type { TerminalThemePalette, WorkbenchChromePalette } from '../runtime/contracts';
import {
  createDefaultVisualConfigSource,
  createStaticVisualConfigSource,
  FONT_PRESET_FAMILIES,
  type FontPresetId,
  type VisualConfig,
  type VisualConfigSource,
} from '../runtime/config';

export type WorkbenchAppearance = {
  presetId: 'blackout' | 'custom';
  fontPreset: FontPresetId;
  fontFamily: string;
  fontSize: number;
  cursorBlink: boolean;
  theme: TerminalThemePalette;
  chromePalette: WorkbenchChromePalette;
};

export type FontPresetOption = {
  id: FontPresetId;
  label: string;
  family: string;
};

const FONT_PRESET_OPTIONS: FontPresetOption[] = [
  { id: 'meslo', label: 'MesloLGS NF', family: FONT_PRESET_FAMILIES.meslo },
  { id: 'jetbrains', label: 'JetBrains Mono', family: FONT_PRESET_FAMILIES.jetbrains },
  { id: 'iosevka', label: 'Iosevka Term', family: FONT_PRESET_FAMILIES.iosevka },
  { id: 'sfmono', label: 'SF Mono', family: FONT_PRESET_FAMILIES.sfmono },
  { id: 'system', label: 'System Monospace', family: FONT_PRESET_FAMILIES.system },
  { id: 'custom', label: 'Custom', family: '' },
];

export function listFontPresetOptions(): FontPresetOption[] {
  return FONT_PRESET_OPTIONS.map((option) => ({ ...option }));
}

export function createDefaultWorkbenchAppearance(): WorkbenchAppearance {
  const defaults = createDefaultVisualConfigSource().load({
    id: 'supaterm.runtime.canvas-only',
    terminalRenderer: 'libghosty-canvas',
    preferredRenderer: 'webgpu',
    webgpuApi: false,
    webgl2: false,
    rendererReadiness: 'canvas-only',
  });
  return {
    presetId: 'blackout',
    fontPreset: 'meslo',
    fontFamily: defaults.fontFamily,
    fontSize: defaults.fontSize,
    cursorBlink: defaults.cursorBlink,
    theme: cloneThemePalette(defaults.theme),
    chromePalette: cloneChromePalette(defaults.chromePalette),
  };
}

export function normalizeWorkbenchAppearance(
  parsed: Partial<WorkbenchAppearance> | null | undefined,
): WorkbenchAppearance {
  const defaults = createDefaultWorkbenchAppearance();
  const fontPreset = normalizeFontPreset(parsed?.fontPreset, parsed?.fontFamily);
  const fontFamily = normalizeFontFamily(fontPreset, parsed?.fontFamily, defaults.fontFamily);
  return {
    presetId: parsed?.presetId === 'blackout' ? 'blackout' : 'custom',
    fontPreset,
    fontFamily,
    fontSize: normalizeFontSize(parsed?.fontSize, defaults.fontSize),
    cursorBlink: parsed?.cursorBlink ?? defaults.cursorBlink,
    theme: {
      ...defaults.theme,
      ...(parsed?.theme ?? {}),
    },
    chromePalette: {
      ...defaults.chromePalette,
      ...(parsed?.chromePalette ?? {}),
    },
  };
}

export function cloneWorkbenchAppearance(appearance: WorkbenchAppearance): WorkbenchAppearance {
  return {
    ...appearance,
    theme: cloneThemePalette(appearance.theme),
    chromePalette: cloneChromePalette(appearance.chromePalette),
  };
}

export function createVisualConfigSourceForAppearance(
  appearance: WorkbenchAppearance,
): VisualConfigSource {
  return createStaticVisualConfigSource(buildVisualConfigForAppearance(appearance));
}

export function buildVisualConfigForAppearance(appearance: WorkbenchAppearance): Partial<VisualConfig> {
  return {
    id: `supaterm.${appearance.presetId}`,
    themeId: `supaterm.theme.${appearance.presetId}`,
    fontFamily: appearance.fontFamily,
    fontSize: appearance.fontSize,
    cursorBlink: appearance.cursorBlink,
    theme: cloneThemePalette(appearance.theme),
    chromePalette: cloneChromePalette(appearance.chromePalette),
  };
}

function normalizeFontPreset(
  preset: FontPresetId | undefined,
  family: string | undefined,
): FontPresetId {
  if (preset && FONT_PRESET_OPTIONS.some((option) => option.id === preset)) {
    return preset;
  }
  const trimmed = family?.trim();
  if (!trimmed) {
    return 'meslo';
  }
  const matched = FONT_PRESET_OPTIONS.find((option) => option.id !== 'custom' && option.family === trimmed);
  return matched?.id ?? 'custom';
}

function normalizeFontFamily(
  preset: FontPresetId,
  family: string | undefined,
  fallback: string,
): string {
  if (preset !== 'custom') {
    return FONT_PRESET_FAMILIES[preset];
  }
  const trimmed = family?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function normalizeFontSize(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }
  return Math.min(32, Math.max(11, Math.round(value)));
}

function cloneThemePalette(theme: TerminalThemePalette): TerminalThemePalette {
  return { ...theme };
}

function cloneChromePalette(palette: WorkbenchChromePalette): WorkbenchChromePalette {
  return { ...palette };
}
