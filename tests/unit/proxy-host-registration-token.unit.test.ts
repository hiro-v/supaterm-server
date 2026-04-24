import { describe, expect, test } from 'bun:test';
import {
  issueHostRegistrationToken,
  verifyHostRegistrationToken,
} from '../../proxy/src/auth/host-registration-token';

describe('proxy host registration tokens', () => {
  test('issues and verifies signed host registration tokens', async () => {
    const nowUnixMs = 1_700_000_000_000;
    const token = await issueHostRegistrationToken({
      aud: 'supaterm-share-relay',
      share_id: 'shr_1234',
      exp: nowUnixMs + 60_000,
      iat: nowUnixMs,
      sub: 'user:123',
    }, 'relay-secret');

    await expect(verifyHostRegistrationToken(token, 'relay-secret', nowUnixMs)).resolves.toEqual({
      aud: 'supaterm-share-relay',
      share_id: 'shr_1234',
      exp: nowUnixMs + 60_000,
      iat: nowUnixMs,
      sub: 'user:123',
    });
  });

  test('rejects expired or tampered tokens', async () => {
    const nowUnixMs = 1_700_000_000_000;
    const token = await issueHostRegistrationToken({
      aud: 'supaterm-share-relay',
      share_id: 'shr_1234',
      exp: nowUnixMs + 60_000,
      iat: nowUnixMs,
    }, 'relay-secret');

    await expect(verifyHostRegistrationToken(token, 'wrong-secret', nowUnixMs)).resolves.toBeNull();
    await expect(verifyHostRegistrationToken(`${token}x`, 'relay-secret', nowUnixMs)).resolves.toBeNull();
    await expect(verifyHostRegistrationToken(token, 'relay-secret', nowUnixMs + 60_001)).resolves.toBeNull();
  });
});
