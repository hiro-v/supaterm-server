import { beforeAll, afterAll, describe, expect, test } from 'bun:test';
import {
  computeSessionShareToken,
  fetchJson,
  startServer,
  type StartedServer,
} from '../helpers/runtime';

type SessionMetadata = {
  session_id: string;
  token_policy: string;
  token_required: boolean;
  websocket_path: string;
  share_authority: string;
  share_token_transport: string;
  share_api_enabled: boolean;
  share_api_path: string;
};

type ShareGrant = {
  session_id: string;
  websocket_path: string;
  token: string;
  token_transport: string;
  share_authority: string;
  expires_at_unix_ms: number | null;
};

type ShellCapabilities = {
  default_shell: string | null;
  shells: Array<{
    id: string;
    available: boolean;
    path: string | null;
  }>;
};

describe('session API contract', () => {
  const sessionId = 'contract.session:v1';
  const shareSecret = 'contract-secret';
  let server: StartedServer | null = null;

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

  test('metadata endpoint exposes the expected exact field set without token leakage', async () => {
    const { status, payload } = await fetchJson<SessionMetadata>(
      `${server!.baseUrl}/api/sessions/${encodeURIComponent(sessionId)}`,
    );

    expect(status).toBe(200);
    expect(Object.keys(payload).sort()).toEqual([
      'session_id',
      'share_api_enabled',
      'share_api_path',
      'share_authority',
      'share_token_transport',
      'token_policy',
      'token_required',
      'websocket_path',
    ]);
    expect(payload).toEqual({
      session_id: sessionId,
      token_policy: 'session',
      token_required: true,
      websocket_path: `/api/sessions/${sessionId}/ws`,
      share_authority: 'server',
      share_token_transport: 'query',
      share_api_enabled: true,
      share_api_path: `/api/sessions/${sessionId}/share`,
    });
  });

  test('share grant endpoint returns the deterministic session grant contract', async () => {
    const before = Date.now();
    const { status, payload } = await fetchJson<ShareGrant>(
      `${server!.baseUrl}/api/sessions/${encodeURIComponent(sessionId)}/share`,
    );
    const after = Date.now();

    expect(status).toBe(200);
    expect(Object.keys(payload).sort()).toEqual([
      'expires_at_unix_ms',
      'session_id',
      'share_authority',
      'token',
      'token_transport',
      'websocket_path',
    ]);
    expect(payload.session_id).toBe(sessionId);
    expect(payload.websocket_path).toBe(`/api/sessions/${sessionId}/ws`);
    expect(payload.token).toBe(computeSessionShareToken(sessionId, shareSecret));
    expect(payload.token_transport).toBe('query');
    expect(payload.share_authority).toBe('server');
    expect(payload.expires_at_unix_ms).not.toBeNull();
    expect(payload.expires_at_unix_ms!).toBeGreaterThanOrEqual(before + 3_590_000);
    expect(payload.expires_at_unix_ms!).toBeLessThanOrEqual(after + 3_600_000);
  });

  test('shell capability endpoint returns the expected host shell contract', async () => {
    const { status, payload } = await fetchJson<ShellCapabilities>(
      `${server!.baseUrl}/api/capabilities/shells`,
    );

    expect(status).toBe(200);
    expect(Object.keys(payload).sort()).toEqual([
      'default_shell',
      'shells',
    ]);
    expect(payload.shells.map((entry) => entry.id)).toEqual(['fish', 'zsh', 'bash', 'sh']);
    expect(payload.shells.every((entry) => typeof entry.available === 'boolean')).toBe(true);
  });
});
