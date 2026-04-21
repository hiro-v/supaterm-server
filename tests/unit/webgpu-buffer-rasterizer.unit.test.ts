import { describe, expect, test } from 'bun:test';
import { ensureDom } from '../helpers/dom';
import { buildBrowserRuntimeProfile } from '../../web/src/runtime/renderer';
import { createTerminalVisualProfile } from '../../web/src/runtime/profile';
import { createStaticVisualConfigSource } from '../../web/src/runtime/config';
import { GlyphAtlas } from '../../web/src/runtime/adapters/webgpu/glyph-atlas';
import { TerminalFrameRasterizer } from '../../web/src/runtime/adapters/webgpu/buffer-rasterizer';
import { __testing__ as webGpuPreferredTesting } from '../../web/src/runtime/adapters/webgpu-preferred';
import type { TerminalFrameSnapshot } from '../../web/src/runtime/contracts';

describe('webgpu terminal buffer rasterizer', () => {
  test('glyph atlas dedupes repeated glyph requests', () => {
    ensureDom();

    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext(kind: string) {
      if (kind !== '2d') return null;
      return createFakeDrawingContext() as unknown as RenderingContext;
    };

    const atlas = new GlyphAtlas(128);
    try {
      const first = atlas.getOrCreate({
        chars: 'A',
        font: '14px monospace',
        color: '#ffffff',
        width: 12,
        height: 20,
        baseline: 14,
      });
      const second = atlas.getOrCreate({
        chars: 'A',
        font: '14px monospace',
        color: '#ffffff',
        width: 12,
        height: 20,
        baseline: 14,
      });

      expect(atlas.size).toBe(1);
      expect(second).toEqual(first);
    } finally {
      HTMLCanvasElement.prototype.getContext = originalGetContext;
    }
  });

  test('glyph atlas grows before resetting when capacity is exhausted', () => {
    ensureDom();

    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext(kind: string) {
      if (kind !== '2d') return null;
      return createFakeDrawingContext() as unknown as RenderingContext;
    };

    const atlas = new GlyphAtlas(16, 64);
    try {
      atlas.getOrCreate({
        chars: 'A',
        font: '14px monospace',
        color: '#ffffff',
        width: 10,
        height: 10,
        baseline: 8,
      });
      atlas.getOrCreate({
        chars: 'B',
        font: '14px monospace',
        color: '#ffffff',
        width: 10,
        height: 10,
        baseline: 8,
      });

      expect(atlas.width).toBeGreaterThan(16);
      expect(atlas.size).toBe(2);
      expect(atlas.resets).toBe(0);
    } finally {
      HTMLCanvasElement.prototype.getContext = originalGetContext;
    }
  });

  test('glyph atlas tracks reset count once max size is exhausted', () => {
    ensureDom();

    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext(kind: string) {
      if (kind !== '2d') return null;
      return createFakeDrawingContext() as unknown as RenderingContext;
    };

    const atlas = new GlyphAtlas(16, 16);
    try {
      atlas.getOrCreate({
        chars: 'A',
        font: '14px monospace',
        color: '#ffffff',
        width: 10,
        height: 10,
        baseline: 8,
      });
      atlas.getOrCreate({
        chars: 'B',
        font: '14px monospace',
        color: '#ffffff',
        width: 10,
        height: 10,
        baseline: 8,
      });

      expect(atlas.resets).toBe(1);
      expect(atlas.size).toBe(1);
    } finally {
      HTMLCanvasElement.prototype.getContext = originalGetContext;
    }
  });

  test('rasterizer paints wide cells, backgrounds, and cached glyphs without duplicating glyph entries', () => {
    const context = createFakeDrawingContext();
    const fakeAtlas = createFakeAtlas();

    const rasterizer = new TerminalFrameRasterizer({
      profile: createTerminalVisualProfile(
        buildBrowserRuntimeProfile({ webgpuApi: true, webgl2: true }),
        createStaticVisualConfigSource({}),
      ),
      glyphAtlas: fakeAtlas as unknown as GlyphAtlas,
    });

    const snapshot: TerminalFrameSnapshot = {
      activeBuffer: 'normal',
      cols: 4,
      rows: 1,
      cursorX: null,
      cursorY: null,
      cursorVisible: false,
      scrollbackLength: 0,
      viewportY: 0,
      backgroundColor: '#101319',
      foregroundColor: '#d8ded8',
      cursorColor: '#f3d38a',
      lines: [{
        isWrapped: false,
        cells: [
          {
            chars: 'A',
            width: 1,
            fgColor: 0xffffff,
            bgColor: 0x331100,
            bold: true,
            italic: false,
            underline: true,
            inverse: false,
            invisible: false,
          },
          {
            chars: '界',
            width: 2,
            fgColor: 0x88ff88,
            bgColor: 0x001133,
            bold: false,
            italic: false,
            underline: false,
            inverse: false,
            invisible: false,
          },
          {
            chars: '',
            width: 1,
            fgColor: 0,
            bgColor: 0,
            bold: false,
            italic: false,
            underline: false,
            inverse: false,
            invisible: false,
          },
          {
            chars: 'A',
            width: 1,
            fgColor: 0xffffff,
            bgColor: 0x331100,
            bold: true,
            italic: false,
            underline: true,
            inverse: false,
            invisible: false,
          },
        ],
      }],
    };

    rasterizer.rasterize(snapshot, context as unknown as CanvasRenderingContext2D, 240, 48);

    expect(context.fillRects).toContainEqual({ x: 0, y: 0, width: 60, height: 48, fillStyle: '#331100' });
    expect(context.fillRects).toContainEqual({ x: 60, y: 0, width: 120, height: 48, fillStyle: '#001133' });
    expect(context.drawCalls).toHaveLength(3);
    expect(context.drawCalls[1]).toMatchObject({ sx: 20, sy: 0, sw: 120, sh: 48, dx: 60, dw: 120, dh: 48 });
    expect(rasterizer.atlasSize).toBe(2);
  });

  test('webgpu dirty upload ranges are aligned to 4-byte writeBuffer boundaries', () => {
    const aligned = webGpuPreferredTesting.alignWriteBufferRange(
      { offset: 13, length: 21 },
      64,
    );

    expect(aligned).toEqual({ offset: 12, length: 24 });
    expect(aligned.offset % 4).toBe(0);
    expect(aligned.length % 4).toBe(0);
  });
});

function createFakeDrawingContext() {
  return {
    fillRects: [] as Array<{ x: number; y: number; width: number; height: number; fillStyle: string }>,
    drawCalls: [] as Array<{ dx: number; dy: number; dw: number; dh: number }>,
    fillStyle: '#000000',
    font: '',
    textBaseline: 'alphabetic',
    textAlign: 'left',
    save() {},
    restore() {},
    clearRect() {},
    fillText() {},
    fillRect(x: number, y: number, width: number, height: number) {
      this.fillRects.push({ x, y, width, height, fillStyle: this.fillStyle });
    },
    drawImage(
      _image: unknown,
      sx: number,
      sy: number,
      sw: number,
      sh: number,
      dx: number,
      dy: number,
      dw: number,
      dh: number,
    ) {
      this.drawCalls.push({ sx, sy, sw, sh, dx, dy, dw, dh });
    },
    measureText() {
      return {
        actualBoundingBoxAscent: 12,
        actualBoundingBoxDescent: 4,
      };
    },
  };
}

function createFakeAtlas() {
  const cache = new Map<string, { x: number; y: number; width: number; height: number; baseline: number }>();
  return {
    get size() {
      return cache.size;
    },
    getCanvas() {
      return {} as HTMLCanvasElement;
    },
    getOrCreate(request: {
      chars: string;
      font: string;
      color: string;
      width: number;
      height: number;
      baseline: number;
    }) {
      const key = `${request.chars}|${request.font}|${request.color}|${request.width}`;
      const existing = cache.get(key);
      if (existing) return existing;
      const created = {
        x: cache.size * 16,
        y: 0,
        width: Math.ceil(request.width),
        height: Math.ceil(request.height),
        sourceX: cache.size * 20,
        sourceY: 0,
        sourceWidth: Math.ceil(request.width),
        sourceHeight: Math.ceil(request.height),
        baseline: request.baseline,
      };
      cache.set(key, created);
      return created;
    },
  };
}
