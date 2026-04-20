import { describe, expect, test } from 'bun:test';
import { createWorkbenchPersistence, createServerWorkbenchPersistence } from '../../web/src/workbench/persistence';
import { createInitialWorkbenchState } from '../../web/src/workbench/state';

describe('workbench persistence', () => {
  test('loads initial state when storage is empty', () => {
    const storage = new Map<string, string>();
    const persistence = createWorkbenchPersistence({
      storage: {
        getItem(key) {
          return storage.get(key) ?? null;
        },
        setItem(key, value) {
          storage.set(key, value);
        },
      },
      storageKeyPrefix: 'test.workbench',
    });

    const state = persistence.load('seed');
    expect(state.workspaces).toHaveLength(1);
    expect(state.workspaces[0]?.name).toBe('Main');
  });

  test('coalesces writes and restores stored state', async () => {
    const storage = new Map<string, string>();
    const persistence = createWorkbenchPersistence({
      storage: {
        getItem(key) {
          return storage.get(key) ?? null;
        },
        setItem(key, value) {
          storage.set(key, value);
        },
      },
      storageKeyPrefix: 'test.workbench',
    });

    const state = createInitialWorkbenchState(null);
    state.sidebarCollapsed = true;

    persistence.persist(state);
    persistence.persist(state);
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    const saved = storage.get('test.workbench:default');
    expect(saved).toBeDefined();
    expect(JSON.parse(saved!).sidebarCollapsed).toBe(true);

    const loaded = persistence.load(null);
    expect(loaded.sidebarCollapsed).toBe(true);
  });

  test('hydrates from the remote snapshot client and caches the result locally', async () => {
    const storage = new Map<string, string>();
    const state = createInitialWorkbenchState('shared');
    state.workspaces[0]!.name = 'Shared';

    const persistence = createServerWorkbenchPersistence({
      storage: {
        getItem(key) {
          return storage.get(key) ?? null;
        },
        setItem(key, value) {
          storage.set(key, value);
        },
      },
      storageKeyPrefix: 'test.remote',
      currentLocation: {
        protocol: 'http:',
        host: '127.0.0.1:3000',
      } as Location,
      fetchImpl: (async () => new Response(JSON.stringify({
        workbench_id: 'shared',
        updated_at_unix_ms: 123,
        state,
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      })) as typeof fetch,
    });

    const hydrated = await persistence.hydrate({
      workbenchId: 'shared',
      token: null,
    });

    expect(hydrated).not.toBeNull();
    expect(hydrated?.workspaces[0]?.name).toBe('Shared');
    expect(storage.get('test.remote:shared')).toBeDefined();
  });
});
