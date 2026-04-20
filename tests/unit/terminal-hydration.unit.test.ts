import { describe, expect, test } from 'bun:test';
import { createTerminalHydrationStore } from '../../web/src/terminal-hydration';

describe('terminal hydration store', () => {
  test('buffers append writes and trims to max size', async () => {
    const storage = new Map<string, string>();
    const store = createTerminalHydrationStore({
      storage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => {
          storage.set(key, value);
        },
      },
      maxChars: 8,
    });

    store.append('session.a', '1234');
    store.append('session.a', '56789');
    expect(store.read('session.a')).toBe('23456789');

    await Promise.resolve();
    expect(storage.get('supaterm.web.term.v1:session.a')).toBe('23456789');
  });
});
