import { describe, expect, test } from 'bun:test';
import { isAuthorizedHostRequest } from '../../proxy/src/config';

describe('proxy config helpers', () => {
  test('authorizes hosts with bearer token only', () => {
    const request = new Request('https://share.example.com/api/shares/demo/host?token=wrong', {
      headers: {
        Authorization: 'Bearer secret-token',
      },
    });

    expect(isAuthorizedHostRequest(request, { HOST_SHARED_SECRET: 'secret-token' })).toBe(true);
    expect(isAuthorizedHostRequest(request, { HOST_SHARED_SECRET: 'different' })).toBe(false);
    expect(isAuthorizedHostRequest(new Request(request.url), { HOST_SHARED_SECRET: 'secret-token' })).toBe(false);
  });
});
