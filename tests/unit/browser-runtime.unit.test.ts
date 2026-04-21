import { describe, expect, test } from 'bun:test';
import {
  buildBrowserRuntimeProfile,
  detectBrowserRendererCapabilities,
} from '../../web/src/runtime/renderer';
import { createTerminalVisualProfile } from '../../web/src/runtime/profile';
import { createAppRuntime, createPaneRuntime } from '../../web/src/runtime/runtime';

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

    expect(visualProfile.id).toBe('supaterm.blackout');
    expect(visualProfile.themeId).toBe('supaterm.theme.blackout');
    expect(visualProfile.runtime.rendererReadiness).toBe('canvas-only');
    expect(visualProfile.theme.background).toBe('#000000');
    expect(visualProfile.fontFamily).toContain('MesloLGS NF');
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
      expect(runtime.visualProfile.id).toBe('supaterm.blackout');
      expect(runtime.renderer.descriptor.id).toBe('supaterm.renderer.libghosty-canvas');
      expect(runtime.renderer.descriptor.activeRenderer).toBe('libghosty-canvas');
      expect(runtime.renderer.descriptor.transport).toBe('canvas');
      expect(runtime.renderer.descriptor.requestedRenderer).toBe('webgpu');
      expect(runtime.renderer.descriptor.fallbackReason).toContain('WebGPU terminal renderer remains experimental');
      expect(runtime.renderer.descriptor.visualProfileId).toBe('supaterm.blackout');
      expect(runtime.renderer.descriptor.themeId).toBe('supaterm.theme.blackout');
    } finally {
      Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument });
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: originalNavigator });
    }
  });

  test('reports explicit fallback diagnostics when WebGPU is unavailable', () => {
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
      value: {},
    });

    try {
      const appRuntime = createAppRuntime();
      const renderer = appRuntime.createRenderer(appRuntime.visualProfile);
      const diagnostics = renderer.getDiagnostics();

      expect(renderer.descriptor.activeRenderer).toBe('libghosty-canvas');
      expect(renderer.descriptor.fallbackReason).toContain('WebGPU terminal renderer remains experimental');
      expect(diagnostics.rendererMetricsMode).toBe('fallback-canvas');
      expect(diagnostics.rendererMetricsNote).toBe('WebGPU renderer metrics unavailable on canvas fallback.');
      expect(diagnostics.atlasGlyphEntries).toBeNull();
      expect(diagnostics.rectBufferCapacityBytes).toBeNull();
      renderer.dispose();
    } finally {
      Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument });
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: originalNavigator });
    }
  });
});
