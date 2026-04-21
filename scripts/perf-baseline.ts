#!/usr/bin/env bun
import path from 'node:path';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { chromium, type Browser, type Page } from '@playwright/test';
import { ensureWebBuilt, startServer, type StartedServer } from '../tests/helpers/runtime';

export type RendererMetrics = {
  atlasGlyphEntries: number | null;
  atlasWidth: number | null;
  atlasHeight: number | null;
  atlasResetCount: number | null;
  activeGlyphQuads: number | null;
  activeRects: number | null;
  rectBufferCapacityBytes: number | null;
  glyphBufferCapacityBytes: number | null;
  uploadBytes: number | null;
  frameCpuMs: number | null;
  frameCpuAvgMs: number | null;
};

export type StartupMetrics = {
  bootstrapStartedMs: number | null;
  workbenchMountedMs: number | null;
  rendererReadyMs: number | null;
  websocketOpenMs: number | null;
  firstTerminalBytesMs: number | null;
  firstPaneConnectedMarkMs: number | null;
  serverSessionReused: boolean | null;
  serverSessionAgeMs: number | null;
  serverOutputPumpStartedMs: number | null;
  serverFirstBackendReadMs: number | null;
  serverFirstBroadcastMs: number | null;
};

export type Sample = {
  shellReadyMs: number;
  firstTerminalCanvasMs: number;
  firstPaneConnectedMs: number;
  startup: StartupMetrics;
  renderer: RendererMetrics;
};

export type MultiPaneSample = {
  fourPaneLayoutMs: number;
  fourPaneConnectedMs: number;
  startup: StartupMetrics;
  renderer: RendererMetrics;
};

type BrowserAggregate = {
  shellReadyMs: number;
  firstTerminalCanvasMs: number;
  firstPaneConnectedMs: number;
  fourPaneLayoutMs: number;
  fourPaneConnectedMs: number;
  startup: StartupMetrics;
  renderer: RendererMetrics;
};

type BrowserBaseline = {
  singlePaneSamples: Sample[];
  fourPaneSamples: MultiPaneSample[];
  averages: BrowserAggregate;
  percentiles: {
    p50: BrowserAggregate;
    p95: BrowserAggregate;
  };
};

type BuildBaseline = {
  wasmBytes: number;
  wasmAssetBytes: number;
  jsAssetBytes: number;
  cssAssetBytes: number;
  jsMapBytes: number;
};

type CiJobTiming = {
  job: string;
  seconds: number;
};

export type BaselineReport = {
  generatedAt: string;
  commit: string;
  ci: {
    runUrl: string;
    jobs: CiJobTiming[];
  };
  build: BuildBaseline;
  browser: BrowserBaseline;
  moduleSizes: {
    zig: Record<string, number>;
    workbench: Record<string, number>;
  };
};

const repoRoot = process.cwd();
const outputPath = resolveArtifactPath(
  process.env.SUPATERM_PERF_OUTPUT_PATH,
  '.agent-harness', 'artifacts', 'perf-baseline.json',
);
const sampleCount = Number.parseInt(process.env.SUPATERM_PERF_SAMPLES ?? '3', 10);
const browserArgs = ['--enable-unsafe-webgpu'];

if (import.meta.main) {
  const report = await collectPerfReport();
  writePerfReport(report, outputPath);
  console.log(JSON.stringify(report, null, 2));
}

export async function collectPerfReport(count = sampleCount): Promise<BaselineReport> {
  await ensureWebBuilt();
  const server = await startServer({
    backend: 'local',
    enableShareApi: true,
    tokenPolicy: 'open',
  });

  try {
    const browser = await chromium.launch({ headless: true, args: browserArgs });
    try {
      const singlePaneSamples: Sample[] = [];
      const fourPaneSamples: MultiPaneSample[] = [];

      for (let index = 0; index < count; index += 1) {
        singlePaneSamples.push(await measureSinglePane(browser, server));
        fourPaneSamples.push(await measureFourPane(browser, server));
      }

      return {
        generatedAt: new Date().toISOString(),
        commit: await gitRevParse('HEAD'),
        ci: await collectLatestCiTimings(),
        build: collectBuildBaseline(),
        browser: {
          singlePaneSamples,
          fourPaneSamples,
          averages: aggregateBrowserMetrics(singlePaneSamples, fourPaneSamples, average, averageNullable),
          percentiles: {
            p50: aggregateBrowserMetrics(
              singlePaneSamples,
              fourPaneSamples,
              (values) => percentile(values, 50),
              (values) => percentileNullable(values, 50),
            ),
            p95: aggregateBrowserMetrics(
              singlePaneSamples,
              fourPaneSamples,
              (values) => percentile(values, 95),
              (values) => percentileNullable(values, 95),
            ),
          },
        },
        moduleSizes: {
          zig: collectLineCounts([
            'src/main.zig',
            'src/session_manager.zig',
            'src/session_backends.zig',
            'src/session_http.zig',
          ]),
          workbench: collectLineCounts([
            'web/src/workbench.ts',
            'web/src/workbench/state.ts',
            'web/src/workbench/commands.ts',
            'web/src/workbench/overlay.ts',
            'web/src/workbench/panes.ts',
            'web/src/workbench/sidebar.ts',
            'web/src/workbench/persistence.ts',
          ]),
        },
      };
    } finally {
      await browser.close();
    }
  } finally {
    await server.stop();
  }
}

export function writePerfReport(report: BaselineReport, filePath = outputPath): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(report, null, 2));
}

async function measureSinglePane(browser: Browser, server: StartedServer): Promise<Sample> {
  const page = await browser.newPage();
  try {
    await resetWorkbench(page, server.baseUrl);

    const startedAt = performance.now();
    await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
    await page.locator('.workspace-chip').waitFor({ state: 'visible' });
    const shellReadyMs = performance.now() - startedAt;

    await page.locator('.pane-terminal canvas:not([data-supaterm-layer])').first().waitFor({ state: 'visible' });
    const firstTerminalCanvasMs = performance.now() - startedAt;

    await page.locator(".pane-status[data-tone='connected']").first().waitFor({ state: 'visible' });
    const firstPaneConnectedMs = performance.now() - startedAt;

    await runPerfScene(page);
    const startup = await readStartupMetrics(page);
    const renderer = await readRendererMetrics(page);

    return {
      shellReadyMs: round(shellReadyMs),
      firstTerminalCanvasMs: round(firstTerminalCanvasMs),
      firstPaneConnectedMs: round(firstPaneConnectedMs),
      startup,
      renderer,
    };
  } finally {
    await page.close();
  }
}

async function measureFourPane(browser: Browser, server: StartedServer): Promise<MultiPaneSample> {
  const page = await browser.newPage();
  try {
    await resetWorkbench(page, server.baseUrl);
    await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
    await page.locator(".pane-status[data-tone='connected']").first().waitFor({ state: 'visible' });

    const startedAt = performance.now();
    for (let index = 0; index < 3; index += 1) {
      await page.locator(".pane-card[data-active='true']").first().getByRole('button', { name: 'Split down' }).click();
      await page.locator('.pane-card').nth(index + 1).waitFor({ state: 'visible' });
    }

    await page.waitForFunction(() => document.querySelectorAll('.pane-card').length === 4);
    const fourPaneLayoutMs = performance.now() - startedAt;

    await page.waitForFunction(() => document.querySelectorAll(".pane-status[data-tone='connected']").length === 4);
    const fourPaneConnectedMs = performance.now() - startedAt;

    await runPerfScene(page);
    const startup = await readStartupMetrics(page);
    const renderer = await readRendererMetrics(page);

    return {
      fourPaneLayoutMs: round(fourPaneLayoutMs),
      fourPaneConnectedMs: round(fourPaneConnectedMs),
      startup,
      renderer,
    };
  } finally {
    await page.close();
  }
}

async function runPerfScene(page: Page): Promise<void> {
  await page.locator('.pane-terminal canvas:not([data-supaterm-layer])').first().click();
  await page.waitForTimeout(100);
  await page.keyboard.type([
    "printf 'PERF_ASCII_READY\\n'",
    "printf '\\033[4mPERF_UNDERLINE\\033[0m\\n'",
    "printf '\\033[7mPERF_INVERSE\\033[0m\\n'",
    "printf 'PERF_WIDE 界🙂 MIX\\n'",
  ].join('; '), { delay: 4 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(350);
}

async function readRendererMetrics(page: Page): Promise<RendererMetrics> {
  const activePane = page.locator(".pane-card[data-active='true']").first();
  await activePane.getByRole('button', { name: 'Pane details' }).click();
  const panel = page.locator('.info-panel');
  await panel.waitFor({ state: 'visible' });

  const rows = await page.evaluate(() => {
    return Object.fromEntries(
      Array.from(document.querySelectorAll('.info-panel .info-row')).map((row) => {
        const label = row.querySelector('.info-label')?.textContent?.trim() ?? '';
        const value = row.lastElementChild?.textContent?.trim() ?? '';
        return [label, value];
      }),
    );
  }) as Record<string, string>;

  await page.keyboard.press('Escape');
  await page.locator('.info-panel').waitFor({ state: 'detached' });

  return {
    atlasGlyphEntries: parseMetric(rows['Atlas Entries']),
    atlasWidth: parseDimensions(rows['Atlas Size']).cols,
    atlasHeight: parseDimensions(rows['Atlas Size']).rows,
    atlasResetCount: parseMetric(rows['Atlas Resets']),
    activeGlyphQuads: parseMetric(rows['Glyph Quads']),
    activeRects: parseMetric(rows['Rect Instances']),
    rectBufferCapacityBytes: parseMetric(rows['Rect Buffer']),
    glyphBufferCapacityBytes: parseMetric(rows['Glyph Buffer']),
    uploadBytes: parseMetric(rows['Upload']),
    frameCpuMs: parseFloatMetric(rows['Frame CPU']),
    frameCpuAvgMs: parseFloatMetric(rows['Frame CPU Avg']),
  };
}

async function readStartupMetrics(page: Page): Promise<StartupMetrics> {
  return await page.evaluate(() => {
    const state = (window as typeof window & {
      __supatermPerf?: {
        marks?: Record<string, number | undefined>;
        attachTrace?: {
          sessionReused?: boolean | null;
          sessionAgeMs?: number | null;
          outputPumpStartedMs?: number | null;
          firstBackendReadMs?: number | null;
          firstBroadcastMs?: number | null;
        };
      };
    }).__supatermPerf;
    const marks = state?.marks ?? {};
    const attachTrace = state?.attachTrace ?? {};
    const readMark = (key: string) => typeof marks[key] === 'number'
      ? Math.round((marks[key] ?? 0) * 100) / 100
      : null;
    return {
      bootstrapStartedMs: readMark('bootstrap-started'),
      workbenchMountedMs: readMark('workbench-mounted'),
      rendererReadyMs: readMark('renderer-ready'),
      websocketOpenMs: readMark('websocket-open'),
      firstTerminalBytesMs: readMark('first-terminal-bytes'),
      firstPaneConnectedMarkMs: readMark('first-pane-connected'),
      serverSessionReused: attachTrace.sessionReused ?? null,
      serverSessionAgeMs: attachTrace.sessionAgeMs ?? null,
      serverOutputPumpStartedMs: attachTrace.outputPumpStartedMs ?? null,
      serverFirstBackendReadMs: attachTrace.firstBackendReadMs ?? null,
      serverFirstBroadcastMs: attachTrace.firstBroadcastMs ?? null,
    };
  });
}

async function resetWorkbench(page: Page, baseUrl: string) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    window.localStorage.clear();
  });
}

function collectBuildBaseline(): BuildBaseline {
  const assetDir = path.join(repoRoot, 'web', 'dist', 'assets');
  const jsAsset = selectFirst(assetDir, (entry) => entry.startsWith('index-') && entry.endsWith('.js') && !entry.endsWith('.js.map'));
  const jsMapAsset = selectFirst(assetDir, (entry) => entry.startsWith('index-') && entry.endsWith('.js.map'));
  const cssAsset = selectFirst(assetDir, (entry) => entry.startsWith('index-') && entry.endsWith('.css'));
  const wasmAsset = selectFirst(assetDir, (entry) => entry.startsWith('ghostty-vt-') && entry.endsWith('.wasm'));

  return {
    wasmBytes: statSync(path.join(repoRoot, 'third_party', 'libghostty', 'ghostty-vt.wasm')).size,
    wasmAssetBytes: statSync(path.join(assetDir, wasmAsset)).size,
    jsAssetBytes: statSync(path.join(assetDir, jsAsset)).size,
    cssAssetBytes: statSync(path.join(assetDir, cssAsset)).size,
    jsMapBytes: statSync(path.join(assetDir, jsMapAsset)).size,
  };
}

async function collectLatestCiTimings(): Promise<{ runUrl: string; jobs: CiJobTiming[] }> {
  const run = await Bun.$`gh run view 24335799504 --json jobs,url`.json() as {
    jobs: Array<{ name: string; startedAt: string; completedAt: string }>;
    url: string;
  };

  return {
    runUrl: run.url,
    jobs: run.jobs.map((job) => ({
      job: job.name,
      seconds: elapsedSeconds(job.startedAt, job.completedAt),
    })),
  };
}

function collectLineCounts(paths: string[]): Record<string, number> {
  return Object.fromEntries(
    paths.map((relativePath) => {
      const contents = readFileSync(path.join(repoRoot, relativePath), 'utf8');
      return [relativePath, contents.split('\n').length];
    }),
  );
}

async function gitRevParse(ref: string): Promise<string> {
  return (await Bun.$`git rev-parse ${ref}`.text()).trim();
}

function selectFirst(dir: string, predicate: (entry: string) => boolean): string {
  const entry = readdirSync(dir).sort().find(predicate);
  if (!entry) {
    throw new Error(`unable to locate expected asset in ${dir}`);
  }
  return entry;
}

function elapsedSeconds(startedAt: string, completedAt: string): number {
  return round((Date.parse(completedAt) - Date.parse(startedAt)) / 1000);
}

function average(values: number[]): number {
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function aggregateBrowserMetrics(
  singlePaneSamples: Sample[],
  fourPaneSamples: MultiPaneSample[],
  aggregate: (values: number[]) => number,
  aggregateNullableMetric: (values: Array<number | null>) => number | null,
): BrowserAggregate {
  return {
    shellReadyMs: aggregate(singlePaneSamples.map((sample) => sample.shellReadyMs)),
    firstTerminalCanvasMs: aggregate(singlePaneSamples.map((sample) => sample.firstTerminalCanvasMs)),
    firstPaneConnectedMs: aggregate(singlePaneSamples.map((sample) => sample.firstPaneConnectedMs)),
    fourPaneLayoutMs: aggregate(fourPaneSamples.map((sample) => sample.fourPaneLayoutMs)),
    fourPaneConnectedMs: aggregate(fourPaneSamples.map((sample) => sample.fourPaneConnectedMs)),
    startup: {
      bootstrapStartedMs: aggregateNullableMetric(singlePaneSamples.map((sample) => sample.startup.bootstrapStartedMs)),
      workbenchMountedMs: aggregateNullableMetric(singlePaneSamples.map((sample) => sample.startup.workbenchMountedMs)),
      rendererReadyMs: aggregateNullableMetric(singlePaneSamples.map((sample) => sample.startup.rendererReadyMs)),
      websocketOpenMs: aggregateNullableMetric(singlePaneSamples.map((sample) => sample.startup.websocketOpenMs)),
      firstTerminalBytesMs: aggregateNullableMetric(singlePaneSamples.map((sample) => sample.startup.firstTerminalBytesMs)),
      firstPaneConnectedMarkMs: aggregateNullableMetric(singlePaneSamples.map((sample) => sample.startup.firstPaneConnectedMarkMs)),
      serverSessionReused: aggregateBoolean(singlePaneSamples.map((sample) => sample.startup.serverSessionReused)),
      serverSessionAgeMs: aggregateNullableMetric(singlePaneSamples.map((sample) => sample.startup.serverSessionAgeMs)),
      serverOutputPumpStartedMs: aggregateNullableMetric(singlePaneSamples.map((sample) => sample.startup.serverOutputPumpStartedMs)),
      serverFirstBackendReadMs: aggregateNullableMetric(singlePaneSamples.map((sample) => sample.startup.serverFirstBackendReadMs)),
      serverFirstBroadcastMs: aggregateNullableMetric(singlePaneSamples.map((sample) => sample.startup.serverFirstBroadcastMs)),
    },
    renderer: aggregateRendererMetrics(
      singlePaneSamples.map((sample) => sample.renderer),
      fourPaneSamples.map((sample) => sample.renderer),
      aggregateNullableMetric,
    ),
  };
}

function aggregateRendererMetrics(
  single: RendererMetrics[],
  multi: RendererMetrics[],
  aggregateNullableMetric: (values: Array<number | null>) => number | null,
): RendererMetrics {
  const metrics = single.concat(multi);
  return {
    atlasGlyphEntries: aggregateNullableMetric(metrics.map((metric) => metric.atlasGlyphEntries)),
    atlasWidth: aggregateNullableMetric(metrics.map((metric) => metric.atlasWidth)),
    atlasHeight: aggregateNullableMetric(metrics.map((metric) => metric.atlasHeight)),
    atlasResetCount: aggregateNullableMetric(metrics.map((metric) => metric.atlasResetCount)),
    activeGlyphQuads: aggregateNullableMetric(metrics.map((metric) => metric.activeGlyphQuads)),
    activeRects: aggregateNullableMetric(metrics.map((metric) => metric.activeRects)),
    rectBufferCapacityBytes: aggregateNullableMetric(metrics.map((metric) => metric.rectBufferCapacityBytes)),
    glyphBufferCapacityBytes: aggregateNullableMetric(metrics.map((metric) => metric.glyphBufferCapacityBytes)),
    uploadBytes: aggregateNullableMetric(metrics.map((metric) => metric.uploadBytes)),
    frameCpuMs: aggregateNullableMetric(metrics.map((metric) => metric.frameCpuMs)),
    frameCpuAvgMs: aggregateNullableMetric(metrics.map((metric) => metric.frameCpuAvgMs)),
  };
}

function averageNullable(values: Array<number | null>): number | null {
  const defined = values.filter((value): value is number => value != null);
  if (defined.length === 0) return null;
  return round(defined.reduce((sum, value) => sum + value, 0) / defined.length);
}

function aggregateBoolean(values: Array<boolean | null>): boolean | null {
  for (const value of values) {
    if (value != null) return value;
  }
  return null;
}

function percentile(values: number[], percentileValue: number): number {
  if (values.length === 0) {
    throw new Error('cannot compute percentile for empty values');
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1));
  return round(sorted[index]!);
}

function percentileNullable(values: Array<number | null>, percentileValue: number): number | null {
  const defined = values.filter((value): value is number => value != null);
  if (defined.length === 0) return null;
  return percentile(defined, percentileValue);
}

function parseMetric(value: string | undefined): number | null {
  if (!value || value === 'Unknown') return null;
  const match = value.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function parseFloatMetric(value: string | undefined): number | null {
  return parseMetric(value);
}

function parseDimensions(value: string | undefined): { cols: number | null; rows: number | null } {
  if (!value || value === 'Unknown') {
    return { cols: null, rows: null };
  }
  const match = value.match(/(\d+)\s×\s(\d+)/);
  if (!match) {
    return { cols: null, rows: null };
  }
  return {
    cols: Number(match[1]),
    rows: Number(match[2]),
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function resolveArtifactPath(customPath: string | undefined, ...relativeParts: string[]): string {
  if (!customPath) {
    return path.join(repoRoot, ...relativeParts);
  }
  return path.isAbsolute(customPath) ? customPath : path.join(repoRoot, customPath);
}
