#!/usr/bin/env bun
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

type PreCommitPlan = {
  stagedFiles: string[];
  runWebChecks: boolean;
  runZigChecks: boolean;
  skip: boolean;
};

const DOC_ONLY_PATTERNS = [
  /^README\.md$/,
  /^AGENTS\.md$/,
  /^CLAUDE\.md$/,
  /^docs\//,
  /^\.agent\//,
];

const WEB_PATTERNS = [
  /^web\//,
  /^proxy\//,
  /^tests\/unit\//,
  /^tests\/browser\//,
  /^package\.json$/,
  /^bun\.lock$/,
  /^scripts\/pre-commit\.ts$/,
  /^scripts\/libghosty-patch\.sh$/,
  /^scripts\/zmx-patch\.sh$/,
  /^third_party\/libghostty\//,
  /^\.agent-harness\//,
  /^\.git-hooks\//,
  /^\.github\/actions\//,
  /^\.github\/workflows\//,
];

const ZIG_PATTERNS = [
  /^src\//,
  /^build\.zig$/,
  /^zlint\.json$/,
  /^scripts\/zlint\.sh$/,
  /^tests\/integration\//,
  /^tests\/contracts\//,
  /^tests\/e2e\//,
  /^third_party\/zmx\//,
  /^\.github\/workflows\//,
];

export function planPreCommit(stagedFiles: string[]): PreCommitPlan {
  const normalized = stagedFiles
    .map((path) => path.trim())
    .filter((path) => path.length > 0);

  if (normalized.length === 0) {
    return {
      stagedFiles: [],
      runWebChecks: false,
      runZigChecks: false,
      skip: true,
    };
  }

  const docsOnly = normalized.every((path) => DOC_ONLY_PATTERNS.some((pattern) => pattern.test(path)));
  if (docsOnly) {
    return {
      stagedFiles: normalized,
      runWebChecks: false,
      runZigChecks: false,
      skip: true,
    };
  }

  const runWebChecks = normalized.some((path) => WEB_PATTERNS.some((pattern) => pattern.test(path)));
  const runZigChecks = normalized.some((path) => ZIG_PATTERNS.some((pattern) => pattern.test(path)));

  return {
    stagedFiles: normalized,
    runWebChecks,
    runZigChecks,
    skip: !runWebChecks && !runZigChecks,
  };
}

export function selectWebTypecheckCommand(libghosttySubmoduleReady: boolean): string[] {
  return libghosttySubmoduleReady
    ? ['bun', 'run', 'web:typecheck']
    : ['bun', 'run', 'web:typecheck:fast'];
}

if (import.meta.main) {
  if (process.env.SKIP_SUPATERM_PRECOMMIT === '1') {
    process.exit(0);
  }

  const stagedFiles = getStagedFiles();
  const plan = planPreCommit(stagedFiles);
  if (plan.skip) {
    process.exit(0);
  }

  if (plan.runWebChecks) {
    runCommand(selectWebTypecheckCommand(hasInitializedLibghosttySubmodule()));
    runCommand(['bun', 'run', 'test:unit']);
  }

  if (plan.runZigChecks) {
    runCommand(['zig', 'build', 'check']);
    runCommand(['bun', 'run', 'zig:lint']);
  }
}

function getStagedFiles(): string[] {
  const result = spawnSync(
    'git',
    ['diff', '--cached', '--name-only', '--diff-filter=ACMR'],
    { encoding: 'utf8', stdio: 'pipe' },
  );

  if (result.status !== 0) {
    throw new Error(`Failed to list staged files\n${result.stdout}\n${result.stderr}`);
  }

  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function hasInitializedLibghosttySubmodule(): boolean {
  return existsSync(path.join(import.meta.dir, '..', 'third_party', 'libghostty', 'ghostty', '.git'));
}

function runCommand(command: string[]): void {
  const result = spawnSync(command[0], command.slice(1), {
    stdio: 'inherit',
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
