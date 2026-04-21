#!/usr/bin/env bun
import { spawn } from 'node:child_process';
import process from 'node:process';
import { ensureWebBuilt, startServer } from '../tests/helpers/runtime';

await ensureWebBuilt();
const server = await startServer({
  backend: 'local',
  enableShareApi: true,
  tokenPolicy: 'open',
  env: {
    SHELL: '/bin/sh',
  },
});

try {
  const shard = process.env.SUPATERM_PLAYWRIGHT_SHARD;
  const args = [
    'playwright',
    'test',
    'tests/browser',
    '--reporter=line',
    '--workers',
    process.env.SUPATERM_BROWSER_WORKERS ?? '1',
  ];
  if (shard) {
    args.push('--shard', shard);
  }

  const child = spawn(
    'bunx',
    args,
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        SUPATERM_BASE_URL: server.baseUrl,
      },
    },
  );

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`browser test process terminated with signal ${signal}`));
        return;
      }
      resolve(code ?? 1);
    });
  });

  process.exit(exitCode);
} finally {
  await server.stop();
}
