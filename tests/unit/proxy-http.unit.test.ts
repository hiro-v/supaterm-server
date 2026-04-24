import { describe, expect, test } from 'bun:test';
import {
  canonicalizeShareId,
  isWebSocketUpgrade,
  parseProxyRoute,
} from '../../proxy/src/http';

describe('proxy HTTP helpers', () => {
  test('canonicalizes and validates share ids', () => {
    expect(canonicalizeShareId('demo.session:v1')).toBe('demo.session:v1');
    expect(canonicalizeShareId('demo%3Asession')).toBe('demo:session');
    expect(canonicalizeShareId('bad/id')).toBeNull();
    expect(canonicalizeShareId('%ZZ')).toBeNull();
  });

  test('parses public proxy routes', () => {
    expect(parseProxyRoute('GET', new URL('https://share.example.com/health'))).toEqual({
      kind: 'health',
    });
    expect(parseProxyRoute('GET', new URL('https://share.example.com/api/shares/demo'))).toEqual({
      kind: 'share-meta',
      shareId: 'demo',
    });
    expect(parseProxyRoute('GET', new URL('https://share.example.com/api/shares/demo/host'))).toEqual({
      kind: 'host-websocket',
      shareId: 'demo',
    });
    expect(parseProxyRoute('GET', new URL('https://share.example.com/api/shares/demo/guest'))).toEqual({
      kind: 'guest-websocket',
      shareId: 'demo',
    });
    expect(parseProxyRoute('POST', new URL('https://share.example.com/api/shares/demo'))).toEqual({
      kind: 'not-found',
    });
  });

  test('detects websocket upgrades and bearer tokens', () => {
    const upgrade = {
      headers: new Headers({
        Upgrade: 'websocket',
      }),
    } as Request;

    const plain = {
      headers: new Headers(),
    } as Request;

    expect(isWebSocketUpgrade(upgrade)).toBe(true);
    expect(isWebSocketUpgrade(plain)).toBe(false);
  });
});
