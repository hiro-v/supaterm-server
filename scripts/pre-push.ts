#!/usr/bin/env bun
import { spawnSync } from 'node:child_process';

export const PRE_PUSH_COMMANDS = [
  ['bun', 'run', 'zig:lint'],
  ['zig', 'build', 'check'],
  ['bun', 'run', 'web:typecheck'],
  ['bun', 'run', 'test:unit'],
  ['bun', 'run', 'test:integration'],
  ['bun', 'run', 'test:contract'],
  ['bun', 'run', 'test:e2e'],
  ['bun', 'run', 'web:build'],
] as const;

export function getPrePushCommands(): readonly (readonly string[])[] {
  return PRE_PUSH_COMMANDS;
}

if (import.meta.main) {
  if (process.env.SKIP_SUPATERM_PREPUSH === '1') {
    process.exit(0);
  }

  for (const command of getPrePushCommands()) {
    runCommand(command);
  }
}

function runCommand(command: readonly string[]): void {
  const result = spawnSync(command[0], command.slice(1), {
    stdio: 'inherit',
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
