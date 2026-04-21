import { describe, expect, test } from 'bun:test';
import { generateShareId, isOpaqueShareId } from '../../proxy/src/bridge/share-id';

describe('proxy share id helpers', () => {
  test('generates opaque share ids', () => {
    const shareId = generateShareId();

    expect(isOpaqueShareId(shareId)).toBe(true);
    expect(shareId.startsWith('shr_')).toBe(true);
    expect(shareId).toHaveLength(36);
  });

  test('rejects non-opaque identifiers', () => {
    expect(isOpaqueShareId('session-1')).toBe(false);
    expect(isOpaqueShareId('shr_short')).toBe(false);
  });
});
