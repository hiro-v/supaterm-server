import {
  createInitialWorkbenchState,
  normalizeWorkbenchState,
  type WorkbenchState,
} from './state';

export type WorkbenchStorage = Pick<Storage, 'getItem' | 'setItem'>;

export type WorkbenchPersistence = {
  load(seedSessionId: string | null): WorkbenchState;
  persist(state: WorkbenchState): void;
};

type WorkbenchPersistenceOptions = {
  storage: WorkbenchStorage;
  storageKey?: string;
};

export function createWorkbenchPersistence(
  options: WorkbenchPersistenceOptions,
): WorkbenchPersistence {
  const storageKey = options.storageKey ?? 'supaterm.web.workbench.v4';
  let pendingSerializedState: string | null = null;
  let persistScheduled = false;

  return {
    load(seedSessionId) {
      const saved = options.storage.getItem(storageKey);
      if (!saved) {
        return createInitialWorkbenchState(seedSessionId);
      }

      try {
        return normalizeWorkbenchState(
          JSON.parse(saved) as Partial<WorkbenchState>,
          seedSessionId,
        );
      } catch {
        return createInitialWorkbenchState(seedSessionId);
      }
    },

    persist(state) {
      pendingSerializedState = JSON.stringify(state);
      if (persistScheduled) return;
      persistScheduled = true;
      queueMicrotask(() => {
        persistScheduled = false;
        if (pendingSerializedState == null) return;
        options.storage.setItem(storageKey, pendingSerializedState);
        pendingSerializedState = null;
      });
    },
  };
}

export function createLocalStorageWorkbenchPersistence(): WorkbenchPersistence {
  return createWorkbenchPersistence({
    storage: window.localStorage,
  });
}
