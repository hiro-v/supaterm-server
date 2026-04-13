import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  computeSessionShareToken,
  ensureZmxBuilt,
  fetchJson,
  openTerminalSession,
  startServer,
  type StartedServer,
} from '../helpers/runtime';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('zmx e2e', () => {
  const sessionId = 'e2e.zmx:v1';
  const shareSecret = 'e2e-secret';
  let server: StartedServer;
  let tmpDir = '';

  beforeAll(async () => {
    await ensureZmxBuilt();
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'supaterm-zmx-e2e-'));
    server = await startServer({
      backend: 'zmx',
      enableShareApi: true,
      tokenPolicy: 'session',
      shareTokenSecret: shareSecret,
      zmxSocketDir: tmpDir,
      env: { ZMX_DIR: tmpDir },
    });
  }, 30_000);

  afterAll(async () => {
    if (server) {
      await server.stop();
    }
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('runs a full zmx-backed shared terminal round-trip', async () => {
    const { payload } = await fetchJson<{ token: string }>(
      `${server.baseUrl}/api/sessions/${encodeURIComponent(sessionId)}/share`,
    );
    expect(payload.token).toBe(computeSessionShareToken(sessionId, shareSecret));

    const transcript = await openTerminalSession({
      port: server.port,
      sessionId,
      token: payload.token,
      command: "printf '__ZMX_E2E_OK__\\n'",
      timeoutMs: 20_000,
    });
    expect(transcript).toContain('__ZMX_E2E_OK__');
  });
});
