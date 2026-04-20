import {
  buildAuthorizedHeaders,
  buildServerApiUrl,
} from '../session';
import {
  createInitialWorkbenchState,
  normalizeWorkbenchState,
  type WorkbenchState,
} from './state';

export type WorkbenchStorage = Pick<Storage, 'getItem' | 'setItem'>;

export type WorkbenchPersistenceIdentity = {
  workbenchId: string | null;
  token: string | null;
};

type WorkbenchSnapshotResponse = {
  workbench_id: string;
  updated_at_unix_ms: number;
  state: Partial<WorkbenchState>;
};

type RemoteSnapshotClient = {
  hydrate(identity: WorkbenchPersistenceIdentity): Promise<WorkbenchState | null>;
  persist(identity: WorkbenchPersistenceIdentity, state: WorkbenchState): Promise<void>;
};

export type WorkbenchPersistence = {
  load(seedSessionId: string | null): WorkbenchState;
  hydrate(identity: WorkbenchPersistenceIdentity): Promise<WorkbenchState | null>;
  persist(state: WorkbenchState, identity?: WorkbenchPersistenceIdentity): void;
};

type WorkbenchPersistenceOptions = {
  storage: WorkbenchStorage;
  storageKeyPrefix?: string;
  remoteClient?: RemoteSnapshotClient;
};

type ServerWorkbenchPersistenceOptions = {
  storage?: WorkbenchStorage;
  storageKeyPrefix?: string;
  currentLocation?: Location;
  fetchImpl?: typeof fetch;
};

export function createWorkbenchPersistence(
  options: WorkbenchPersistenceOptions,
): WorkbenchPersistence {
  const storageKeyPrefix = options.storageKeyPrefix ?? 'supaterm.web.workbench.v5';
  let pendingSerializedState: string | null = null;
  let pendingIdentity: WorkbenchPersistenceIdentity | null = null;
  let persistScheduled = false;

  return {
    load(seedSessionId) {
      const saved = options.storage.getItem(storageKeyFor(storageKeyPrefix, seedSessionId));
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

    async hydrate(identity) {
      if (!options.remoteClient) {
        return null;
      }
      const hydrated = await options.remoteClient.hydrate(identity);
      if (!hydrated) {
        return null;
      }
      options.storage.setItem(
        storageKeyFor(storageKeyPrefix, identity.workbenchId),
        JSON.stringify(hydrated),
      );
      return hydrated;
    },

    persist(state, identity) {
      pendingSerializedState = JSON.stringify(state);
      pendingIdentity = identity ?? null;
      if (persistScheduled) return;
      persistScheduled = true;
      queueMicrotask(() => {
        persistScheduled = false;
        if (pendingSerializedState == null) return;

        const flushIdentity = pendingIdentity;
        const serialized = pendingSerializedState;
        pendingSerializedState = null;
        pendingIdentity = null;

        options.storage.setItem(
          storageKeyFor(storageKeyPrefix, flushIdentity?.workbenchId ?? null),
          serialized,
        );

        if (!options.remoteClient || !flushIdentity) {
          return;
        }

        const parsed = JSON.parse(serialized) as WorkbenchState;
        void options.remoteClient.persist(flushIdentity, parsed).catch(() => {
          // Keep local cache authoritative for offline/error cases until a later write succeeds.
        });
      });
    },
  };
}

export function createLocalStorageWorkbenchPersistence(): WorkbenchPersistence {
  return createWorkbenchPersistence({
    storage: window.localStorage,
  });
}

export function createServerWorkbenchPersistence(
  options: ServerWorkbenchPersistenceOptions = {},
): WorkbenchPersistence {
  const currentLocation = options.currentLocation ?? window.location;
  const fetchImpl = options.fetchImpl ?? window.fetch.bind(window);

  return createWorkbenchPersistence({
    storage: options.storage ?? window.localStorage,
    storageKeyPrefix: options.storageKeyPrefix,
    remoteClient: createRemoteSnapshotClient({
      currentLocation,
      fetchImpl,
    }),
  });
}

function createRemoteSnapshotClient(options: {
  currentLocation: Location;
  fetchImpl: typeof fetch;
}): RemoteSnapshotClient {
  return {
    async hydrate(identity) {
      const response = await options.fetchImpl(
        buildServerApiUrl(
          options.currentLocation,
          `/api/workbench/${encodeURIComponent(normalizeWorkbenchId(identity.workbenchId))}`,
        ),
        {
          headers: buildAuthorizedHeaders(identity.token),
        },
      );

      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new Error(`Failed to load workbench snapshot (${response.status})`);
      }

      const payload = await response.json() as WorkbenchSnapshotResponse;
      return normalizeWorkbenchState(payload.state, identity.workbenchId);
    },

    async persist(identity, state) {
      const response = await options.fetchImpl(
        buildServerApiUrl(
          options.currentLocation,
          `/api/workbench/${encodeURIComponent(normalizeWorkbenchId(identity.workbenchId))}`,
        ),
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(buildAuthorizedHeaders(identity.token) ?? {}),
          },
          body: JSON.stringify(state),
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to persist workbench snapshot (${response.status})`);
      }
    },
  };
}

function storageKeyFor(prefix: string, workbenchId: string | null): string {
  return `${prefix}:${normalizeWorkbenchId(workbenchId)}`;
}

function normalizeWorkbenchId(workbenchId: string | null): string {
  const trimmed = workbenchId?.trim();
  if (!trimmed) return 'default';
  return trimmed;
}
