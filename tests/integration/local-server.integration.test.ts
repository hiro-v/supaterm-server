import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  computeSessionShareToken,
  openTerminalSession,
  startServer,
  type StartedServer,
} from '../helpers/runtime';

describe('local backend integration', () => {
  const sessionId = 'integration.local:v1';
  const shareSecret = 'integration-secret';
  let server: StartedServer;

  beforeAll(async () => {
    server = await startServer({
      backend: 'local',
      enableShareApi: true,
      tokenPolicy: 'session',
      shareTokenSecret: shareSecret,
    });
  });

  afterAll(async () => {
    await server.stop();
  });

  test('health endpoint is live and share endpoint is enabled', async () => {
    const health = await fetch(`${server.baseUrl}/health`);
    expect(health.status).toBe(200);

    const share = await fetch(`${server.baseUrl}/api/sessions/${encodeURIComponent(sessionId)}/share`);
    expect(share.status).toBe(200);
  });

  test('rejects invalid session ids at the metadata boundary', async () => {
    const response = await fetch(`${server.baseUrl}/api/sessions/bad%2Fid`);
    expect(response.status).toBe(400);
    expect(await response.text()).toContain('Invalid session id');
  });

  test('opens a local terminal session and streams command output over websocket', async () => {
    const token = computeSessionShareToken(sessionId, shareSecret);
    const transcript = await openTerminalSession({
      port: server.port,
      sessionId,
      token,
      command: "printf '__LOCAL_INTEGRATION_OK__\\n'",
    });

    expect(transcript).toContain('__LOCAL_INTEGRATION_OK__');
  });

  test('keeps the local terminal interactive after the initial prompt goes idle', async () => {
    const idleSessionId = `${sessionId}.idle`;
    const transcript = await openTerminalSession({
      port: server.port,
      sessionId: idleSessionId,
      token: computeSessionShareToken(idleSessionId, shareSecret),
      command: "printf '__LOCAL_IDLE_OK__\\n'",
      delayBeforeCommandMs: 750,
    });

    expect(transcript).toContain('__LOCAL_IDLE_OK__');
  });

  test('spawns shells with a real color terminal environment', async () => {
    const envSessionId = `${sessionId}.env`;
    const transcript = await openTerminalSession({
      port: server.port,
      sessionId: envSessionId,
      token: computeSessionShareToken(envSessionId, shareSecret),
      startupCommand: "env",
      timeoutMs: 7000,
    });

    expect(transcript).toContain('TERM=xterm-256color');
    expect(transcript).toContain('COLORTERM=truecolor');
    expect(transcript).toContain('TERM_PROGRAM=supaterm-web');
  }, 8_000);
});
