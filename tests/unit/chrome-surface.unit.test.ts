import { afterEach, describe, expect, test } from 'bun:test';
import { ensureDom } from '../helpers/dom';
import { createStaticVisualConfigSource } from '../../web/src/runtime/config';
import { createWorkbenchChromeSurface } from '../../web/src/runtime/chrome-surface';
import { buildBrowserRuntimeProfile } from '../../web/src/runtime/renderer';
import { createTerminalVisualProfile } from '../../web/src/runtime/profile';

const originalGetContext = globalThis.HTMLCanvasElement?.prototype.getContext;
const originalGpuBufferUsage = (globalThis as typeof globalThis & {
  GPUBufferUsage?: { UNIFORM: number; COPY_DST: number };
}).GPUBufferUsage;

afterEach(() => {
  if (globalThis.HTMLCanvasElement && originalGetContext) {
    globalThis.HTMLCanvasElement.prototype.getContext = originalGetContext;
  }
  if (originalGpuBufferUsage) {
    (globalThis as typeof globalThis & {
      GPUBufferUsage?: { UNIFORM: number; COPY_DST: number };
    }).GPUBufferUsage = originalGpuBufferUsage;
  }
});

describe('workbench chrome surface', () => {
  test('falls back to a no-op surface when WebGPU is unavailable', () => {
    const profile = createTerminalVisualProfile(
      buildBrowserRuntimeProfile({ webgpuApi: false, webgl2: true }),
      createStaticVisualConfigSource({}),
    );

    const surface = createWorkbenchChromeSurface(profile, {} as Navigator);

    expect(surface.descriptor.activeSurface).toBe('none');
    expect(surface.descriptor.fallbackReason).toContain('WebGPU API unavailable');
  });

  test('mounts a real WebGPU chrome canvas when the API is available', async () => {
    ensureDom();

    const queueWrites: Float32Array[] = [];
    const submitCalls: unknown[][] = [];
    const renderCalls: { draws: number; configuredFormat: string | null }[] = [];
    let configuredFormat: string | null = null;

    const gpuContext = {
      configure(options: { format: string }) {
        configuredFormat = options.format;
      },
      getCurrentTexture() {
        return {
          createView() {
            return { ok: true };
          },
        };
      },
    };

    if (!globalThis.HTMLCanvasElement) {
      throw new Error('Missing HTMLCanvasElement in test environment');
    }

    globalThis.HTMLCanvasElement.prototype.getContext = function getContext(kind: string) {
      if (kind === 'webgpu') return gpuContext as unknown as RenderingContext;
      return originalGetContext?.call(this, kind as never) ?? null;
    };

    (globalThis as typeof globalThis & {
      GPUBufferUsage?: { UNIFORM: number; COPY_DST: number };
    }).GPUBufferUsage = {
      UNIFORM: 1,
      COPY_DST: 2,
    };

    const fakeDevice = {
      queue: {
        writeBuffer(_buffer: unknown, _offset: number, data: ArrayBufferLike) {
          queueWrites.push(new Float32Array(data.slice(0)));
        },
        submit(commands: unknown[]) {
          submitCalls.push(commands);
        },
      },
      createBuffer() {
        return { kind: 'buffer' };
      },
      createShaderModule() {
        return { kind: 'shader' };
      },
      createRenderPipeline() {
        return {
          getBindGroupLayout() {
            return { kind: 'layout' };
          },
        };
      },
      createBindGroup() {
        return { kind: 'bind-group' };
      },
      createCommandEncoder() {
        return {
          beginRenderPass() {
            return {
              setPipeline() {},
              setBindGroup() {},
              draw(count: number) {
                renderCalls.push({ draws: count, configuredFormat });
              },
              end() {},
            };
          },
          finish() {
            return { kind: 'command-buffer' };
          },
        };
      },
    };

    const profile = createTerminalVisualProfile(
      buildBrowserRuntimeProfile({ webgpuApi: true, webgl2: true }),
      createStaticVisualConfigSource({
        id: 'supaterm.test.webgpu',
        chromePalette: {
          shellBackground: '#0a0c10',
          shellBackgroundAlt: '#101520',
          glow: '#52a7ff',
          grid: '#16324b',
        },
      }),
    );

    const surface = createWorkbenchChromeSurface(profile, {
      gpu: {
        requestAdapter() {
          return Promise.resolve({
            requestDevice() {
              return Promise.resolve(fakeDevice as unknown as GPUDevice);
            },
          });
        },
        getPreferredCanvasFormat() {
          return 'bgra8unorm';
        },
      },
    } as unknown as Navigator);

    const host = document.createElement('div');
    Object.defineProperty(host, 'clientWidth', { configurable: true, value: 640 });
    Object.defineProperty(host, 'clientHeight', { configurable: true, value: 320 });
    document.body.append(host);

    surface.mount(host);
    await Promise.resolve();
    await Promise.resolve();
    surface.resize();

    const canvas = host.querySelector('.workbench-chrome-surface');
    expect(surface.descriptor.activeSurface).toBe('webgpu-gradient');
    expect(canvas).toBeTruthy();
    expect(queueWrites.length).toBeGreaterThan(0);
    expect(renderCalls.some((call) => call.draws === 3 && call.configuredFormat === 'bgra8unorm')).toBe(true);
    expect(submitCalls.length).toBeGreaterThan(0);

    surface.dispose();
    expect(host.querySelector('.workbench-chrome-surface')).toBeNull();
  });
});
