#!/usr/bin/env bun
import path from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { BaselineReport } from './perf-baseline';
import { collectPerfReport, writePerfReport } from './perf-baseline';

type BudgetResult = {
  name: string;
  passed: boolean;
  details: string;
};

type MetricTrend = {
  current: number | null;
  baseline: number | null;
  delta: number | null;
  deltaPct: number | null;
  unit: string;
};

type PerfComparisons = {
  shellReadyMs: MetricTrend;
  firstTerminalCanvasMs: MetricTrend;
  firstPaneConnectedMs: MetricTrend;
  fourPaneLayoutMs: MetricTrend;
  fourPaneConnectedMs: MetricTrend;
  startup: {
    workbenchMountedMs: MetricTrend;
    rendererReadyMs: MetricTrend;
    websocketOpenMs: MetricTrend;
    firstTerminalBytesMs: MetricTrend;
    firstPaneConnectedMarkMs: MetricTrend;
    serverSessionAgeMs: MetricTrend;
    serverOutputPumpStartedMs: MetricTrend;
    serverFirstBackendReadMs: MetricTrend;
    serverFirstBroadcastMs: MetricTrend;
  };
  renderer: {
    frameCpuAvgMs: MetricTrend;
    atlasResetCount: MetricTrend;
    rectBufferCapacityBytes: MetricTrend;
    glyphBufferCapacityBytes: MetricTrend;
    uploadBytes: MetricTrend;
  };
};

const repoRoot = process.cwd();
const baselinePath = resolveArtifactPath(
  process.env.SUPATERM_PERF_BASELINE_PATH,
  '.agent-harness', 'artifacts', 'perf-baseline.json',
);
const currentPath = resolveArtifactPath(
  process.env.SUPATERM_PERF_CURRENT_PATH,
  '.agent-harness', 'artifacts', 'perf-current.json',
);
const resultsPath = resolveArtifactPath(
  process.env.SUPATERM_PERF_RESULTS_PATH,
  '.agent-harness', 'artifacts', 'perf-check.json',
);

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as BaselineReport;
const current = await collectPerfReport(Number.parseInt(process.env.SUPATERM_PERF_SAMPLES ?? '1', 10));
writePerfReport(current, currentPath);

const results: BudgetResult[] = [
  checkUpperBound(
    'four-pane layout latency',
    current.browser.averages.fourPaneLayoutMs,
    baseline.browser.percentiles.p95.fourPaneLayoutMs * 2.25,
  ),
  checkUpperBound(
    'four-pane connected latency',
    current.browser.averages.fourPaneConnectedMs,
    baseline.browser.percentiles.p95.fourPaneConnectedMs * 2.25,
  ),
  checkRelativePair(
    'four-pane frame CPU average',
    current.browser.fourPaneSamples[0]?.renderer.frameCpuAvgMs ?? null,
    current.browser.singlePaneSamples[0]?.renderer.frameCpuAvgMs ?? null,
    2.5,
    1,
  ),
  checkRelativePair(
    'four-pane upload bytes',
    current.browser.fourPaneSamples[0]?.renderer.uploadBytes ?? null,
    current.browser.singlePaneSamples[0]?.renderer.uploadBytes ?? null,
    3,
    8192,
  ),
  checkUpperBoundNullable(
    'four-pane atlas resets',
    current.browser.fourPaneSamples[0]?.renderer.atlasResetCount ?? null,
    (baseline.browser.percentiles.p95.renderer.atlasResetCount ?? 0) + 1,
  ),
  checkRelativePair(
    'four-pane rect buffer capacity',
    current.browser.fourPaneSamples[0]?.renderer.rectBufferCapacityBytes ?? null,
    current.browser.singlePaneSamples[0]?.renderer.rectBufferCapacityBytes ?? null,
    4,
    8192,
  ),
  checkRelativePair(
    'four-pane glyph buffer capacity',
    current.browser.fourPaneSamples[0]?.renderer.glyphBufferCapacityBytes ?? null,
    current.browser.singlePaneSamples[0]?.renderer.glyphBufferCapacityBytes ?? null,
    4,
    8192,
  ),
];

const failed = results.filter((result) => !result.passed);
const comparisons = createPerfComparisons(baseline, current);
const report = { baselinePath, currentPath, resultsPath, current, comparisons, results };
writePerfCheckReport(report, resultsPath);
console.log(JSON.stringify(report, null, 2));

if (failed.length > 0) {
  process.exitCode = 1;
}

function checkUpperBound(name: string, actual: number, limit: number): BudgetResult {
  return {
    name,
    passed: actual <= limit,
    details: `actual=${actual} baseline_p95_limit=${round(limit)}`,
  };
}

function checkUpperBoundNullable(name: string, actual: number | null, limit: number): BudgetResult {
  if (actual == null) {
    return {
      name,
      passed: true,
      details: 'skipped: renderer metrics unavailable on this runtime',
    };
  }
  return checkUpperBound(name, actual, limit);
}

function checkRelativePair(
  name: string,
  multiPaneValue: number | null,
  singlePaneValue: number | null,
  multiplier: number,
  additiveSlack: number,
): BudgetResult {
  if (multiPaneValue == null || singlePaneValue == null) {
    return {
      name,
      passed: true,
      details: 'skipped: renderer metrics unavailable on this runtime',
    };
  }

  const limit = singlePaneValue * multiplier + additiveSlack;
  return {
    name,
    passed: multiPaneValue <= limit,
    details: `single=${singlePaneValue} multi=${multiPaneValue} limit=${round(limit)}`,
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function createPerfComparisons(baseline: BaselineReport, current: BaselineReport): PerfComparisons {
  return {
    shellReadyMs: createMetricTrend(
      current.browser.averages.shellReadyMs,
      baseline.browser.averages.shellReadyMs,
      'ms',
    ),
    firstTerminalCanvasMs: createMetricTrend(
      current.browser.averages.firstTerminalCanvasMs,
      baseline.browser.averages.firstTerminalCanvasMs,
      'ms',
    ),
    firstPaneConnectedMs: createMetricTrend(
      current.browser.averages.firstPaneConnectedMs,
      baseline.browser.averages.firstPaneConnectedMs,
      'ms',
    ),
    fourPaneLayoutMs: createMetricTrend(
      current.browser.averages.fourPaneLayoutMs,
      baseline.browser.averages.fourPaneLayoutMs,
      'ms',
    ),
    fourPaneConnectedMs: createMetricTrend(
      current.browser.averages.fourPaneConnectedMs,
      baseline.browser.averages.fourPaneConnectedMs,
      'ms',
    ),
    startup: {
      workbenchMountedMs: createMetricTrend(
        current.browser.averages.startup.workbenchMountedMs,
        baseline.browser.averages.startup?.workbenchMountedMs ?? null,
        'ms',
      ),
      rendererReadyMs: createMetricTrend(
        current.browser.averages.startup.rendererReadyMs,
        baseline.browser.averages.startup?.rendererReadyMs ?? null,
        'ms',
      ),
      websocketOpenMs: createMetricTrend(
        current.browser.averages.startup.websocketOpenMs,
        baseline.browser.averages.startup?.websocketOpenMs ?? null,
        'ms',
      ),
      firstTerminalBytesMs: createMetricTrend(
        current.browser.averages.startup.firstTerminalBytesMs,
        baseline.browser.averages.startup?.firstTerminalBytesMs ?? null,
        'ms',
      ),
      firstPaneConnectedMarkMs: createMetricTrend(
        current.browser.averages.startup.firstPaneConnectedMarkMs,
        baseline.browser.averages.startup?.firstPaneConnectedMarkMs ?? null,
        'ms',
      ),
      serverSessionAgeMs: createMetricTrend(
        current.browser.averages.startup.serverSessionAgeMs,
        baseline.browser.averages.startup?.serverSessionAgeMs ?? null,
        'ms',
      ),
      serverOutputPumpStartedMs: createMetricTrend(
        current.browser.averages.startup.serverOutputPumpStartedMs,
        baseline.browser.averages.startup?.serverOutputPumpStartedMs ?? null,
        'ms',
      ),
      serverFirstBackendReadMs: createMetricTrend(
        current.browser.averages.startup.serverFirstBackendReadMs,
        baseline.browser.averages.startup?.serverFirstBackendReadMs ?? null,
        'ms',
      ),
      serverFirstBroadcastMs: createMetricTrend(
        current.browser.averages.startup.serverFirstBroadcastMs,
        baseline.browser.averages.startup?.serverFirstBroadcastMs ?? null,
        'ms',
      ),
    },
    renderer: {
      frameCpuAvgMs: createMetricTrend(
        current.browser.averages.renderer.frameCpuAvgMs,
        baseline.browser.averages.renderer.frameCpuAvgMs,
        'ms',
      ),
      atlasResetCount: createMetricTrend(
        current.browser.averages.renderer.atlasResetCount,
        baseline.browser.averages.renderer.atlasResetCount,
        'count',
      ),
      rectBufferCapacityBytes: createMetricTrend(
        current.browser.averages.renderer.rectBufferCapacityBytes,
        baseline.browser.averages.renderer.rectBufferCapacityBytes,
        'bytes',
      ),
      glyphBufferCapacityBytes: createMetricTrend(
        current.browser.averages.renderer.glyphBufferCapacityBytes,
        baseline.browser.averages.renderer.glyphBufferCapacityBytes,
        'bytes',
      ),
      uploadBytes: createMetricTrend(
        current.browser.averages.renderer.uploadBytes,
        baseline.browser.averages.renderer.uploadBytes,
        'bytes',
      ),
    },
  };
}

function createMetricTrend(
  current: number | null,
  baseline: number | null,
  unit: string,
): MetricTrend {
  if (current == null || baseline == null) {
    return {
      current,
      baseline,
      delta: null,
      deltaPct: null,
      unit,
    };
  }

  const delta = round(current - baseline);
  const deltaPct = baseline === 0 ? null : round(((current - baseline) / baseline) * 100);
  return {
    current: round(current),
    baseline: round(baseline),
    delta,
    deltaPct,
    unit,
  };
}

function resolveArtifactPath(customPath: string | undefined, ...relativeParts: string[]): string {
  if (!customPath) {
    return path.join(repoRoot, ...relativeParts);
  }
  return path.isAbsolute(customPath) ? customPath : path.join(repoRoot, customPath);
}

function writePerfCheckReport(report: unknown, filePath: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(report, null, 2));
}
