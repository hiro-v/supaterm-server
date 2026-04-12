#!/usr/bin/env bun
import { computeSessionShareToken, ensureZmxBuilt, fetchJson, openTerminalSession, startServer } from '../tests/helpers/runtime';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const sessionId = 'smoke-session.v1';
const shareSecret = 'smoke-secret';
const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'supaterm-zmx-smoke-'));

try {
  await ensureZmxBuilt();

  const server = await startServer({
    backend: 'zmx',
    enableShareApi: true,
    tokenPolicy: 'session',
    shareTokenSecret: shareSecret,
    zmxSocketDir: tmpDir,
    env: { ZMX_DIR: tmpDir },
  });

  try {
    const { payload: metadata } = await fetchJson<{
      session_id: string;
      token_policy: string;
      token_required: boolean;
      websocket_path: string;
      share_authority: string;
      share_token_transport: string;
      share_api_enabled: boolean;
      share_api_path: string;
    }>(`${server.baseUrl}/api/sessions/${encodeURIComponent(sessionId)}`);

    if (metadata.session_id !== sessionId) throw new Error(`unexpected session_id ${metadata.session_id}`);
    if (metadata.token_policy !== 'session' || metadata.token_required !== true) {
      throw new Error(`unexpected metadata ${JSON.stringify(metadata)}`);
    }

    const { payload: grant } = await fetchJson<{
      token: string;
      websocket_path: string;
    }>(`${server.baseUrl}/api/sessions/${encodeURIComponent(sessionId)}/share`);

    const expectedToken = computeSessionShareToken(sessionId, shareSecret);
    if (grant.token !== expectedToken) throw new Error(`unexpected share token ${grant.token}`);
    if (grant.websocket_path !== `/api/sessions/${sessionId}/ws`) {
      throw new Error(`unexpected websocket_path ${grant.websocket_path}`);
    }

    const transcript = await openTerminalSession({
      port: server.port,
      sessionId,
      token: grant.token,
      command: "printf '__SUPATERM_ZMX_OK__\\n'",
      timeoutMs: 20_000,
    });
    if (!transcript.includes('__SUPATERM_ZMX_OK__')) {
      throw new Error(`marker not observed\n${transcript}`);
    }

    console.log('zmx smoke ok');
  } finally {
    await server.stop();
  }
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}
