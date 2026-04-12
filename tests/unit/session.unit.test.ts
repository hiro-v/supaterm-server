import { describe, expect, test } from 'bun:test';
import {
  buildSessionWebSocketUrl,
  decodeTerminalMessage,
  getServerMode,
  getSessionQuery,
} from '../../web/src/session';

describe('session helpers', () => {
  test('parses session and token from query string', () => {
    expect(getSessionQuery('?session=abc&token=xyz')).toEqual({
      sessionId: 'abc',
      token: 'xyz',
    });
  });

  test('defaults to live mode and recognizes demo mode', () => {
    expect(getServerMode('')).toBe('live');
    expect(getServerMode('?demo=1')).toBe('demo');
    expect(getServerMode('?demo=true')).toBe('demo');
  });

  test('builds websocket url with encoded session id and token', () => {
    const url = buildSessionWebSocketUrl(
      new URL('https://supaterm.dev/app') as unknown as Location,
      'shared/session:v1',
      'abc123',
      120,
      40,
    );
    expect(url).toBe(
      'wss://supaterm.dev/api/sessions/shared%2Fsession%3Av1/ws?cols=120&rows=40&token=abc123',
    );
  });

  test('decodes string, blob, and arraybuffer payloads', async () => {
    expect(await decodeTerminalMessage('hello')).toBe('hello');
    expect(await decodeTerminalMessage(new Blob(['world']))).toBe('world');
    expect(await decodeTerminalMessage(new TextEncoder().encode('zig').buffer)).toBe('zig');
  });
});
