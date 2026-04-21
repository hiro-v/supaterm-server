import type { ProxyEnv } from '../config';

const DEFAULT_MAX_SHARE_TTL_SECONDS = 3_600;
const SHARE_METADATA_KEY = 'share-metadata:v1';

export type ShareMode = 'view' | 'control';

export type ShareMetadata = {
  shareId: string;
  title: string | null;
  mode: ShareMode;
  expiresAtUnixMs: number | null;
};

export function normalizeShareMode(raw: string | null | undefined): ShareMode {
  return raw === 'view' ? 'view' : 'control';
}

export function resolveShareExpiresAtUnixMs(
  raw: string | null,
  env: Pick<ProxyEnv, 'MAX_SHARE_TTL_SECONDS'>,
  nowUnixMs = Date.now(),
): number {
  const maxTtlSeconds = parsePositiveInt(env.MAX_SHARE_TTL_SECONDS, DEFAULT_MAX_SHARE_TTL_SECONDS);
  const maxExpiresAtUnixMs = nowUnixMs + maxTtlSeconds * 1000;
  const parsed = raw == null ? Number.NaN : Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return maxExpiresAtUnixMs;
  return Math.min(Math.max(Math.trunc(parsed), nowUnixMs), maxExpiresAtUnixMs);
}

export function normalizeTitle(raw: string | null): string | null | undefined {
  if (raw == null) return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function isExpired(metadata: ShareMetadata): boolean {
  return metadata.expiresAtUnixMs != null && metadata.expiresAtUnixMs <= Date.now();
}

export async function getShareMetadata(storage: DurableObjectStorage): Promise<ShareMetadata | null> {
  return (await storage.get<ShareMetadata>(SHARE_METADATA_KEY)) ?? null;
}

export async function updateShareMetadata(
  storage: DurableObjectStorage,
  shareId: string,
  update: (current: ShareMetadata) => ShareMetadata,
): Promise<ShareMetadata> {
  const current = (await getShareMetadata(storage)) ?? {
    shareId,
    title: null,
    mode: 'control',
    expiresAtUnixMs: null,
  };
  const next = update(current);

  await storage.put(SHARE_METADATA_KEY, next);

  if (next.expiresAtUnixMs != null) {
    await storage.setAlarm(next.expiresAtUnixMs);
  } else {
    await storage.deleteAlarm();
  }

  return next;
}

export async function clearShareMetadata(storage: DurableObjectStorage): Promise<void> {
  await storage.delete(SHARE_METADATA_KEY);
  await storage.deleteAlarm();
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw == null) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}
