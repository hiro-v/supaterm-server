export type SupatermStartupMarkName =
  | 'bootstrap-started'
  | 'workbench-mounted'
  | 'renderer-ready'
  | 'websocket-open'
  | 'first-terminal-bytes'
  | 'first-pane-connected';

export type SupatermPerfState = {
  marks: Partial<Record<SupatermStartupMarkName, number>>;
  attachTrace: {
    sessionReused: boolean | null;
    sessionAgeMs: number | null;
    outputPumpStartedMs: number | null;
    firstBackendReadMs: number | null;
    firstBroadcastMs: number | null;
  };
};

const perfKey = '__supatermPerf';

export function initSupatermPerf(): void {
  const existing = getSupatermPerfState();
  if (existing.marks['bootstrap-started'] != null) return;
  existing.marks['bootstrap-started'] = performance.now();
}

export function markSupatermPerf(mark: SupatermStartupMarkName): void {
  getSupatermPerfState().marks[mark] ??= performance.now();
}

export function readSupatermPerf(): SupatermPerfState {
  const state = getSupatermPerfState();
  return {
    marks: { ...state.marks },
    attachTrace: { ...state.attachTrace },
  };
}

export function updateSupatermAttachTrace(trace: {
  sessionReused: boolean;
  sessionAgeMs: number;
  outputPumpStartedMs: number | null;
  firstBackendReadMs: number | null;
  firstBroadcastMs: number | null;
}): void {
  const state = getSupatermPerfState();
  state.attachTrace = {
    ...state.attachTrace,
    ...trace,
  };
}

function getSupatermPerfState(): SupatermPerfState {
  const target = globalThis as typeof globalThis & {
    [perfKey]?: SupatermPerfState;
  };
  target[perfKey] ??= {
    marks: {},
    attachTrace: {
      sessionReused: null,
      sessionAgeMs: null,
      outputPumpStartedMs: null,
      firstBackendReadMs: null,
      firstBroadcastMs: null,
    },
  };
  target[perfKey]!.attachTrace ??= {
    sessionReused: null,
    sessionAgeMs: null,
    outputPumpStartedMs: null,
    firstBackendReadMs: null,
    firstBroadcastMs: null,
  };
  return target[perfKey]!;
}
