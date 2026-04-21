import { describe, expect, test } from 'bun:test';
import { createStaticVisualConfigSource } from '../../web/src/runtime/config';
import { createAppRuntime } from '../../web/src/runtime/runtime';

describe('runtime visual config', () => {
  test('creates an app runtime from an injected visual config source', () => {
    const runtime = createAppRuntime({
      documentLike: {
        createElement() {
          return {
            getContext(kind: string) {
              return kind === 'webgl2' ? { ok: true } : null;
            },
          };
        },
      } as unknown as Document,
      navigatorLike: {
        gpu: {
          requestAdapter() {
            return Promise.resolve(null);
          },
        },
      } as unknown as Navigator,
      visualConfigSource: createStaticVisualConfigSource({
        id: 'supaterm.ocean',
        themeId: 'supaterm.theme.ocean',
        fontFamily: 'Iosevka Term',
        fontSize: 15,
        chromePalette: {
          shellBackground: '#04070c',
          shellBackgroundAlt: '#0d1118',
          glow: '#5fb4ff',
          grid: '#122236',
        },
      }),
    });

    expect(runtime.visualProfile.id).toBe('supaterm.ocean');
    expect(runtime.visualProfile.themeId).toBe('supaterm.theme.ocean');
    expect(runtime.visualProfile.fontFamily).toBe('Iosevka Term');
    expect(runtime.visualProfile.fontSize).toBe(15);
    expect(runtime.visualProfile.chromePalette.glow).toBe('#5fb4ff');
    expect(runtime.runtimeProfile.preferredRenderer).toBe('webgpu');
    expect(runtime.createRenderer().descriptor.themeId).toBe('supaterm.theme.ocean');
  });
});
