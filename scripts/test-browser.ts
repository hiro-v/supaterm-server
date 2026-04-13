#!/usr/bin/env bun
import { spawn } from 'node:child_process';
import process from 'node:process';
import { startServer } from '../tests/helpers/runtime';

const server = await startServer({
  backend: 'local',
  enableShareApi: true,
  tokenPolicy: 'open',
});

try {
  const child = spawn(
    'bunx',
    ['playwright', 'test', 'tests/browser/workbench.browser.spec.ts', '--reporter=line'],
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
