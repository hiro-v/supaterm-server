import type { BrowserRuntimeProfile } from './contracts';

export type BrowserRendererCapabilities = {
  webgpuApi: boolean;
  webgl2: boolean;
};

type DocumentLike = {
  createElement(tagName: string): unknown;
};

type NavigatorLike = {
  gpu?: unknown;
};

export function buildBrowserRuntimeProfile(
  capabilities: BrowserRendererCapabilities,
): BrowserRuntimeProfile {
  return {
    id: capabilities.webgpuApi ? 'supaterm.runtime.webgpu-ready' : 'supaterm.runtime.canvas-only',
    terminalRenderer: 'libghosty-canvas',
    preferredRenderer: 'webgpu',
    webgpuApi: capabilities.webgpuApi,
    webgl2: capabilities.webgl2,
    rendererReadiness: capabilities.webgpuApi ? 'webgpu-ready' : 'canvas-only',
  };
}

export function detectBrowserRendererCapabilities(
  documentLike: DocumentLike | null | undefined = typeof document !== 'undefined' ? document : undefined,
  navigatorLike: NavigatorLike | null | undefined = typeof navigator !== 'undefined'
    ? (navigator as NavigatorLike)
    : undefined,
): BrowserRendererCapabilities {
  const webgpuApi = Boolean(navigatorLike && 'gpu' in navigatorLike && navigatorLike.gpu);
  const webgl2 = canCreateWebGl2Context(documentLike);
  return { webgpuApi, webgl2 };
}

export function detectBrowserRuntimeProfile(
  documentLike: DocumentLike | null | undefined = typeof document !== 'undefined' ? document : undefined,
  navigatorLike: NavigatorLike | null | undefined = typeof navigator !== 'undefined'
    ? (navigator as NavigatorLike)
    : undefined,
): BrowserRuntimeProfile {
  return buildBrowserRuntimeProfile(detectBrowserRendererCapabilities(documentLike, navigatorLike));
}

function canCreateWebGl2Context(documentLike: DocumentLike | null | undefined): boolean {
  if (!documentLike) return false;
  const element = documentLike.createElement('canvas');
  if (typeof HTMLCanvasElement === 'undefined' || !(element instanceof HTMLCanvasElement)) {
    const getContext = (element as { getContext?: (kind: string) => unknown }).getContext;
    return Boolean(getContext?.call(element, 'webgl2'));
  }
  return Boolean(element.getContext('webgl2'));
}
