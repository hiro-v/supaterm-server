import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
      env: {
        SHELL: '/bin/sh',
      },
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

  test('reports supported interactive shells from the host capability surface', async () => {
    const response = await fetch(`${server.baseUrl}/api/capabilities/shells`);
    expect(response.status).toBe(200);
    const payload = await response.json() as {
      default_shell: string | null;
      shells: Array<{ id: string; available: boolean; path: string | null }>;
    };

    expect(payload.shells.map((entry) => entry.id)).toEqual(['fish', 'zsh', 'bash', 'sh']);
    expect(payload.shells.some((entry) => entry.id === 'sh' && entry.available)).toBe(true);
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
      command: "printf 'LOCAL_IDLE_OK\\n'",
      delayBeforeCommandMs: 750,
    });

    expect(transcript).toContain('LOCAL_IDLE_OK');
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
    expect(transcript).toContain('TERM_PROGRAM_VERSION=0.1.0');
    expect(transcript).toContain('CLICOLOR=1');
  }, 8_000);

  test('accepts an explicit shell selection when opening a pane session', async () => {
    const explicitSessionId = `${sessionId}.shell.sh`;
    const transcript = await openTerminalSession({
      port: server.port,
      sessionId: explicitSessionId,
      token: computeSessionShareToken(explicitSessionId, shareSecret),
      shell: 'sh',
      command: "printf '__SHELL_EXPLICIT_OK__\\n'",
    });

    expect(transcript).toContain('__SHELL_EXPLICIT_OK__');
  });

  test('uses fast shell startup by default but can opt into full shell init', async () => {
    const homeDir = mkdtempSync(path.join(os.tmpdir(), 'supaterm-shell-startup-'));
    writeFileSync(path.join(homeDir, '.bashrc'), "printf '__SUPATERM_BASHRC__\\n'\n");

    const fastServer = await startServer({
      backend: 'local',
      enableShareApi: true,
      tokenPolicy: 'session',
      shareTokenSecret: shareSecret,
      env: {
        HOME: homeDir,
        SHELL: '/bin/bash',
      },
    });

    const fullServer = await startServer({
      backend: 'local',
      enableShareApi: true,
      tokenPolicy: 'session',
      shareTokenSecret: shareSecret,
      extraArgs: ['--shell-startup', 'full'],
      env: {
        HOME: homeDir,
        SHELL: '/bin/bash',
      },
    });

    try {
      const fastSessionId = `${sessionId}.shell.fast`;
      const fastTranscript = await openTerminalSession({
        port: fastServer.port,
        sessionId: fastSessionId,
        token: computeSessionShareToken(fastSessionId, shareSecret),
        timeoutMs: 1_200,
        resolveOnTimeout: true,
      });

      const fullSessionId = `${sessionId}.shell.full`;
      const fullTranscript = await openTerminalSession({
        port: fullServer.port,
        sessionId: fullSessionId,
        token: computeSessionShareToken(fullSessionId, shareSecret),
        timeoutMs: 1_200,
        resolveOnTimeout: true,
      });

      expect(fastTranscript).not.toContain('__SUPATERM_BASHRC__');
      expect(fullTranscript).toContain('__SUPATERM_BASHRC__');
    } finally {
      await fastServer.stop();
      await fullServer.stop();
      rmSync(homeDir, { recursive: true, force: true });
    }
  }, 10_000);
});
