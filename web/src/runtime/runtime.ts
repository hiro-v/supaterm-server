import {
  LibghostyCanvasAdapter,
  WebGpuPreferredAdapter,
  type TerminalRendererAdapter,
} from './adapters';
import type {
  BrowserRuntimeProfile,
  TerminalVisualProfile,
  WorkbenchChromeSurface,
} from './contracts';
import {
  createDefaultVisualConfigSource,
  type VisualConfigSource,
} from './config';
import {
  createWorkbenchChromeSurface,
  type ChromeSurfaceFactory,
} from './chrome-surface';
import { createTerminalVisualProfile } from './profile';
import { detectBrowserRuntimeProfile } from './renderer';

export type LatencySnapshot = {
  latencyMs: number | null;
};

export type SharedLatencyProbe = {
  getSnapshot(): LatencySnapshot;
  subscribe(listener: (snapshot: LatencySnapshot) => void): () => void;
};

export type AppRuntime = {
  runtimeProfile: BrowserRuntimeProfile;
  visualProfile: TerminalVisualProfile;
  latencyProbe: SharedLatencyProbe;
  createRenderer(visualProfile?: TerminalVisualProfile): TerminalRendererAdapter;
  createChromeSurface(): WorkbenchChromeSurface;
};

export type PaneRuntime = {
  runtimeProfile: BrowserRuntimeProfile;
  visualProfile: TerminalVisualProfile;
  latencyProbe: SharedLatencyProbe;
  renderer: TerminalRendererAdapter;
};

let sharedAppRuntime: AppRuntime | null = null;

export type AppRuntimeOptions = {
  visualConfigSource?: VisualConfigSource;
  chromeSurfaceFactory?: ChromeSurfaceFactory;
  documentLike?: Document | null;
  navigatorLike?: Navigator | null;
};

export function createAppRuntime(options: AppRuntimeOptions = {}): AppRuntime {
  const runtimeProfile = detectBrowserRuntimeProfile(
    options.documentLike ?? document,
    (options.navigatorLike ?? navigator) as Parameters<typeof detectBrowserRuntimeProfile>[1],
  );
  const visualProfile = createTerminalVisualProfile(
    runtimeProfile,
    options.visualConfigSource ?? createDefaultVisualConfigSource(),
  );
  const latencyProbe = createSharedLatencyProbe();
  const chromeSurfaceFactory = options.chromeSurfaceFactory ?? ((profile, navigatorLike) =>
    createWorkbenchChromeSurface(profile, navigatorLike ?? navigator)
  );

  return {
    runtimeProfile,
    visualProfile,
    latencyProbe,
    createRenderer(profile = visualProfile) {
      if (profile.runtime.terminalRenderer === 'webgpu-experimental') {
        return new WebGpuPreferredAdapter({ profile });
      }
      return new LibghostyCanvasAdapter({ profile });
    },
    createChromeSurface() {
      return chromeSurfaceFactory(
        visualProfile,
        (options.navigatorLike ?? navigator) as Navigator,
      );
    },
  };
}

export function getAppRuntime(): AppRuntime {
  if (sharedAppRuntime) return sharedAppRuntime;
  sharedAppRuntime = createAppRuntime();
  return sharedAppRuntime;
}

export function createPaneRuntime(appRuntime: AppRuntime = getAppRuntime()): PaneRuntime {
  return {
    runtimeProfile: appRuntime.runtimeProfile,
    visualProfile: appRuntime.visualProfile,
    latencyProbe: appRuntime.latencyProbe,
    renderer: appRuntime.createRenderer(appRuntime.visualProfile),
  };
}

function createSharedLatencyProbe(): SharedLatencyProbe {
  let latencyMs: number | null = null;
  let intervalId: number | null = null;
  const listeners = new Set<(snapshot: LatencySnapshot) => void>();

  const publish = () => {
    const snapshot = { latencyMs };
    for (const listener of listeners) {
      listener(snapshot);
    }
  };

  const measure = async () => {
    const start = performance.now();
    try {
      const response = await fetch(`/health?ts=${Date.now()}`, {
        cache: 'no-store',
        headers: { accept: 'application/json' },
      });
      if (!response.ok) return;
      latencyMs = performance.now() - start;
      publish();
    } catch {
      // Ignore transient probe failures.
    }
  };

  const start = () => {
    if (intervalId != null) return;
    void measure();
    intervalId = window.setInterval(() => {
      void measure();
    }, 5000);
  };

  const stop = () => {
    if (intervalId == null) return;
    window.clearInterval(intervalId);
    intervalId = null;
  };

  return {
    getSnapshot() {
      return { latencyMs };
    },
    subscribe(listener) {
      listeners.add(listener);
      listener({ latencyMs });
      start();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          stop();
        }
      };
    },
  };
}
