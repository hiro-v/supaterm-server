import type {
  TerminalRendererAdapter,
  TerminalRendererAdapterDescriptor,
  TerminalRendererDiagnostics,
  TerminalVisualProfile,
} from '../contracts';
import { LibghostyCanvasAdapter } from './libghosty-canvas';
import { TerminalFrameRasterizer, type FillRect, type TerminalFrameScene } from './webgpu/buffer-rasterizer';

export type WebGpuPreferredAdapterOptions = {
  profile: TerminalVisualProfile;
};

export class WebGpuPreferredAdapter implements TerminalRendererAdapter {
  private static readonly atlasTextureFormat = 'rgba8unorm';
  readonly descriptor: TerminalRendererAdapterDescriptor;
  private readonly fallback: LibghostyCanvasAdapter;
  private readonly profile: TerminalVisualProfile;
  private readonly rasterizer: TerminalFrameRasterizer;
  private gpu: GpuNavigator['gpu'] | null = null;
  private device: GpuDeviceLike | null = null;
  private host: HTMLDivElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private fallbackHost: HTMLDivElement | null = null;
  private sourceCanvas: HTMLCanvasElement | null = null;
  private scratchCanvas: HTMLCanvasElement | null = null;
  private scratchContext: CanvasRenderingContext2D | null = null;
  private context: GpuCanvasContextLike | null = null;
  private rectPipeline: GpuRenderPipelineLike | null = null;
  private glyphPipeline: GpuRenderPipelineLike | null = null;
  private sampler: GpuSamplerLike | null = null;
  private atlasTexture: GpuTextureLike | null = null;
  private atlasBindGroup: GpuBindGroupLike | null = null;
  private rectInstanceBuffer: GpuBufferLike | null = null;
  private rectInstanceCapacity = 0;
  private rectInstanceScratch: Float32Array | null = null;
  private rectInstanceCache: Uint8Array | null = null;
  private rectInstanceDirtyRange: { offset: number; length: number } | null = null;
  private glyphInstanceBuffer: GpuBufferLike | null = null;
  private glyphInstanceCapacity = 0;
  private glyphInstanceScratch: Float32Array | null = null;
  private glyphInstanceCache: Uint8Array | null = null;
  private glyphInstanceDirtyRange: { offset: number; length: number } | null = null;
  private atlasSize: { width: number; height: number } | null = null;
  private lastGlyphCount = 0;
  private lastRectCount = 0;
  private lastUploadBytes = 0;
  private lastFrameCpuMs = 0;
  private frameCpuTotalMs = 0;
  private frameCpuSamples = 0;
  private frameHandle: number | null = null;
  private mounted = false;
  private directFallback = false;

  constructor(options: WebGpuPreferredAdapterOptions) {
    this.profile = options.profile;
    this.fallback = new LibghostyCanvasAdapter(options);
    this.rasterizer = new TerminalFrameRasterizer({ profile: options.profile });
    this.descriptor = {
      id: 'supaterm.renderer.webgpu-preferred',
      family: this.fallback.descriptor.family,
      transport: options.profile.runtime.webgpuApi ? 'webgpu' : this.fallback.descriptor.transport,
      activeRenderer: options.profile.runtime.webgpuApi ? 'webgpu-buffer-rasterized' : this.fallback.descriptor.activeRenderer,
      requestedRenderer: 'webgpu',
      fallbackReason: options.profile.runtime.webgpuApi
        ? null
        : 'WebGPU API unavailable; using libghosty canvas runtime.',
      visualProfileId: options.profile.id,
      themeId: options.profile.themeId,
    };
    if (!options.profile.runtime.webgpuApi) {
      this.directFallback = true;
    }
  }

  get cols(): number {
    return this.fallback.cols;
  }

  get rows(): number {
    return this.fallback.rows;
  }

  async start(): Promise<void> {
    await this.fallback.start();
    if (this.directFallback) return;

    const navigatorLike = typeof navigator !== 'undefined' ? (navigator as GpuNavigator) : null;
    const gpu = navigatorLike?.gpu;
    if (!gpu) {
      this.activateDirectFallback('WebGPU API unavailable; using libghosty canvas runtime.');
      return;
    }

    try {
      const adapter = await gpu.requestAdapter();
      if (!adapter) {
        this.activateDirectFallback('WebGPU adapter unavailable; using libghosty canvas runtime.');
        return;
      }
      this.device = await adapter.requestDevice();
      this.gpu = gpu;
    } catch {
      this.activateDirectFallback('WebGPU device initialization failed; using libghosty canvas runtime.');
    }
  }

  mount(host: HTMLDivElement): void {
    if (this.mounted) return;
    this.mounted = true;
    this.host = host;

    if (this.directFallback) {
      this.fallback.mount(host);
      return;
    }

    host.classList.add('pane-terminal-webgpu');

    const canvas = document.createElement('canvas');
    canvas.className = 'webgpu-terminal-surface';
    canvas.setAttribute('aria-hidden', 'true');

    const fallbackHost = document.createElement('div');
    fallbackHost.className = 'webgpu-terminal-fallback-host';

    this.canvas = canvas;
    this.fallbackHost = fallbackHost;
    host.append(fallbackHost, canvas);

    this.fallback.mount(fallbackHost);
    this.sourceCanvas = fallbackHost.querySelector('canvas');

    if (!this.initializeScratchSurface() || !this.initializeWebGpuSurface()) {
      this.revealFallbackHost('WebGPU terminal full-frame renderer unavailable; using libghosty canvas runtime.');
      return;
    }

    this.startRenderLoop();
  }

  fit(): void {
    this.fallback.fit();
  }

  focus(): void {
    this.fallback.focus();
  }

  write(data: string): void {
    this.fallback.write(data);
  }

  onData(listener: (data: string) => void): void {
    this.fallback.onData(listener);
  }

  onResize(listener: (size: { cols: number; rows: number }) => void): void {
    this.fallback.onResize(listener);
  }

  getDiagnostics(): TerminalRendererDiagnostics {
    const base = this.fallback.getDiagnostics();
    if (this.directFallback) {
      return base;
    }
    const atlas = this.rasterizer.getGlyphAtlas();
    return {
      ...base,
      rendererMetricsMode: 'gpu-active' as const,
      rendererMetricsNote: null,
      atlasGlyphEntries: atlas.size,
      atlasWidth: atlas.width,
      atlasHeight: atlas.height,
      atlasResetCount: atlas.resets,
      activeGlyphQuads: this.lastGlyphCount,
      activeRects: this.lastRectCount,
      rectBufferCapacityBytes: this.rectInstanceCapacity,
      glyphBufferCapacityBytes: this.glyphInstanceCapacity,
      uploadBytes: this.lastUploadBytes,
      frameCpuMs: roundMetric(this.lastFrameCpuMs),
      frameCpuAvgMs: this.frameCpuSamples > 0
        ? roundMetric(this.frameCpuTotalMs / this.frameCpuSamples)
        : null,
    };
  }

  dispose(): void {
    if (this.frameHandle != null) {
      window.cancelAnimationFrame(this.frameHandle);
      this.frameHandle = null;
    }
    this.atlasTexture?.destroy?.();
    this.rectInstanceBuffer?.destroy?.();
    this.glyphInstanceBuffer?.destroy?.();
    this.atlasTexture = null;
    this.rectInstanceBuffer = null;
    this.rectInstanceScratch = null;
    this.rectInstanceCache = null;
    this.rectInstanceDirtyRange = null;
    this.glyphInstanceBuffer = null;
    this.glyphInstanceScratch = null;
    this.glyphInstanceCache = null;
    this.glyphInstanceDirtyRange = null;
    this.atlasBindGroup = null;
    this.sampler = null;
    this.rectPipeline = null;
    this.glyphPipeline = null;
    this.context = null;
    this.scratchContext = null;
    this.scratchCanvas = null;
    this.canvas?.remove();
    this.fallbackHost?.remove();
    this.canvas = null;
    this.fallbackHost = null;
    this.sourceCanvas = null;
    this.host?.classList.remove('pane-terminal-webgpu');
    this.host = null;
    this.fallback.dispose();
  }

  private activateDirectFallback(reason: string): void {
    this.directFallback = true;
    this.descriptor.transport = 'canvas';
    this.descriptor.activeRenderer = 'libghosty-canvas';
    this.descriptor.fallbackReason = reason;
  }

  private revealFallbackHost(reason: string): void {
    this.activateDirectFallback(reason);
    if (this.fallbackHost) {
      this.fallbackHost.classList.add('is-visible-fallback');
    }
    this.canvas?.remove();
    this.canvas = null;
  }

  private initializeScratchSurface(): boolean {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return false;
    this.scratchCanvas = canvas;
    this.scratchContext = context;
    return true;
  }

  private initializeWebGpuSurface(): boolean {
    if (!this.canvas || !this.device || !this.gpu) {
      return false;
    }

    const context = this.canvas.getContext('webgpu') as GpuCanvasContextLike | null;
    if (!context) return false;

    const format = this.gpu.getPreferredCanvasFormat?.() ?? 'bgra8unorm';
    context.configure({
      device: this.device,
      format,
      alphaMode: 'premultiplied',
    });

    const rectShader = this.device.createShaderModule({
      code: `
struct VertexOutput {
  @builtin(position) position : vec4f,
  @location(0) color : vec4f,
}

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_index : u32,
  @location(0) rect : vec4f,
  @location(1) color : vec4f,
) -> VertexOutput {
  var corners = array<vec2f, 6>(
    vec2f(0.0, 0.0),
    vec2f(1.0, 0.0),
    vec2f(0.0, 1.0),
    vec2f(0.0, 1.0),
    vec2f(1.0, 0.0),
    vec2f(1.0, 1.0),
  );
  let corner = corners[vertex_index];
  var out : VertexOutput;
  out.position = vec4f(
    mix(rect.x, rect.z, corner.x),
    mix(rect.y, rect.w, corner.y),
    0.0,
    1.0,
  );
  out.color = color;
  return out;
}

@fragment
fn fs_main(in : VertexOutput) -> @location(0) vec4f {
  return in.color;
}
      `,
    });

    const glyphShader = this.device.createShaderModule({
      code: `
struct VertexOutput {
  @builtin(position) position : vec4f,
  @location(0) uv : vec2f,
}

@group(0) @binding(0) var glyph_sampler : sampler;
@group(0) @binding(1) var glyph_texture : texture_2d<f32>;

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_index : u32,
  @location(0) rect : vec4f,
  @location(1) uv_rect : vec4f,
) -> VertexOutput {
  var corners = array<vec2f, 6>(
    vec2f(0.0, 0.0),
    vec2f(1.0, 0.0),
    vec2f(0.0, 1.0),
    vec2f(0.0, 1.0),
    vec2f(1.0, 0.0),
    vec2f(1.0, 1.0),
  );
  let corner = corners[vertex_index];
  var out : VertexOutput;
  out.position = vec4f(
    mix(rect.x, rect.z, corner.x),
    mix(rect.y, rect.w, corner.y),
    0.0,
    1.0,
  );
  out.uv = vec2f(
    mix(uv_rect.x, uv_rect.z, corner.x),
    mix(uv_rect.y, uv_rect.w, corner.y),
  );
  return out;
}

@fragment
fn fs_main(in : VertexOutput) -> @location(0) vec4f {
  return textureSample(glyph_texture, glyph_sampler, in.uv);
}
      `,
    });

    const blendedTarget = {
      format,
      blend: {
        color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      },
    } as const;

    this.rectPipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: rectShader,
        entryPoint: 'vs_main',
        buffers: [{
          arrayStride: 32,
          stepMode: 'instance',
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x4' },
            { shaderLocation: 1, offset: 16, format: 'float32x4' },
          ],
        }],
      },
      fragment: {
        module: rectShader,
        entryPoint: 'fs_main',
        targets: [blendedTarget],
      },
      primitive: { topology: 'triangle-list' },
    });

    this.glyphPipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: glyphShader,
        entryPoint: 'vs_main',
        buffers: [{
          arrayStride: 32,
          stepMode: 'instance',
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x4' },
            { shaderLocation: 1, offset: 16, format: 'float32x4' },
          ],
        }],
      },
      fragment: {
        module: glyphShader,
        entryPoint: 'fs_main',
        targets: [blendedTarget],
      },
      primitive: { topology: 'triangle-list' },
    });

    this.sampler = this.device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
    });
    this.context = context;
    return true;
  }

  private startRenderLoop(): void {
    if (this.frameHandle != null) return;
    const tick = () => {
      this.frameHandle = window.requestAnimationFrame(tick);
      this.renderFrame();
    };
    this.frameHandle = window.requestAnimationFrame(tick);
  }

  private renderFrame(): void {
    if (
      !this.canvas ||
      !this.scratchContext ||
      !this.device ||
      !this.context ||
      !this.rectPipeline ||
      !this.glyphPipeline ||
      !this.sampler
    ) {
      return;
    }

    const snapshot = this.fallback.captureFrameSnapshot();
    if (!snapshot) return;
    const frameStartedAt = performance.now();

    const size = this.resolveFrameSize(snapshot);
    if (size.width <= 0 || size.height <= 0) return;

    if (this.canvas.width !== size.width) this.canvas.width = size.width;
    if (this.canvas.height !== size.height) this.canvas.height = size.height;
    this.canvas.style.width = this.sourceCanvas?.style.width || '100%';
    this.canvas.style.height = this.sourceCanvas?.style.height || '100%';

    const scene = this.rasterizer.buildScene(snapshot, this.scratchContext, size.width, size.height);
    const atlasUploadBytes = this.prepareAtlasTexture();

    const rectUpload = this.prepareRectInstances(scene);
    const glyphUpload = this.prepareGlyphInstances(scene);
    const clearValue = toGpuColor(scene.backgroundColor);

    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this.context.getCurrentTexture().createView(),
        clearValue,
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });

    if (rectUpload.count > 0 && this.rectInstanceBuffer) {
      pass.setPipeline(this.rectPipeline);
      pass.setVertexBuffer(0, this.rectInstanceBuffer);
      pass.draw(6, rectUpload.count);
    }

    if (glyphUpload.count > 0 && this.glyphInstanceBuffer && this.atlasBindGroup) {
      pass.setPipeline(this.glyphPipeline);
      pass.setBindGroup(0, this.atlasBindGroup);
      pass.setVertexBuffer(0, this.glyphInstanceBuffer);
      pass.draw(6, glyphUpload.count);
    }

    pass.end();
    this.device.queue.submit([encoder.finish()]);
    this.lastGlyphCount = glyphUpload.count;
    this.lastRectCount = rectUpload.count;
    this.lastUploadBytes = atlasUploadBytes + rectUpload.uploadBytes + glyphUpload.uploadBytes;
    this.lastFrameCpuMs = performance.now() - frameStartedAt;
    this.frameCpuTotalMs += this.lastFrameCpuMs;
    this.frameCpuSamples += 1;
  }

  private prepareAtlasTexture(): number {
    if (!this.device || !this.glyphPipeline || !this.sampler) return 0;

    const atlas = this.rasterizer.getGlyphAtlas();
    const atlasCanvas = atlas.getCanvas();
    const atlasWidth = atlas.width;
    const atlasHeight = atlas.height;

    if (!this.atlasTexture || this.atlasSize?.width !== atlasWidth || this.atlasSize?.height !== atlasHeight) {
      this.atlasTexture?.destroy?.();
      this.atlasTexture = this.device.createTexture({
        size: { width: atlasWidth, height: atlasHeight, depthOrArrayLayers: 1 },
        format: WebGpuPreferredAdapter.atlasTextureFormat,
        usage: getGpuTextureUsage().COPY_DST | getGpuTextureUsage().TEXTURE_BINDING,
      });
      this.atlasBindGroup = this.device.createBindGroup({
        layout: this.glyphPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: this.sampler },
          { binding: 1, resource: this.atlasTexture.createView() },
        ],
      });
      this.atlasSize = { width: atlasWidth, height: atlasHeight };
      atlas.consumeDirty();
      this.device.queue.copyExternalImageToTexture(
        { source: atlasCanvas },
        { texture: this.atlasTexture },
        { width: atlasWidth, height: atlasHeight, depthOrArrayLayers: 1 },
      );
      return atlasWidth * atlasHeight * 4;
    }

    if (atlas.consumeDirty() && this.atlasTexture) {
      this.device.queue.copyExternalImageToTexture(
        { source: atlasCanvas },
        { texture: this.atlasTexture },
        { width: atlasWidth, height: atlasHeight, depthOrArrayLayers: 1 },
      );
      return atlasWidth * atlasHeight * 4;
    }
    return 0;
  }

  private prepareRectInstances(scene: TerminalFrameScene): { count: number; uploadBytes: number } {
    if (!this.device) return { count: 0, uploadBytes: 0 };
    const rects = scene.backgroundRects.concat(scene.overlayRects);
    if (rects.length === 0) return { count: 0, uploadBytes: 0 };

    const data = ensureFloatScratch(this.rectInstanceScratch, rects.length * 8);
    this.rectInstanceScratch = data;
    const usedFloats = fillRectInstanceData(data, scene, rects);
    const requiredBytes = usedFloats * 4;
    if (!this.rectInstanceBuffer || this.rectInstanceCapacity < requiredBytes) {
      this.rectInstanceBuffer?.destroy?.();
      this.rectInstanceCapacity = Math.max(4096, nextPowerOfTwo(requiredBytes));
      this.rectInstanceBuffer = this.device.createBuffer({
        size: this.rectInstanceCapacity,
        usage: getGpuBufferUsage().VERTEX | getGpuBufferUsage().COPY_DST,
      });
      this.rectInstanceCache = null;
      this.rectInstanceDirtyRange = null;
    }

    const bytes = new Uint8Array(data.buffer as ArrayBuffer, data.byteOffset, requiredBytes);
    const dirtyRange = findChangedRange(this.rectInstanceCache, bytes);
    if (dirtyRange) {
      const uploadRange = alignWriteBufferRange(dirtyRange, bytes.length);
      this.device.queue.writeBuffer(
        this.rectInstanceBuffer,
        uploadRange.offset,
        bytes.subarray(uploadRange.offset, uploadRange.offset + uploadRange.length),
      );
      this.rectInstanceCache = cloneBytes(bytes);
      this.rectInstanceDirtyRange = uploadRange;
      return { count: rects.length, uploadBytes: uploadRange.length };
    }
    this.rectInstanceDirtyRange = null;
    return { count: rects.length, uploadBytes: 0 };
  }

  private prepareGlyphInstances(scene: TerminalFrameScene): { count: number; uploadBytes: number } {
    if (!this.device) return { count: 0, uploadBytes: 0 };
    const glyphCount = scene.glyphs.length;
    if (glyphCount === 0) return { count: 0, uploadBytes: 0 };

    const data = ensureFloatScratch(this.glyphInstanceScratch, glyphCount * 8);
    this.glyphInstanceScratch = data;
    const usedFloats = fillGlyphInstanceData(
      data,
      scene,
      this.rasterizer.getGlyphAtlas().width,
      this.rasterizer.getGlyphAtlas().height,
    );
    const requiredBytes = usedFloats * 4;
    if (!this.glyphInstanceBuffer || this.glyphInstanceCapacity < requiredBytes) {
      this.glyphInstanceBuffer?.destroy?.();
      this.glyphInstanceCapacity = Math.max(4096, nextPowerOfTwo(requiredBytes));
      this.glyphInstanceBuffer = this.device.createBuffer({
        size: this.glyphInstanceCapacity,
        usage: getGpuBufferUsage().VERTEX | getGpuBufferUsage().COPY_DST,
      });
      this.glyphInstanceCache = null;
      this.glyphInstanceDirtyRange = null;
    }

    const bytes = new Uint8Array(data.buffer as ArrayBuffer, data.byteOffset, requiredBytes);
    const dirtyRange = findChangedRange(this.glyphInstanceCache, bytes);
    if (dirtyRange) {
      const uploadRange = alignWriteBufferRange(dirtyRange, bytes.length);
      this.device.queue.writeBuffer(
        this.glyphInstanceBuffer,
        uploadRange.offset,
        bytes.subarray(uploadRange.offset, uploadRange.offset + uploadRange.length),
      );
      this.glyphInstanceCache = cloneBytes(bytes);
      this.glyphInstanceDirtyRange = uploadRange;
      return { count: glyphCount, uploadBytes: uploadRange.length };
    }
    this.glyphInstanceDirtyRange = null;
    return { count: glyphCount, uploadBytes: 0 };
  }

  private resolveFrameSize(snapshot: { cols: number; rows: number }): { width: number; height: number } {
    const width = this.sourceCanvas?.width ?? this.host?.clientWidth ?? snapshot.cols * this.profile.fontSize;
    const height = this.sourceCanvas?.height ?? this.host?.clientHeight ?? snapshot.rows * Math.ceil(this.profile.fontSize * 1.4);
    return {
      width: Math.max(1, Math.floor(width)),
      height: Math.max(1, Math.floor(height)),
    };
  }
}

function fillRectInstanceData(target: Float32Array, scene: TerminalFrameScene, rects: FillRect[]): number {
  for (let index = 0; index < rects.length; index += 1) {
    const rect = rects[index];
    const offset = index * 8;
    const bounds = toGpuRect(rect.x, rect.y, rect.width, rect.height, scene.width, scene.height);
    const color = toGpuColor(rect.color);

    target[offset + 0] = bounds[0];
    target[offset + 1] = bounds[1];
    target[offset + 2] = bounds[2];
    target[offset + 3] = bounds[3];
    target[offset + 4] = color.r;
    target[offset + 5] = color.g;
    target[offset + 6] = color.b;
    target[offset + 7] = color.a;
  }
  return rects.length * 8;
}

function fillGlyphInstanceData(target: Float32Array, scene: TerminalFrameScene, atlasWidth: number, atlasHeight: number): number {
  for (let index = 0; index < scene.glyphs.length; index += 1) {
    const glyph = scene.glyphs[index];
    const offset = index * 8;
    const bounds = toGpuRect(glyph.x, glyph.y, glyph.width, glyph.height, scene.width, scene.height);

    target[offset + 0] = bounds[0];
    target[offset + 1] = bounds[1];
    target[offset + 2] = bounds[2];
    target[offset + 3] = bounds[3];
    target[offset + 4] = glyph.atlas.sourceX / atlasWidth;
    target[offset + 5] = glyph.atlas.sourceY / atlasHeight;
    target[offset + 6] = (glyph.atlas.sourceX + glyph.atlas.sourceWidth) / atlasWidth;
    target[offset + 7] = (glyph.atlas.sourceY + glyph.atlas.sourceHeight) / atlasHeight;
  }
  return scene.glyphs.length * 8;
}

function ensureFloatScratch(buffer: Float32Array | null, minLength: number): Float32Array {
  if (!buffer || buffer.length < minLength) {
    return new Float32Array(nextPowerOfTwo(minLength));
  }
  return buffer;
}

function nextPowerOfTwo(value: number): number {
  let result = 1;
  while (result < value) result <<= 1;
  return result;
}

function cloneBytes(source: Uint8Array): Uint8Array {
  const copy = new Uint8Array(source.length);
  copy.set(source);
  return copy;
}

function findChangedRange(
  previous: Uint8Array | null,
  current: Uint8Array,
): { offset: number; length: number } | null {
  if (!previous || previous.length !== current.length) {
    return { offset: 0, length: current.length };
  }

  let start = -1;
  let end = -1;
  for (let index = 0; index < current.length; index += 1) {
    if (previous[index] === current[index]) continue;
    if (start === -1) start = index;
    end = index;
  }

  if (start === -1 || end === -1) {
    return null;
  }

  return {
    offset: start,
    length: (end - start) + 1,
  };
}

function alignWriteBufferRange(
  range: { offset: number; length: number },
  totalLength: number,
): { offset: number; length: number } {
  const alignedOffset = range.offset & ~0b11;
  const alignedEnd = Math.min(totalLength, (range.offset + range.length + 3) & ~0b11);
  return {
    offset: alignedOffset,
    length: Math.max(0, alignedEnd - alignedOffset),
  };
}

export const __testing__ = {
  findChangedRange,
  alignWriteBufferRange,
};

function toGpuRect(x: number, y: number, width: number, height: number, surfaceWidth: number, surfaceHeight: number): [number, number, number, number] {
  const left = x / surfaceWidth * 2 - 1;
  const right = (x + width) / surfaceWidth * 2 - 1;
  const top = 1 - y / surfaceHeight * 2;
  const bottom = 1 - (y + height) / surfaceHeight * 2;
  return [left, top, right, bottom];
}

function toGpuColor(color: string): { r: number; g: number; b: number; a: number } {
  const trimmed = color.trim();
  if (trimmed.startsWith('#')) {
    const normalized = trimmed.slice(1);
    if (normalized.length === 6) {
      return {
        r: Number.parseInt(normalized.slice(0, 2), 16) / 255,
        g: Number.parseInt(normalized.slice(2, 4), 16) / 255,
        b: Number.parseInt(normalized.slice(4, 6), 16) / 255,
        a: 1,
      };
    }
  }

  const rgbaMatch = trimmed.match(/^rgba\(([^,]+),([^,]+),([^,]+),([^)]+)\)$/);
  if (rgbaMatch) {
    return {
      r: Number(rgbaMatch[1].trim()) / 255,
      g: Number(rgbaMatch[2].trim()) / 255,
      b: Number(rgbaMatch[3].trim()) / 255,
      a: Number(rgbaMatch[4].trim()),
    };
  }

  return { r: 0, g: 0, b: 0, a: 1 };
}

type GpuNavigator = Navigator & {
  gpu?: {
    requestAdapter: () => Promise<GpuAdapterLike | null>;
    getPreferredCanvasFormat?: () => string;
  };
};

type GpuAdapterLike = {
  requestDevice: () => Promise<GpuDeviceLike>;
};

type GpuCanvasContextLike = {
  configure(options: {
    device: GpuDeviceLike;
    format: string;
    alphaMode: 'premultiplied';
  }): void;
  getCurrentTexture(): { createView(): unknown };
};

type GpuSamplerLike = unknown;
type GpuBindGroupLike = unknown;
type GpuBufferLike = { destroy?(): void };
type GpuTextureLike = { createView(): unknown; destroy?(): void };
type GpuRenderPipelineLike = { getBindGroupLayout(index: number): unknown };

type GpuDeviceLike = {
  queue: {
    copyExternalImageToTexture(
      source: { source: HTMLCanvasElement },
      destination: { texture: GpuTextureLike },
      size: { width: number; height: number; depthOrArrayLayers: number },
    ): void;
    writeBuffer(buffer: GpuBufferLike, offset: number, data: BufferSource): void;
    submit(commands: unknown[]): void;
  };
  createShaderModule(options: { code: string }): unknown;
  createRenderPipeline(options: {
    layout: 'auto';
    vertex: {
      module: unknown;
      entryPoint: string;
      buffers: Array<{
        arrayStride: number;
        stepMode: 'instance';
        attributes: Array<{ shaderLocation: number; offset: number; format: 'float32x4' }>;
      }>;
    };
    fragment: {
      module: unknown;
      entryPoint: string;
      targets: Array<{
        format: string;
        blend: {
          color: { srcFactor: string; dstFactor: string; operation: string };
          alpha: { srcFactor: string; dstFactor: string; operation: string };
        };
      }>;
    };
    primitive: { topology: 'triangle-list' };
  }): GpuRenderPipelineLike;
  createSampler(options: { magFilter: 'linear'; minFilter: 'linear' }): GpuSamplerLike;
  createTexture(options: {
    size: { width: number; height: number; depthOrArrayLayers: number };
    format: string;
    usage: number;
  }): GpuTextureLike;
  createBuffer(options: { size: number; usage: number }): GpuBufferLike;
  createBindGroup(options: {
    layout: unknown;
    entries: Array<{ binding: number; resource: unknown }>;
  }): GpuBindGroupLike;
  createCommandEncoder(): {
    beginRenderPass(options: {
      colorAttachments: Array<{
        view: unknown;
        clearValue: { r: number; g: number; b: number; a: number };
        loadOp: 'clear';
        storeOp: 'store';
      }>;
    }): {
      setPipeline(pipeline: GpuRenderPipelineLike): void;
      setBindGroup(index: number, bindGroup: GpuBindGroupLike): void;
      setVertexBuffer(slot: number, buffer: GpuBufferLike): void;
      draw(count: number, instances?: number): void;
      end(): void;
    };
    finish(): unknown;
  };
};

function getGpuTextureUsage(): { COPY_DST: number; TEXTURE_BINDING: number } {
  return (
    (globalThis as typeof globalThis & {
      GPUTextureUsage?: { COPY_DST: number; TEXTURE_BINDING: number };
    }).GPUTextureUsage ??
    { COPY_DST: 0x08, TEXTURE_BINDING: 0x04 }
  );
}

function getGpuBufferUsage(): { VERTEX: number; COPY_DST: number } {
  return (
    (globalThis as typeof globalThis & {
      GPUBufferUsage?: { VERTEX: number; COPY_DST: number };
    }).GPUBufferUsage ??
    { VERTEX: 0x20, COPY_DST: 0x08 }
  );
}

function roundMetric(value: number): number {
  return Math.round(value * 100) / 100;
}
