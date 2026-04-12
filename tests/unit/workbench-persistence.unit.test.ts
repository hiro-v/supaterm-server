import { describe, expect, test } from 'bun:test';
import { createWorkbenchPersistence } from '../../web/src/workbench/persistence';
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
      storageKey: 'test.workbench',
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
      storageKey: 'test.workbench',
    });

    const state = createInitialWorkbenchState(null);
    state.sidebarCollapsed = true;

    persistence.persist(state);
    persistence.persist(state);
    await Promise.resolve();

    const saved = storage.get('test.workbench');
    expect(saved).toBeDefined();
    expect(JSON.parse(saved!).sidebarCollapsed).toBe(true);

    const loaded = persistence.load(null);
    expect(loaded.sidebarCollapsed).toBe(true);
  });
});
