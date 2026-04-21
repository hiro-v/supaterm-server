import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  computeSessionShareToken,
  fetchJson,
  startServer,
  type StartedServer,
} from '../helpers/runtime';
import { startProxy, type StartedProxy } from '../helpers/proxy-runtime';
import { openRelayGuestSession, startRelayBridge, type StartedRelayBridge } from '../helpers/proxy-relay';
import { isOpaqueShareId } from '../../proxy/src/bridge/share-id';

describe('proxy relay e2e', () => {
  const sessionId = 'e2e.proxy-relay:v1';
  const shareSecret = 'proxy-relay-secret';
  let server: StartedServer | null = null;
  let proxy: StartedProxy | null = null;
  let bridge: StartedRelayBridge | null = null;

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
    proxy = await startProxy();
  }, 30_000);

  afterAll(async () => {
    await bridge?.stop();
    await proxy?.stop();
    await server?.stop();
  });

  test('returns 404 early for a share that does not exist', async () => {
    const response = await fetch(`${proxy!.baseUrl}/api/shares/${encodeURIComponent('missing.proxy-relay:v1')}`);
    expect(response.status).toBe(404);
  });

  test('bridges an authenticated Supaterm session through the Cloudflare relay', async () => {
    const shareGrant = await fetchJson<{
      session_id: string;
      token: string;
      expires_at_unix_ms: number | null;
    }>(`${server!.baseUrl}/api/sessions/${encodeURIComponent(sessionId)}/share`);

    expect(shareGrant.status).toBe(200);
    expect(shareGrant.payload.session_id).toBe(sessionId);
    expect(shareGrant.payload.token).toBe(computeSessionShareToken(sessionId, shareSecret));

    bridge = await startRelayBridge({
      serverBaseUrl: server!.baseUrl,
      sessionId,
      token: shareGrant.payload.token,
      relayBaseUrl: proxy!.baseUrl,
      title: 'Proxy E2E',
      mode: 'control',
      expiresAtUnixMs: shareGrant.payload.expires_at_unix_ms,
    });

    expect(isOpaqueShareId(bridge.shareId)).toBe(true);
    expect(bridge.shareId).not.toBe(sessionId);

    const relayMetadata = await fetchJson<{
      share_id: string;
      title: string | null;
      mode: string;
      host_connected: boolean;
      guest_count: number;
      expires_at_unix_ms: number | null;
      guest_websocket_path: string;
    }>(`${proxy!.baseUrl}/api/shares/${encodeURIComponent(bridge.shareId)}`);

    expect(relayMetadata.status).toBe(200);
    expect(relayMetadata.payload.share_id).toBe(bridge.shareId);
    expect(relayMetadata.payload.title).toBe('Proxy E2E');
    expect(relayMetadata.payload.mode).toBe('control');
    expect(relayMetadata.payload.host_connected).toBe(true);
    expect(relayMetadata.payload.guest_count).toBe(0);
    expect(relayMetadata.payload.guest_websocket_path).toBe(
      `/api/shares/${encodeURIComponent(bridge.shareId)}/guest`,
    );
    expect(relayMetadata.payload.expires_at_unix_ms).not.toBeNull();
    expect(relayMetadata.payload.expires_at_unix_ms!).toBe(shareGrant.payload.expires_at_unix_ms);

    const transcript = await openRelayGuestSession({
      relayBaseUrl: proxy!.baseUrl,
      shareId: bridge.shareId,
      command: "printf '__PROXY_RELAY_E2E_OK__\\n'",
      timeoutMs: 20_000,
    });

    expect(transcript).toContain('__PROXY_RELAY_E2E_OK__');
  }, 30_000);
});
