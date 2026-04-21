export type TerminalHydrationStore = {
  read(sessionId: string): string | null;
  append(sessionId: string, text: string): void;
};

export type TerminalHydrationStorage = Pick<Storage, 'getItem' | 'setItem'>;

type CreateTerminalHydrationStoreOptions = {
  storage: TerminalHydrationStorage;
  keyPrefix?: string;
  maxChars?: number;
};

export function createTerminalHydrationStore(
  options: CreateTerminalHydrationStoreOptions,
): TerminalHydrationStore {
  const keyPrefix = options.keyPrefix ?? 'supaterm.web.term.v1';
  const maxChars = options.maxChars ?? 64 * 1024;
  const pendingBySession = new Map<string, string>();
  let flushScheduled = false;

  const flush = () => {
    flushScheduled = false;
    for (const [sessionId, pending] of pendingBySession.entries()) {
      const storageKey = buildStorageKey(keyPrefix, sessionId);
      const existing = options.storage.getItem(storageKey) ?? '';
      const next = trimToMaxChars(`${existing}${pending}`, maxChars);
      options.storage.setItem(storageKey, next);
    }
    pendingBySession.clear();
  };

  return {
    read(sessionId) {
      const pending = pendingBySession.get(sessionId) ?? '';
      const stored = options.storage.getItem(buildStorageKey(keyPrefix, sessionId)) ?? '';
      const value = `${stored}${pending}`;
      return value.length > 0 ? trimToMaxChars(value, maxChars) : null;
    },

    append(sessionId, text) {
      if (text.length === 0) return;
      pendingBySession.set(sessionId, `${pendingBySession.get(sessionId) ?? ''}${text}`);
      if (flushScheduled) return;
      flushScheduled = true;
      queueMicrotask(flush);
    },
  };
}

export function createLocalStorageTerminalHydrationStore(): TerminalHydrationStore {
  return createTerminalHydrationStore({
    storage: window.localStorage,
  });
}

function buildStorageKey(prefix: string, sessionId: string): string {
  return `${prefix}:${sessionId}`;
}

function trimToMaxChars(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return value.slice(value.length - maxChars);
}
