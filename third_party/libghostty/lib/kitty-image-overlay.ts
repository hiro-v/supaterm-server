import type { GhosttyTerminal } from './ghostty';
import {
  GhosttyKittyImageFormat,
  GhosttyKittyImagePlacementKind,
  type GhosttyKittyImageMetadata,
  type GhosttyKittyImagePlacement,
} from './types';
import type { FontMetrics } from './renderer';

type CachedKittyImage = {
  metadata: GhosttyKittyImageMetadata;
  surface: HTMLCanvasElement;
};

export class KittyImageOverlay {
  private host: HTMLElement | null = null;
  private backgroundCanvas: HTMLCanvasElement | null = null;
  private foregroundCanvas: HTMLCanvasElement | null = null;
  private backgroundContext: CanvasRenderingContext2D | null = null;
  private foregroundContext: CanvasRenderingContext2D | null = null;
  private readonly cache = new Map<number, CachedKittyImage>();
  private readonly pendingDecodes = new Set<number>();
  private cssWidth = 0;
  private cssHeight = 0;
  private readonly devicePixelRatio = window.devicePixelRatio ?? 1;
  private lastTerm: GhosttyTerminal | null = null;
  private lastMetrics: FontMetrics | null = null;
  private lastCols = 0;
  private lastRows = 0;
  private forceRender = false;

  mount(host: HTMLElement, referenceCanvas: HTMLCanvasElement): void {
    if (this.host === host) return;
    this.dispose();

    this.host = host;
    if (window.getComputedStyle(host).position === 'static') {
      host.style.position = 'relative';
    }

    referenceCanvas.style.position = 'relative';
    referenceCanvas.style.zIndex = '1';

    this.backgroundCanvas = document.createElement('canvas');
    this.foregroundCanvas = document.createElement('canvas');
    this.backgroundCanvas.dataset.supatermLayer = 'kitty-images-background';
    this.foregroundCanvas.dataset.supatermLayer = 'kitty-images-foreground';

    for (const canvas of [this.backgroundCanvas, this.foregroundCanvas]) {
      canvas.style.position = 'absolute';
      canvas.style.inset = '0';
      canvas.style.pointerEvents = 'none';
      canvas.style.display = 'none';
      canvas.style.width = '0';
      canvas.style.height = '0';
    }

    this.backgroundCanvas.style.zIndex = '0';
    this.foregroundCanvas.style.zIndex = '2';

    host.insertBefore(this.backgroundCanvas, referenceCanvas);
    host.appendChild(this.foregroundCanvas);

    this.backgroundContext = this.backgroundCanvas.getContext('2d');
    this.foregroundContext = this.foregroundCanvas.getContext('2d');
  }

  clear(): void {
    this.clearCanvas(this.backgroundCanvas, this.backgroundContext);
    this.clearCanvas(this.foregroundCanvas, this.foregroundContext);
    this.hideCanvas(this.backgroundCanvas);
    this.hideCanvas(this.foregroundCanvas);
  }

  render(term: GhosttyTerminal, metrics: FontMetrics, cols: number, rows: number): void {
    if (!this.host || !this.backgroundCanvas || !this.foregroundCanvas) return;
    this.lastTerm = term;
    this.lastMetrics = metrics;
    this.lastCols = cols;
    this.lastRows = rows;

    const cssWidth = metrics.width * cols;
    const cssHeight = metrics.height * rows;
    const sizeChanged = cssWidth !== this.cssWidth || cssHeight !== this.cssHeight;
    if (sizeChanged) {
      this.resize(cssWidth, cssHeight);
    }

    if (!term.hasKittyGraphics()) {
      this.cache.clear();
      this.pendingDecodes.clear();
      this.clear();
      return;
    }

    const dirty = this.forceRender || term.isKittyGraphicsDirty() || sizeChanged;
    this.forceRender = false;
    if (!dirty) return;

    const placements = this.selectPlacements(term.getKittyImagePlacements()).sort(
      (left, right) =>
        left.z - right.z ||
        left.imageId - right.imageId ||
        left.y - right.y ||
        left.x - right.x,
    );

    if (placements.length === 0) {
      this.cache.clear();
      this.clear();
      term.markKittyGraphicsClean();
      return;
    }

    const activeImageIds = new Set(placements.map((placement) => placement.imageId));
    for (const imageId of this.cache.keys()) {
      if (!activeImageIds.has(imageId)) {
        this.cache.delete(imageId);
      }
    }

    const backgroundContext = this.backgroundContext;
    const foregroundContext = this.foregroundContext;
    if (!backgroundContext || !foregroundContext) return;

    this.clearCanvas(this.backgroundCanvas, backgroundContext);
    this.clearCanvas(this.foregroundCanvas, foregroundContext);

    let hasBackground = false;
    let hasForeground = false;

    for (const placement of placements) {
      const image = this.resolveImage(term, placement.imageId);
      if (!image) continue;

      const destinationX = placement.x * metrics.width + placement.cellOffsetX;
      const destinationY = placement.y * metrics.height + placement.cellOffsetY;
      // The current text canvas paints an opaque terminal background, so true
      // background Kitty placements would be hidden underneath it. Promote all
      // Kitty images to the foreground overlay in the browser path so preview
      // TUIs such as yazi remain visible.
      const targetContext = foregroundContext;
      targetContext.drawImage(
        image.surface,
        placement.sourceX,
        placement.sourceY,
        placement.sourceWidth,
        placement.sourceHeight,
        destinationX,
        destinationY,
        placement.width,
        placement.height,
      );

      hasForeground = true;
    }

    this.toggleCanvas(this.backgroundCanvas, hasBackground);
    this.toggleCanvas(this.foregroundCanvas, hasForeground);
    term.markKittyGraphicsClean();
  }

  dispose(): void {
    this.cache.clear();
    this.pendingDecodes.clear();
    this.backgroundCanvas?.remove();
    this.foregroundCanvas?.remove();
    this.backgroundCanvas = null;
    this.foregroundCanvas = null;
    this.backgroundContext = null;
    this.foregroundContext = null;
    this.host = null;
    this.cssWidth = 0;
    this.cssHeight = 0;
  }

  private resize(cssWidth: number, cssHeight: number): void {
    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;

    for (const canvas of [this.backgroundCanvas, this.foregroundCanvas]) {
      if (!canvas) continue;
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      canvas.width = cssWidth * this.devicePixelRatio;
      canvas.height = cssHeight * this.devicePixelRatio;

      const context = canvas.getContext('2d');
      if (!context) continue;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.scale(this.devicePixelRatio, this.devicePixelRatio);
      // Kitty image placements are often composed from many small tiles.
      // Bilinear filtering introduces visible seams and repeated edge pixels
      // between those tiles, so keep smoothing disabled for this overlay.
      context.imageSmoothingEnabled = false;
    }
  }

  private resolveImage(term: GhosttyTerminal, imageId: number): CachedKittyImage | null {
    const metadata = term.getKittyImageMetadata(imageId);
    if (!metadata) return null;

    const cached = this.cache.get(imageId);
    if (cached && this.isMatchingMetadata(cached.metadata, metadata)) {
      return cached;
    }

    const raw = term.getKittyImageData(imageId, metadata.byteLength);
    if (!raw) return null;

    if (metadata.format === GhosttyKittyImageFormat.PNG) {
      if (this.pendingDecodes.has(imageId)) return null;
      this.pendingDecodes.add(imageId);
      void this.decodePngSurface(raw, metadata)
        .then((surface) => {
          if (!surface) return;
          this.cache.set(imageId, { metadata, surface });
          this.forceRender = true;
          this.rerender();
        })
        .finally(() => {
          this.pendingDecodes.delete(imageId);
        });
      return null;
    }

    const rgba = decodeKittyImage(raw, metadata);
    if (!rgba) return null;

    const surface = document.createElement('canvas');
    surface.width = metadata.width;
    surface.height = metadata.height;
    const context = surface.getContext('2d');
    if (!context) return null;

    const imageData = new ImageData(
      Uint8ClampedArray.from(rgba),
      metadata.width,
      metadata.height,
    );
    context.putImageData(imageData, 0, 0);

    const next: CachedKittyImage = { metadata, surface };
    this.cache.set(imageId, next);
    return next;
  }

  private selectPlacements(
    placements: GhosttyKittyImagePlacement[],
  ): GhosttyKittyImagePlacement[] {
    if (placements.length <= 1) return placements;

    const byImageId = new Map<number, GhosttyKittyImagePlacement[]>();
    for (const placement of placements) {
      const group = byImageId.get(placement.imageId);
      if (group) {
        group.push(placement);
        continue;
      }
      byImageId.set(placement.imageId, [placement]);
    }

    const selected: GhosttyKittyImagePlacement[] = [];
    for (const group of byImageId.values()) {
      const hasVirtualPlacement = group.some(
        (placement) => placement.kind === GhosttyKittyImagePlacementKind.VIRTUAL,
      );
      if (hasVirtualPlacement) {
        selected.push(
          ...group.filter((placement) => placement.kind === GhosttyKittyImagePlacementKind.VIRTUAL),
        );
        continue;
      }
      selected.push(...group);
    }

    return selected;
  }

  private rerender(): void {
    if (!this.lastTerm || !this.lastMetrics || !this.host) return;
    this.render(this.lastTerm, this.lastMetrics, this.lastCols, this.lastRows);
  }

  private isMatchingMetadata(
    left: GhosttyKittyImageMetadata,
    right: GhosttyKittyImageMetadata,
  ): boolean {
    return (
      left.width === right.width &&
      left.height === right.height &&
      left.byteLength === right.byteLength &&
      left.format === right.format
    );
  }

  private clearCanvas(
    canvas: HTMLCanvasElement | null,
    context: CanvasRenderingContext2D | null,
  ): void {
    if (!canvas || !context) return;
    context.clearRect(0, 0, this.cssWidth, this.cssHeight);
  }

  private hideCanvas(canvas: HTMLCanvasElement | null): void {
    if (!canvas) return;
    canvas.style.display = 'none';
  }

  private toggleCanvas(canvas: HTMLCanvasElement | null, visible: boolean): void {
    if (!canvas) return;
    canvas.style.display = visible ? 'block' : 'none';
  }

  private async decodePngSurface(
    raw: Uint8Array,
    metadata: GhosttyKittyImageMetadata,
  ): Promise<HTMLCanvasElement | null> {
    const blob = new Blob([Uint8Array.from(raw)], { type: 'image/png' });
    const canvas = document.createElement('canvas');
    canvas.width = metadata.width;
    canvas.height = metadata.height;
    const context = canvas.getContext('2d');
    if (!context) return null;

    if ('createImageBitmap' in window) {
      try {
        const bitmap = await createImageBitmap(blob);
        context.drawImage(bitmap, 0, 0);
        bitmap.close();
        return canvas;
      } catch {
        // Fall through to the data URL path below.
      }
    }

    const image = await loadImage(`data:image/png;base64,${encodeBase64(raw)}`);
    context.drawImage(image, 0, 0);
    return canvas;
  }
}

function decodeKittyImage(
  raw: Uint8Array,
  metadata: GhosttyKittyImageMetadata,
): Uint8Array | null {
  switch (metadata.format) {
    case GhosttyKittyImageFormat.RGBA:
      return raw;
    case GhosttyKittyImageFormat.RGB:
      return rgbToRgba(raw);
    case GhosttyKittyImageFormat.GRAY_ALPHA:
      return grayAlphaToRgba(raw);
    case GhosttyKittyImageFormat.GRAY:
      return grayToRgba(raw);
    default:
      return null;
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`failed to load image: ${url}`));
    image.src = url;
  });
}

function encodeBase64(raw: Uint8Array): string {
  let binary = '';
  for (const value of raw) {
    binary += String.fromCharCode(value);
  }
  return btoa(binary);
}

function rgbToRgba(raw: Uint8Array): Uint8Array {
  const result = new Uint8Array((raw.length / 3) * 4);
  for (let source = 0, target = 0; source < raw.length; source += 3, target += 4) {
    result[target] = raw[source];
    result[target + 1] = raw[source + 1];
    result[target + 2] = raw[source + 2];
    result[target + 3] = 255;
  }
  return result;
}

function grayAlphaToRgba(raw: Uint8Array): Uint8Array {
  const result = new Uint8Array((raw.length / 2) * 4);
  for (let source = 0, target = 0; source < raw.length; source += 2, target += 4) {
    const gray = raw[source];
    result[target] = gray;
    result[target + 1] = gray;
    result[target + 2] = gray;
    result[target + 3] = raw[source + 1];
  }
  return result;
}

function grayToRgba(raw: Uint8Array): Uint8Array {
  const result = new Uint8Array(raw.length * 4);
  for (let source = 0, target = 0; source < raw.length; source += 1, target += 4) {
    const gray = raw[source];
    result[target] = gray;
    result[target + 1] = gray;
    result[target + 2] = gray;
    result[target + 3] = 255;
  }
  return result;
}
