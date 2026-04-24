import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { spawn, type ChildProcess } from 'node:child_process';

const root = process.cwd();
const proxyRoot = path.join(root, 'proxy');

export type StartedProxy = {
  port: number;
  baseUrl: string;
  child: ChildProcess;
  stdout: () => string;
  stderr: () => string;
  stop: () => Promise<void>;
};

export async function startProxy(): Promise<StartedProxy> {
  const port = await reservePort();
  const args = [
    'x',
    'wrangler',
    'dev',
    '--config',
    'wrangler.jsonc',
    '--ip',
    '127.0.0.1',
    '--port',
    String(port),
    '--local',
    '--log-level',
    'error',
  ];

  const child = spawn('bun', args, {
    cwd: proxyRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });

  let stdout = '';
  let stderr = '';
  let exited = false;

  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });
  child.on('exit', () => {
    exited = true;
  });

  await waitForProxyHealth(port, () => exited, () => stderr);

  return {
    port,
    baseUrl: `http://127.0.0.1:${port}`,
    child,
    stdout: () => stdout,
    stderr: () => stderr,
    stop: async () => {
      child.kill('SIGTERM');
      await waitForExit(child);
    },
  };
}

async function reservePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('failed to reserve proxy port'));
        return;
      }
      const { port } = address;
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(port);
      });
    });
    server.on('error', reject);
  });
}

async function waitForProxyHealth(
  port: number,
  exited: () => boolean,
  stderr: () => string,
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 20_000) {
    if (exited()) {
      throw new Error(`proxy exited before health check\n${stderr()}`);
    }

    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return;
    } catch {}

    await Bun.sleep(100);
  }

  throw new Error(`proxy health check timed out\n${stderr()}`);
}

async function waitForExit(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, 2_000);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}
