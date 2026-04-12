#!/usr/bin/env bun
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

type Assert = {
  contains?: string | string[];
};

type Check = {
  name: string;
  command: string;
  required?: boolean;
  description?: string;
  cwd?: string;
  timeoutMs?: number;
  phase?: string;
  expect?: Assert;
  maxDurationMs?: number;
};

type HarnessConfig = {
  version: number;
  metadata?: Record<string, string>;
  checks: Check[];
};

type CheckResult = Check & {
  status: "pass" | "warn" | "fail";
  exitCode: number;
  durationMs: number;
  stdout: string;
  stderr: string;
};

type PhaseSummary = {
  phase: string;
  checks: number;
  passed: number;
  warned: number;
  failed: number;
};

const root = process.cwd();
const configPath = path.join(root, ".agent-harness", "harness.json");
const configText = readFileSync(configPath, "utf8");
const config = JSON.parse(configText) as HarnessConfig;

const rawArgs = process.argv.slice(2);
const phaseArgIndex = rawArgs.findIndex((a) => a === "--phase" || a.startsWith("--phase="));
const selectedPhase = phaseArgIndex >= 0
  ? rawArgs[phaseArgIndex] === "--phase"
    ? rawArgs[phaseArgIndex + 1]
    : rawArgs[phaseArgIndex].slice("--phase=".length)
  : process.env.AGENT_HARNESS_PHASE;

if (selectedPhase && selectedPhase.trim().length === 0) {
  console.error("Invalid --phase argument");
  process.exit(2);
}

const checks = selectedPhase
  ? config.checks.filter((check) => (check.phase ?? "default") === selectedPhase)
  : config.checks;

if (selectedPhase && checks.length === 0) {
  console.error(`No checks found for phase "${selectedPhase}"`);
  process.exit(2);
}

function outputMatchesExpected(
  stdout: string,
  stderr: string,
  check: Check,
): boolean {
  if (!check.expect) return true;
  const combined = `${stdout}\n${stderr}`;

  const expected = check.expect.contains;
  if (!expected) return true;

  if (Array.isArray(expected)) {
    return expected.every((entry) => combined.includes(entry));
  }

  return combined.includes(expected);
}

const results: CheckResult[] = [];
let requiredFailed = 0;
const phaseIndex = new Map<string, PhaseSummary>();

for (const check of checks) {
  const phase = check.phase ?? "default";
  const summary = phaseIndex.get(phase) ?? {
    phase,
    checks: 0,
    passed: 0,
    warned: 0,
    failed: 0,
  };
  summary.checks += 1;
  phaseIndex.set(phase, summary);

  const start = performance.now();
  const p = spawnSync(check.command, {
    cwd: check.cwd ? path.resolve(root, check.cwd) : root,
    shell: true,
    stdio: ["pipe", "pipe", "pipe"],
    encoding: "utf8",
    timeout: check.timeoutMs ?? 60_000,
    windowsHide: true,
  });

  const durationMs = Math.round(performance.now() - start);
  const exitCode = typeof p.status === "number" ? p.status : 1;
  const outputMatches = outputMatchesExpected(
    (p.stdout ?? "").toString(),
    (p.stderr ?? "").toString(),
    check,
  );
  const required = check.required !== false;
  const withinTime = typeof check.maxDurationMs === "number"
    ? durationMs <= check.maxDurationMs
    : true;

  let status: "pass" | "warn" | "fail" = "pass";
  if (exitCode !== 0 || !outputMatches || !withinTime) {
    if (required) {
      requiredFailed += 1;
      status = "fail";
    } else {
      status = "warn";
    }
  }

  if (status === "pass") summary.passed += 1;
  if (status === "warn") summary.warned += 1;
  if (status === "fail") summary.failed += 1;

  const stdout = (p.stdout ?? "").toString().trimEnd();
  const stderr = (p.stderr ?? "").toString().trimEnd();
  results.push({
    ...check,
    status,
    exitCode,
    durationMs,
    stdout,
    stderr,
  });

  const prefix = status === "pass" ? "[PASS]" : status === "warn" ? "[WARN]" : "[FAIL]";
  const suffix = check.required === false ? " (optional)" : "";
  const latency = check.maxDurationMs
    ? ` (latency ${durationMs}/${check.maxDurationMs}ms${withinTime ? ", ok" : ", exceeded"})`
    : "";
  console.log(
    `${prefix} ${check.name}${suffix} (${durationMs} ms, exit ${exitCode})${latency}`,
  );
}

const totalChecks = results.length;
const passedChecks = results.filter((r) => r.status === "pass").length;
const failedChecks = results.filter((r) => r.status === "fail").length;
const warningChecks = results.filter((r) => r.status === "warn").length;
const passRate = totalChecks === 0 ? 0 : Math.round((passedChecks / totalChecks) * 100);
const command = selectedPhase
  ? `bun run ./.agent-harness/run.ts --phase ${selectedPhase}`
  : "bun run ./.agent-harness/run.ts";

const phaseSummaries = Array.from(phaseIndex.values()).sort((a, b) =>
  a.phase.localeCompare(b.phase),
);

const report = {
  generatedAt: new Date().toISOString(),
  command,
  configPath,
  selectedPhase: selectedPhase ?? "all",
  summary: {
    totalChecks,
    passedChecks,
    warningChecks,
    failedChecks,
    requiredFailed,
    passRatePercent: passRate,
    requiredChecksPassed: requiredFailed === 0,
  },
  metadata: config.metadata ?? {},
  phaseSummaries,
  checks: results,
};

const outDir = path.join(root, ".agent-harness", "artifacts");
mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "latest.json");
writeFileSync(outPath, JSON.stringify(report, null, 2));

console.log("\nHARNESS " + (requiredFailed === 0 ? "PASS" : "BLOCKED"));
console.log(
  `checks=${totalChecks} pass=${passedChecks} warn=${warningChecks} fail=${failedChecks} passRate=${passRate}%`,
);
console.log(`report=${outPath}`);

for (const summary of phaseSummaries) {
  console.log(
    `phase=${summary.phase} checks=${summary.checks} pass=${summary.passed} warn=${summary.warned} fail=${summary.failed}`,
  );
}

if (requiredFailed > 0) {
  process.exit(1);
}
