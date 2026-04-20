import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { mkdtempSync, rmSync } from 'node:fs';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { parseSessionControlMessage, type SessionAttachTrace } from '../../web/src/session';

const root = process.cwd();
const serverBinary = path.join(root, 'zig-out', 'bin', 'supaterm-server');
const zmxBinary = path.join(root, 'third_party', 'zmx', 'zig-out', 'bin', 'zmx');

let serverBuildPromise: Promise<void> | null = null;
let webBuildPromise: Promise<void> | null = null;
let zmxBuildPromise: Promise<void> | null = null;

export type StartedServer = {
  port: number;
  baseUrl: string;
  child: ChildProcess;
  stdout: () => string;
  stderr: () => string;
  stop: () => Promise<void>;
};

export type StartServerOptions = {
  backend?: 'local' | 'zmx';
  enableShareApi?: boolean;
  tokenPolicy?: 'open' | 'global' | 'session';
  accessToken?: string;
  shareTokenSecret?: string;
  sqlitePath?: string;
  zmxSocketDir?: string;
  extraArgs?: string[];
  env?: NodeJS.ProcessEnv;
};

export function computeSessionShareToken(sessionId: string, secret: string): string {
  return createHmac('sha256', secret).update(sessionId).digest('hex');
}

export async function ensureServerBuilt(): Promise<void> {
  serverBuildPromise ??= Promise.resolve().then(() => {
    runChecked(['zig', 'build'], root);
  });
  await serverBuildPromise;
}

export async function ensureWebBuilt(): Promise<void> {
  webBuildPromise ??= Promise.resolve().then(() => {
    runChecked(['bun', 'run', 'web:build'], root);
  });
  await webBuildPromise;
}

export async function ensureZmxBuilt(): Promise<void> {
  zmxBuildPromise ??= Promise.resolve().then(() => {
    runChecked(['zig', 'build', '-Doptimize=ReleaseSafe'], path.join(root, 'third_party', 'zmx'));
  });
  await zmxBuildPromise;
}

export async function startServer(options: StartServerOptions = {}): Promise<StartedServer> {
  await ensureServerBuilt();

  const port = await reservePort();
  const tempDir = options.sqlitePath == null
    ? mkdtempSync(path.join(os.tmpdir(), 'supaterm-server-runtime-'))
    : null;
  const sqlitePath = options.sqlitePath ?? path.join(tempDir!, 'supaterm-server.sqlite3');
  const args = [
    '--listen',
    `127.0.0.1:${port}`,
    '--backend',
    options.backend ?? 'local',
    '--sqlite-path',
    sqlitePath,
  ];

  if (options.enableShareApi) args.push('--enable-share-api');
  if (options.tokenPolicy) args.push('--token-policy', options.tokenPolicy);
  if (options.accessToken) args.push('--access-token', options.accessToken);
  if (options.shareTokenSecret) args.push('--share-token-secret', options.shareTokenSecret);
  if (options.backend === 'zmx') {
    args.push('--zmx-binary', zmxBinary);
    if (options.zmxSocketDir) args.push('--zmx-socket-dir', options.zmxSocketDir);
  }
  if (options.extraArgs) args.push(...options.extraArgs);

  const child = spawn(serverBinary, args, {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      ...options.env,
    },
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

  await waitForHealth(
    port,
    () => exited,
    () => stderr,
  );

  return {
    port,
    baseUrl: `http://127.0.0.1:${port}`,
    child,
    stdout: () => stdout,
    stderr: () => stderr,
    stop: async () => {
      child.kill('SIGTERM');
      await waitForExit(child);
      if (tempDir) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    },
  };
}

export async function withTempZmxDir<T>(fn: (tmpDir: string) => Promise<T>): Promise<T> {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'supaterm-zmx-test-'));
  try {
    return await fn(tmpDir);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

export async function fetchJson<T>(url: string): Promise<{ status: number; payload: T }> {
  const response = await fetch(url);
  const payload = await response.json() as T;
  return { status: response.status, payload };
}

export async function openTerminalSession(options: {
  port: number;
  sessionId: string;
  token?: string | null;
  command?: string;
  completionMarker?: string;
  startupCommand?: string;
  timeoutMs?: number;
  delayBeforeCommandMs?: number;
  resolveOnTimeout?: boolean;
}): Promise<string> {
  const result = await openTerminalSessionWithTrace(options);
  return result.transcript;
}

export async function openTerminalSessionWithTrace(options: {
  port: number;
  sessionId: string;
  token?: string | null;
  command?: string;
  completionMarker?: string;
  startupCommand?: string;
  timeoutMs?: number;
  delayBeforeCommandMs?: number;
  resolveOnTimeout?: boolean;
}): Promise<{ transcript: string; attachTrace: SessionAttachTrace | null }> {
  const query = new URLSearchParams({
    cols: '80',
    rows: '24',
  });
  if (options.token) query.set('token', options.token);
  if (options.startupCommand) query.set('command', options.startupCommand);

  return await new Promise((resolve, reject) => {
    const ws = new WebSocket(
      `ws://127.0.0.1:${options.port}/api/sessions/${encodeURIComponent(options.sessionId)}/ws?${query.toString()}`,
    );
    ws.binaryType = 'arraybuffer';

    const decoder = new TextDecoder();
    let transcript = '';
    let attachTrace: SessionAttachTrace | null = null;
    let settled = false;
    const marker = options.completionMarker ?? '__SUPATERM_TEST_DONE__';
    const timeout = setTimeout(() => {
      if (options.resolveOnTimeout || (options.startupCommand && !options.command)) {
        done(() => resolve({ transcript, attachTrace }));
        return;
      }
      done(() => reject(new Error(`websocket test timed out\n${transcript}`)));
    }, options.timeoutMs ?? 15_000);

    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try {
        ws.close();
      } catch {}
      fn();
    };

    ws.addEventListener('open', () => {
      if (!options.command) {
        return;
      }
      const sendCommand = () => {
        // Clear any partially-edited shell line and interrupt any transient shell mode
        // before sending scripted input.
        ws.send(`\u0003\u0015${options.command}; printf '${marker}\\n'\r`);
      };
      const delayMs = options.delayBeforeCommandMs ?? 0;
      if (delayMs > 0) {
        setTimeout(sendCommand, delayMs);
      } else {
        sendCommand();
      }
    });

    ws.addEventListener('message', (event) => {
      const decoded = decodeMessage(event.data, decoder);
      const control = parseSessionControlMessage(decoded);
      if (control) {
        if (control.type === 'supaterm.attach-trace') {
          attachTrace = control;
        }
        return;
      }
      transcript += decoded;
      if (transcript.includes(marker)) {
        done(() => resolve({ transcript, attachTrace }));
      }
    });

    ws.addEventListener('error', () => {
      done(() => reject(new Error(`websocket error\n${transcript}`)));
    });

    ws.addEventListener('close', () => {
      if (!settled) {
        if (options.startupCommand && !options.command) {
          done(() => resolve({ transcript, attachTrace }));
          return;
        }
        done(() => reject(new Error(`websocket closed early\n${transcript}`)));
      }
    });
  });
}

export function runChecked(command: string[], cwd: string) {
  const [bin, ...args] = command;
  const child = spawnSync(bin, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (child.status !== 0) {
    throw new Error(
      `${command.join(' ')} failed in ${cwd}\nstdout:\n${child.stdout ?? ''}\nstderr:\n${child.stderr ?? ''}`,
    );
  }
}

async function reservePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('failed to reserve port'));
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

async function waitForHealth(
  port: number,
  exited: () => boolean,
  stderr: () => string,
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 15_000) {
    if (exited()) {
      throw new Error(`supaterm-server exited before health check\n${stderr()}`);
    }

    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return;
    } catch {}

    await sleep(100);
  }

  throw new Error(`health check timed out\n${stderr()}`);
}

async function waitForExit(child: ChildProcess) {
  if (child.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, 2_000);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

function decodeMessage(data: unknown, decoder: TextDecoder): string {
  if (typeof data === 'string') return data;
  if (data instanceof ArrayBuffer) return decoder.decode(data);
  if (ArrayBuffer.isView(data)) return decoder.decode(data);
  return '';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { root, zmxBinary };
