import { describe, expect, test } from 'bun:test';
import {
  normalizeShareMode,
  normalizeTitle,
  resolveShareExpiresAtUnixMs,
} from '../../proxy/src/relay/share-metadata';

describe('proxy share metadata helpers', () => {
  test('normalizes share mode and title values', () => {
    expect(normalizeShareMode('view')).toBe('view');
    expect(normalizeShareMode('control')).toBe('control');
    expect(normalizeShareMode('bad')).toBe('control');

    expect(normalizeTitle(' Demo ')).toBe('Demo');
    expect(normalizeTitle('   ')).toBeNull();
    expect(normalizeTitle(null)).toBeUndefined();
  });

  test('caps relay expiry at 60 minutes by default', () => {
    const nowUnixMs = 1_000_000;
    expect(resolveShareExpiresAtUnixMs(null, {}, nowUnixMs)).toBe(nowUnixMs + 3_600_000);
    expect(resolveShareExpiresAtUnixMs(String(nowUnixMs + 300_000), {}, nowUnixMs)).toBe(nowUnixMs + 300_000);
    expect(resolveShareExpiresAtUnixMs(String(nowUnixMs + 7_200_000), {}, nowUnixMs)).toBe(nowUnixMs + 3_600_000);
    expect(resolveShareExpiresAtUnixMs('bad', {}, nowUnixMs)).toBe(nowUnixMs + 3_600_000);
  });

  test('honors an explicit relay expiry cap when configured', () => {
    const nowUnixMs = 1_000_000;
    expect(resolveShareExpiresAtUnixMs(String(nowUnixMs + 1_200_000), { MAX_SHARE_TTL_SECONDS: '900' }, nowUnixMs)).toBe(nowUnixMs + 900_000);
    expect(resolveShareExpiresAtUnixMs(null, { MAX_SHARE_TTL_SECONDS: '900' }, nowUnixMs)).toBe(nowUnixMs + 900_000);
  });
});
