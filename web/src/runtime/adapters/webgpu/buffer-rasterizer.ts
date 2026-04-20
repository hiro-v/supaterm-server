import type { TerminalFrameCell, TerminalFrameSnapshot, TerminalVisualProfile } from '../../contracts';
import { GlyphAtlas, type GlyphAtlasEntry } from './glyph-atlas';

const CURSOR_ALPHA = 0.34;

export type TerminalFrameRasterizerOptions = {
  profile: TerminalVisualProfile;
  glyphAtlas?: GlyphAtlas;
};

export type GlyphQuad = {
  x: number;
  y: number;
  width: number;
  height: number;
  atlas: GlyphAtlasEntry;
};

export type FillRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
};

export type TerminalFrameScene = {
  width: number;
  height: number;
  backgroundColor: string;
  backgroundRects: FillRect[];
  overlayRects: FillRect[];
  glyphs: GlyphQuad[];
};

export class TerminalFrameRasterizer {
  private readonly profile: TerminalVisualProfile;
  private readonly glyphAtlas: GlyphAtlas;

  constructor(options: TerminalFrameRasterizerOptions) {
    this.profile = options.profile;
    this.glyphAtlas = options.glyphAtlas ?? new GlyphAtlas();
  }

  get atlasSize(): number {
    return this.glyphAtlas.size;
  }

  getGlyphAtlas(): GlyphAtlas {
    return this.glyphAtlas;
  }

  buildScene(
    snapshot: TerminalFrameSnapshot,
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
  ): TerminalFrameScene {
    const cellWidth = width / Math.max(1, snapshot.cols);
    const cellHeight = height / Math.max(1, snapshot.rows);
    const fontSize = Math.max(11, Math.floor(Math.min(cellHeight * 0.82, this.profile.fontSize * 1.12)));
    const baseline = measureBaseline(context, fontSize, this.profile.fontFamily, cellHeight);
    const themeBackground = snapshot.backgroundColor;
    const themeForeground = snapshot.foregroundColor;
    const cursorColor = snapshot.cursorColor;

    const scene: TerminalFrameScene = {
      width,
      height,
      backgroundColor: themeBackground,
      backgroundRects: [],
      overlayRects: [],
      glyphs: [],
    };

    for (let row = 0; row < snapshot.rows; row += 1) {
      const line = snapshot.lines[row];
      if (!line) continue;
      let wideContinuationUntil = -1;

      for (let col = 0; col < snapshot.cols; col += 1) {
        const cell = line.cells[col];
        if (!cell) continue;
        if (!cell.chars && col <= wideContinuationUntil) {
          continue;
        }

        const spanWidth = Math.max(1, cell.width) * cellWidth;
        const x = col * cellWidth;
        const y = row * cellHeight;
        const colors = resolveCellColors(cell, themeForeground, themeBackground);
        const isCursor = snapshot.cursorVisible === true && snapshot.cursorX === col && snapshot.cursorY === row;

        if (cell.width > 1 && cell.chars) {
          wideContinuationUntil = col + cell.width - 1;
        }

        if (colors.background !== themeBackground) {
          scene.backgroundRects.push({
            x,
            y,
            width: spanWidth,
            height: cellHeight,
            color: colors.background,
          });
        }

        if (isCursor) {
          scene.overlayRects.push({
            x,
            y,
            width: spanWidth,
            height: cellHeight,
            color: withAlpha(cursorColor, CURSOR_ALPHA),
          });
        }

        if (cell.chars && !cell.invisible) {
          const font = formatFont(fontSize, this.profile.fontFamily, cell);
          const foreground = isCursor ? themeBackground : colors.foreground;
          const glyph = this.glyphAtlas.getOrCreate({
            chars: cell.chars,
            font,
            color: foreground,
            width: spanWidth,
            height: cellHeight,
            baseline,
          });

          scene.glyphs.push({
            x,
            y,
            width: spanWidth,
            height: cellHeight,
            atlas: glyph,
          });

          if (cell.underline) {
            scene.overlayRects.push({
              x,
              y: y + cellHeight - Math.max(1, cellHeight * 0.08),
              width: spanWidth,
              height: Math.max(1, cellHeight * 0.05),
              color: foreground,
            });
          }
        }
      }
    }

    return scene;
  }

  paintBackgroundLayer(context: CanvasRenderingContext2D, scene: TerminalFrameScene): void {
    context.save();
    context.clearRect(0, 0, scene.width, scene.height);
    context.fillStyle = scene.backgroundColor;
    context.fillRect(0, 0, scene.width, scene.height);

    for (const rect of scene.backgroundRects) {
      context.fillStyle = rect.color;
      context.fillRect(rect.x, rect.y, rect.width, rect.height);
    }

    for (const rect of scene.overlayRects) {
      context.fillStyle = rect.color;
      context.fillRect(rect.x, rect.y, rect.width, rect.height);
    }

    context.restore();
  }

  rasterize(
    snapshot: TerminalFrameSnapshot,
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
  ): void {
    const scene = this.buildScene(snapshot, context, width, height);
    this.paintBackgroundLayer(context, scene);

    for (const glyph of scene.glyphs) {
      context.drawImage(
        this.glyphAtlas.getCanvas(),
        glyph.atlas.sourceX,
        glyph.atlas.sourceY,
        glyph.atlas.sourceWidth,
        glyph.atlas.sourceHeight,
        glyph.x,
        glyph.y,
        glyph.width,
        glyph.height,
      );
    }
  }
}

function measureBaseline(
  context: CanvasRenderingContext2D,
  fontSize: number,
  fontFamily: string,
  cellHeight: number,
): number {
  context.save();
  context.font = `${fontSize}px ${fontFamily}`;
  const metrics = context.measureText('Mg');
  context.restore();
  const ascent = metrics.actualBoundingBoxAscent || fontSize * 0.72;
  const descent = metrics.actualBoundingBoxDescent || fontSize * 0.2;
  const textHeight = ascent + descent;
  const topPadding = Math.max(0, (cellHeight - textHeight) / 2);
  return topPadding + ascent;
}

function resolveCellColors(
  cell: TerminalFrameCell,
  themeForeground: string,
  themeBackground: string,
): { foreground: string; background: string } {
  const foreground = cell.fgColor === 0 ? themeForeground : toCssColor(cell.fgColor);
  const background = cell.bgColor === 0 ? themeBackground : toCssColor(cell.bgColor);
  if (cell.inverse) {
    return { foreground: background, background: foreground };
  }
  return { foreground, background };
}

function formatFont(fontSize: number, fontFamily: string, cell: TerminalFrameCell): string {
  const fontParts = [];
  if (cell.italic) fontParts.push('italic');
  if (cell.bold) fontParts.push('700');
  fontParts.push(`${fontSize}px`);
  fontParts.push(fontFamily);
  return fontParts.join(' ');
}

function toCssColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

function withAlpha(color: string, alpha: number): string {
  const normalized = color.startsWith('#') ? color.slice(1) : color;
  if (normalized.length !== 6) return color;
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
