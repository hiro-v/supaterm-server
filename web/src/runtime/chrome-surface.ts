import type {
  TerminalVisualProfile,
  WorkbenchChromeSurface,
  WorkbenchChromeSurfaceDescriptor,
} from './contracts';

type GpuNavigator = Navigator & {
  gpu?: {
    requestAdapter: () => Promise<{
      requestDevice: () => Promise<GpuDeviceLike>;
    } | null>;
    getPreferredCanvasFormat?: () => GpuCanvasFormat;
  };
};

type GpuCanvasFormat = string;

type GpuBufferUsageLike = {
  UNIFORM: number;
  COPY_DST: number;
};

type GpuContextLike = {
  configure(options: {
    device: GpuDeviceLike;
    format: GpuCanvasFormat;
    alphaMode: 'premultiplied';
  }): void;
  getCurrentTexture(): {
    createView(): unknown;
  };
};

type GpuDeviceLike = {
  queue: {
    writeBuffer(buffer: unknown, offset: number, data: ArrayBufferLike): void;
    submit(commands: unknown[]): void;
  };
  createBuffer(options: { size: number; usage: number }): unknown;
  createShaderModule(options: { code: string }): unknown;
  createRenderPipeline(options: {
    layout: 'auto';
    vertex: { module: unknown; entryPoint: string };
    fragment: { module: unknown; entryPoint: string; targets: Array<{ format: GpuCanvasFormat }> };
    primitive: { topology: 'triangle-list' };
  }): {
    getBindGroupLayout(index: number): unknown;
  };
  createBindGroup(options: {
    layout: unknown;
    entries: Array<{ binding: number; resource: { buffer: unknown } }>;
  }): unknown;
  createCommandEncoder(): {
    beginRenderPass(options: {
      colorAttachments: Array<{
        view: unknown;
        clearValue: { r: number; g: number; b: number; a: number };
        loadOp: 'clear';
        storeOp: 'store';
      }>;
    }): {
      setPipeline(pipeline: unknown): void;
      setBindGroup(index: number, bindGroup: unknown): void;
      draw(count: number): void;
      end(): void;
    };
    finish(): unknown;
  };
};

export type ChromeSurfaceFactory = (
  profile: TerminalVisualProfile,
  navigatorLike?: Navigator,
) => WorkbenchChromeSurface;

export function createWorkbenchChromeSurface(
  profile: TerminalVisualProfile,
  navigatorLike: Navigator = navigator,
): WorkbenchChromeSurface {
  const gpu = (navigatorLike as GpuNavigator).gpu;
  if (!gpu || profile.runtime.preferredRenderer !== 'webgpu') {
    return new NoopWorkbenchChromeSurface(profile, 'WebGPU API unavailable; using CSS-only shell chrome.');
  }
  return new WebGpuGradientSurface(profile, gpu);
}

class NoopWorkbenchChromeSurface implements WorkbenchChromeSurface {
  readonly descriptor: WorkbenchChromeSurfaceDescriptor;

  constructor(profile: TerminalVisualProfile, fallbackReason: string) {
    this.descriptor = {
      id: 'supaterm.chrome.none',
      activeSurface: 'none',
      requestedSurface: 'webgpu-gradient',
      fallbackReason,
      visualProfileId: profile.id,
    };
  }

  mount(_host: HTMLDivElement): void {}
  resize(): void {}
  dispose(): void {}
}

class WebGpuGradientSurface implements WorkbenchChromeSurface {
  readonly descriptor: WorkbenchChromeSurfaceDescriptor;
  private readonly profile: TerminalVisualProfile;
  private readonly gpu: NonNullable<GpuNavigator['gpu']>;
  private host: HTMLDivElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private device: GpuDeviceLike | null = null;
  private context: GpuContextLike | null = null;
  private pipeline: ReturnType<GpuDeviceLike['createRenderPipeline']> | null = null;
  private bindGroup: ReturnType<GpuDeviceLike['createBindGroup']> | null = null;
  private uniformBuffer: ReturnType<GpuDeviceLike['createBuffer']> | null = null;
  private ready = false;
  private disposed = false;

  constructor(profile: TerminalVisualProfile, gpu: NonNullable<GpuNavigator['gpu']>) {
    this.profile = profile;
    this.gpu = gpu;
    this.descriptor = {
      id: 'supaterm.chrome.webgpu-gradient',
      activeSurface: 'webgpu-gradient',
      requestedSurface: 'webgpu-gradient',
      fallbackReason: null,
      visualProfileId: profile.id,
    };
  }

  mount(host: HTMLDivElement): void {
    if (this.canvas) return;
    this.host = host;
    const canvas = document.createElement('canvas');
    canvas.className = 'workbench-chrome-surface';
    canvas.setAttribute('aria-hidden', 'true');
    host.prepend(canvas);
    this.canvas = canvas;
    void this.initialize();
  }

  resize(): void {
    if (!this.ready) return;
    this.render();
  }

  dispose(): void {
    this.disposed = true;
    this.canvas?.remove();
    this.canvas = null;
    this.host = null;
    this.device = null;
    this.context = null;
    this.pipeline = null;
    this.bindGroup = null;
    this.uniformBuffer = null;
    this.ready = false;
  }

  private async initialize(): Promise<void> {
    if (!this.canvas || this.disposed) return;
    const adapter = await this.gpu.requestAdapter();
    if (!adapter || this.disposed || !this.canvas) {
      this.dispose();
      return;
    }

    const device = await adapter.requestDevice();
    if (this.disposed || !this.canvas) return;

    const context = this.canvas.getContext('webgpu') as GpuContextLike | null;
    if (!context) {
      this.dispose();
      return;
    }

    const format = this.gpu.getPreferredCanvasFormat?.() ?? 'bgra8unorm';
    context.configure({
      device,
      format,
      alphaMode: 'premultiplied',
    });

    const uniformBuffer = device.createBuffer({
      size: 8 * Float32Array.BYTES_PER_ELEMENT,
      usage: getGpuBufferUsage().UNIFORM | getGpuBufferUsage().COPY_DST,
    });
    const shaderModule = device.createShaderModule({
      code: `
struct Uniforms {
  resolution : vec2f,
  shell_color : vec3f,
  accent_color : vec3f,
}

@group(0) @binding(0) var<uniform> uniforms : Uniforms;

@vertex
fn vs_main(@builtin(vertex_index) vertex_index : u32) -> @builtin(position) vec4f {
  var pos = array<vec2f, 3>(
    vec2f(-1.0, -3.0),
    vec2f(-1.0, 1.0),
    vec2f(3.0, 1.0),
  );
  return vec4f(pos[vertex_index], 0.0, 1.0);
}

@fragment
fn fs_main(@builtin(position) position : vec4f) -> @location(0) vec4f {
  let uv = position.xy / uniforms.resolution;
  let center = vec2f(0.22, 0.08);
  let dist = distance(uv, center);
  let glow = smoothstep(0.42, 0.0, dist) * 0.16;
  let grid_x = smoothstep(0.99, 1.0, abs(fract(uv.x * 18.0) - 0.5) * 2.0) * 0.015;
  let grid_y = smoothstep(0.99, 1.0, abs(fract(uv.y * 12.0) - 0.5) * 2.0) * 0.012;
  let base = uniforms.shell_color + uniforms.accent_color * glow;
  let tint = grid_x + grid_y;
  return vec4f(base + vec3f(tint), 0.42);
}
      `,
    });
    const pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: [{ format }],
      },
      primitive: {
        topology: 'triangle-list',
      },
    });
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{
        binding: 0,
        resource: { buffer: uniformBuffer },
      }],
    });

    this.device = device;
    this.context = context;
    this.pipeline = pipeline;
    this.bindGroup = bindGroup;
    this.uniformBuffer = uniformBuffer;
    this.ready = true;
    this.render();
  }

  private render(): void {
    if (!this.ready || !this.host || !this.canvas || !this.device || !this.context || !this.pipeline || !this.bindGroup || !this.uniformBuffer) {
      return;
    }

    const width = Math.max(1, Math.round(this.host.clientWidth * window.devicePixelRatio));
    const height = Math.max(1, Math.round(this.host.clientHeight * window.devicePixelRatio));
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;

    const shellColor = hexToRgb(this.profile.chromePalette.shellBackground);
    const accentColor = hexToRgb(this.profile.chromePalette.glow);
    const data = new Float32Array([
      width,
      height,
      shellColor[0],
      shellColor[1],
      shellColor[2],
      accentColor[0],
      accentColor[1],
      accentColor[2],
    ]);
    this.device.queue.writeBuffer(this.uniformBuffer, 0, data.buffer);

    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this.context.getCurrentTexture().createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(3);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }
}

function getGpuBufferUsage(): GpuBufferUsageLike {
  return (
    (globalThis as typeof globalThis & { GPUBufferUsage?: GpuBufferUsageLike }).GPUBufferUsage ??
    { UNIFORM: 1, COPY_DST: 2 }
  );
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace('#', '');
  const value = normalized.length === 3
    ? normalized.split('').map((part) => part + part).join('')
    : normalized;
  const parsed = Number.parseInt(value, 16);
  return [
    ((parsed >> 16) & 0xff) / 255,
    ((parsed >> 8) & 0xff) / 255,
    (parsed & 0xff) / 255,
  ];
}
