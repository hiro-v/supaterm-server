import { describe, expect, test } from 'bun:test';
import {
  buildBrowserRuntimeProfile,
  detectBrowserRendererCapabilities,
} from '../../web/src/runtime/renderer';
import { createTerminalVisualProfile } from '../../web/src/runtime/profile';
import { createPaneRuntime } from '../../web/src/runtime/runtime';

describe('browser runtime profile', () => {
  test('builds a webgpu-ready runtime profile when WebGPU is exposed', () => {
    const profile = buildBrowserRuntimeProfile({
      webgpuApi: true,
      webgl2: true,
    });

    expect(profile.terminalRenderer).toBe('libghosty-canvas');
    expect(profile.preferredRenderer).toBe('webgpu');
    expect(profile.rendererReadiness).toBe('webgpu-ready');
    expect(profile.id).toBe('supaterm.runtime.webgpu-ready');
  });

  test('falls back to canvas-only readiness when WebGPU is unavailable', () => {
    const capabilities = detectBrowserRendererCapabilities(
      {
        createElement() {
          return {
            getContext(kind: string) {
              return kind === 'webgl2' ? { ok: true } : null;
            },
          };
        },
      },
      {},
    );

    expect(capabilities.webgpuApi).toBe(false);
    expect(capabilities.webgl2).toBe(true);
  });

  test('creates an explicit terminal visual profile from runtime capabilities', () => {
    const visualProfile = createTerminalVisualProfile(
      buildBrowserRuntimeProfile({
        webgpuApi: false,
        webgl2: false,
      }),
    );

    expect(visualProfile.id).toBe('supaterm.neutral-green');
    expect(visualProfile.runtime.rendererReadiness).toBe('canvas-only');
    expect(visualProfile.theme.background).toBe('#101319');
    expect(visualProfile.fontFamily).toContain('JetBrains Mono');
  });

  test('creates a real pane runtime with an active renderer adapter', () => {
    const originalDocument = globalThis.document;
    const originalNavigator = globalThis.navigator;

    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        createElement() {
          return {
            getContext(kind: string) {
              return kind === 'webgl2' ? { ok: true } : null;
            },
          };
        },
      },
    });

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { gpu: { requestAdapter() {} } },
    });

    try {
      const runtime = createPaneRuntime();
      expect(runtime.runtimeProfile.rendererReadiness).toBe('webgpu-ready');
      expect(runtime.renderer.descriptor.activeRenderer).toBe('libghosty-canvas');
      expect(runtime.renderer.descriptor.requestedRenderer).toBe('webgpu');
      expect(runtime.renderer.descriptor.fallbackReason).toContain('WebGPU renderer is not implemented yet');
    } finally {
      Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument });
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: originalNavigator });
    }
  });
});
