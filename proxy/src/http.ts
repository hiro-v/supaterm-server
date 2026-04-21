export const SHARE_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;

export type ProxyRoute =
  | { kind: 'health' }
  | { kind: 'share-meta'; shareId: string }
  | { kind: 'host-websocket'; shareId: string }
  | { kind: 'guest-websocket'; shareId: string }
  | { kind: 'not-found' };

export function parseProxyRoute(method: string, url: URL): ProxyRoute {
  const path = url.pathname;

  if (method === 'GET' && path === '/health') {
    return { kind: 'health' };
  }

  const shareMeta = matchShareApiRoute(path, '/api/shares/', '');
  if (method === 'GET' && shareMeta) {
    return { kind: 'share-meta', shareId: shareMeta };
  }

  const hostSocket = matchShareApiRoute(path, '/api/shares/', '/host');
  if (method === 'GET' && hostSocket) {
    return { kind: 'host-websocket', shareId: hostSocket };
  }

  const guestSocket = matchShareApiRoute(path, '/api/shares/', '/guest');
  if (method === 'GET' && guestSocket) {
    return { kind: 'guest-websocket', shareId: guestSocket };
  }

  return { kind: 'not-found' };
}

export function canonicalizeShareId(raw: string): string | null {
  if (raw.length === 0) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }

  return SHARE_ID_PATTERN.test(decoded) ? decoded : null;
}

export function isWebSocketUpgrade(request: Request): boolean {
  return request.headers.get('Upgrade')?.toLowerCase() === 'websocket';
}

export function createJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function matchShareApiRoute(
  path: string,
  prefix: string,
  suffix: string,
): string | null {
  if (!path.startsWith(prefix)) return null;
  if (suffix.length > 0 && !path.endsWith(suffix)) return null;

  const start = prefix.length;
  const end = suffix.length > 0 ? path.length - suffix.length : path.length;
  if (start >= end) return null;
  return canonicalizeShareId(path.slice(start, end));
}
