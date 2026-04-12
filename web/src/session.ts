export type ServerMode = 'live' | 'demo';

export type SessionQuery = {
  sessionId: string | null;
  token: string | null;
};

export type SessionConnectionDetails = {
  sessionId: string;
  token: string | null;
};

type SessionMetadata = {
  session_id: string;
  token_policy: string;
  token_required: boolean;
  websocket_path: string;
  share_authority: string;
  share_token_transport: string;
  share_api_enabled: boolean;
  share_api_path: string;
};

type ShareGrant = {
  session_id: string;
  websocket_path: string;
  token: string;
  token_transport: string;
  share_authority: string;
  expires_at_unix_ms: number | null;
};

export function getSessionQuery(search: string): SessionQuery {
  const params = new URLSearchParams(search);
  return {
    sessionId: params.get('session'),
    token: params.get('token'),
  };
}

export function getServerMode(search: string): ServerMode {
  const params = new URLSearchParams(search);
  const demo = params.get('demo');
  return demo === '1' || demo === 'true' ? 'demo' : 'live';
}

export function buildSessionWebSocketUrl(
  currentLocation: Location,
  sessionId: string,
  token: string | null,
  cols: number,
  rows: number,
): string {
  const protocol = currentLocation.protocol === 'https:' ? 'wss' : 'ws';
  const pathSession = encodeURIComponent(sessionId);
  const query = new URLSearchParams({
    cols: String(cols),
    rows: String(rows),
  });

  if (token) {
    query.set('token', token);
  }

  return `${protocol}://${currentLocation.host}/api/sessions/${pathSession}/ws?${query.toString()}`;
}

export async function decodeTerminalMessage(data: unknown): Promise<string> {
  if (typeof data === 'string') {
    return data;
  }

  if (data instanceof Blob) {
    return await data.text();
  }

  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(data);
  }

  return '';
}

export async function resolveSessionToken(
  currentLocation: Location,
  connection: SessionConnectionDetails,
): Promise<string | null> {
  if (connection.token) {
    return connection.token;
  }

  const metadata = await getSessionMetadata(currentLocation, connection.sessionId);
  if (!metadata.token_required) {
    return null;
  }

  if (!metadata.share_api_enabled) {
    return null;
  }

  const grant = await getShareGrant(currentLocation, connection.sessionId);
  return grant.token || null;
}

async function getSessionMetadata(currentLocation: Location, sessionId: string): Promise<SessionMetadata> {
  const response = await fetch(buildSessionUrl(currentLocation, `/api/sessions/${encodeURIComponent(sessionId)}`));
  if (!response.ok) {
    throw new Error(`Failed to load session metadata (${response.status})`);
  }
  return await response.json() as SessionMetadata;
}

async function getShareGrant(currentLocation: Location, sessionId: string): Promise<ShareGrant> {
  const response = await fetch(buildSessionUrl(currentLocation, `/api/sessions/${encodeURIComponent(sessionId)}/share`));
  if (!response.ok) {
    throw new Error(`Failed to load share grant (${response.status})`);
  }
  return await response.json() as ShareGrant;
}

function buildSessionUrl(currentLocation: Location, pathname: string): string {
  return `${currentLocation.protocol}//${currentLocation.host}${pathname}`;
}
