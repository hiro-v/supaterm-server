type GlyphAtlasEntry = {
  x: number;
  y: number;
  width: number;
  height: number;
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  baseline: number;
};

export type GlyphAtlasRequest = {
  chars: string;
  font: string;
  color: string;
  width: number;
  height: number;
  baseline: number;
};

export class GlyphAtlas {
  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private readonly cache = new Map<string, GlyphAtlasEntry>();
  private cursorX = 0;
  private cursorY = 0;
  private rowHeight = 0;
  private readonly padding = 2;
  private readonly initialSizePx: number;
  private readonly maxSizePx: number;
  private dirty = false;
  private resetCount = 0;

  constructor(size = 1024, maxSize = 4096) {
    this.initialSizePx = size;
    this.maxSizePx = Math.max(size, maxSize);
  }

  getCanvas(): HTMLCanvasElement {
    this.ensureContext();
    return this.canvas as HTMLCanvasElement;
  }

  get size(): number {
    return this.cache.size;
  }

  get width(): number {
    return this.canvas?.width ?? this.initialSizePx;
  }

  get height(): number {
    return this.canvas?.height ?? this.initialSizePx;
  }

  get resets(): number {
    return this.resetCount;
  }

  getOrCreate(request: GlyphAtlasRequest): GlyphAtlasEntry {
    const context = this.ensureContext();
    const key = serializeGlyphRequest(request);
    const cached = this.cache.get(key);
    if (cached) return cached;

    const sourceWidth = Math.max(1, Math.ceil(request.width));
    const sourceHeight = Math.max(1, Math.ceil(request.height));
    const width = sourceWidth + this.padding * 2;
    const height = sourceHeight + this.padding * 2;
    this.ensurePlacement(width, height);

    const entry: GlyphAtlasEntry = {
      x: this.cursorX,
      y: this.cursorY,
      width,
      height,
      sourceX: this.cursorX + this.padding,
      sourceY: this.cursorY + this.padding,
      sourceWidth,
      sourceHeight,
      baseline: request.baseline,
    };

    context.save();
    context.clearRect(entry.x, entry.y, width, height);
    context.font = request.font;
    context.fillStyle = request.color;
    context.fillText(
      request.chars,
      entry.x + this.padding,
      entry.y + this.padding + request.baseline,
    );
    context.restore();
    this.dirty = true;

    this.cache.set(key, entry);
    this.cursorX += width;
    this.rowHeight = Math.max(this.rowHeight, height);
    return entry;
  }

  reset(): void {
    this.cache.clear();
    this.cursorX = 0;
    this.cursorY = 0;
    this.rowHeight = 0;
    this.context?.clearRect(0, 0, this.canvas?.width ?? 0, this.canvas?.height ?? 0);
    this.dirty = true;
    this.resetCount += 1;
  }

  consumeDirty(): boolean {
    const wasDirty = this.dirty;
    this.dirty = false;
    return wasDirty;
  }

  private ensurePlacement(width: number, height: number): void {
    const canvasWidth = this.canvas?.width ?? this.initialSizePx;
    const canvasHeight = this.canvas?.height ?? this.initialSizePx;

    if (this.cursorX + width > canvasWidth) {
      this.cursorX = 0;
      this.cursorY += this.rowHeight;
      this.rowHeight = 0;
    }

    if (this.cursorY + height > canvasHeight) {
      if (this.growCanvas()) {
        return;
      }
      this.reset();
    }
  }

  private ensureContext(): CanvasRenderingContext2D {
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.initialSizePx;
      this.canvas.height = this.initialSizePx;
    }

    if (!this.context) {
      const context = this.canvas.getContext('2d');
      if (!context) {
        throw new Error('2D canvas context unavailable for glyph atlas');
      }
      this.context = context;
      this.context.textBaseline = 'alphabetic';
      this.context.textAlign = 'left';
      this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    return this.context;
  }

  private growCanvas(): boolean {
    if (!this.canvas || !this.context) return false;
    if (this.canvas.width >= this.maxSizePx || this.canvas.height >= this.maxSizePx) {
      return false;
    }

    const nextWidth = Math.min(this.canvas.width * 2, this.maxSizePx);
    const nextHeight = Math.min(this.canvas.height * 2, this.maxSizePx);
    const nextCanvas = document.createElement('canvas');
    nextCanvas.width = nextWidth;
    nextCanvas.height = nextHeight;
    const nextContext = nextCanvas.getContext('2d');
    if (!nextContext) {
      return false;
    }

    nextContext.textBaseline = 'alphabetic';
    nextContext.textAlign = 'left';
    nextContext.drawImage(this.canvas, 0, 0);
    this.canvas = nextCanvas;
    this.context = nextContext;
    this.dirty = true;
    return true;
  }
}

function serializeGlyphRequest(request: GlyphAtlasRequest): string {
  return [
    request.font,
    request.color,
    request.width,
    request.height,
    request.baseline,
    request.chars,
  ].join('|');
}

export type { GlyphAtlasEntry };
