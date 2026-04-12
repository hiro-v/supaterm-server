import { LibghostyCanvasAdapter, type TerminalRendererAdapter } from './adapters';
import { createTerminalVisualProfile } from './profile';
import { detectBrowserRuntimeProfile, type BrowserRuntimeProfile } from './renderer';

export type LatencySnapshot = {
  latencyMs: number | null;
};

export type SharedLatencyProbe = {
  getSnapshot(): LatencySnapshot;
  subscribe(listener: (snapshot: LatencySnapshot) => void): () => void;
};

export type AppRuntime = {
  runtimeProfile: BrowserRuntimeProfile;
  latencyProbe: SharedLatencyProbe;
  createRenderer(): TerminalRendererAdapter;
};

export type PaneRuntime = {
  runtimeProfile: BrowserRuntimeProfile;
  latencyProbe: SharedLatencyProbe;
  renderer: TerminalRendererAdapter;
};

let sharedAppRuntime: AppRuntime | null = null;

export function getAppRuntime(): AppRuntime {
  if (sharedAppRuntime) return sharedAppRuntime;

  const runtimeProfile = detectBrowserRuntimeProfile();
  const profile = createTerminalVisualProfile(runtimeProfile);
  const latencyProbe = createSharedLatencyProbe();

  sharedAppRuntime = {
    runtimeProfile,
    latencyProbe,
    createRenderer() {
      return new LibghostyCanvasAdapter({ profile });
    },
  };

  return sharedAppRuntime;
}

export function createPaneRuntime(appRuntime: AppRuntime = getAppRuntime()): PaneRuntime {
  return {
    runtimeProfile: appRuntime.runtimeProfile,
    latencyProbe: appRuntime.latencyProbe,
    renderer: appRuntime.createRenderer(),
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
