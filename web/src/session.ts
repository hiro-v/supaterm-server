export type ServerMode = 'live' | 'demo';

export type SessionQuery = {
  sessionId: string | null;
  token: string | null;
};

export type SessionConnectionDetails = {
  sessionId: string;
  token: string | null;
  shell: PaneShell;
};

export type PaneShell = 'system' | 'fish' | 'zsh' | 'bash' | 'sh';

export type ShellCapability = {
  id: Exclude<PaneShell, 'system'>;
  available: boolean;
  path: string | null;
};

export type ShellCapabilities = {
  default_shell: Exclude<PaneShell, 'system'> | null;
  shells: ShellCapability[];
};

export type ApiIdentity = {
  id: string;
  token: string | null;
};

export type SessionAttachTrace = {
  type: 'supaterm.attach-trace';
  session_reused: boolean;
  session_age_ms: number;
  output_pump_started_ms: number | null;
  first_backend_read_ms: number | null;
  first_broadcast_ms: number | null;
};

export const SESSION_CONTROL_PREFIX = '\x1e';

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
  shell: PaneShell,
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
  if (shell !== 'system') {
    query.set('shell', shell);
  }

  return `${protocol}://${currentLocation.host}/api/sessions/${pathSession}/ws?${query.toString()}`;
}

export function buildServerApiUrl(currentLocation: Location, pathname: string): string {
  return `${currentLocation.protocol}//${currentLocation.host}${pathname}`;
}

export function buildAuthorizedHeaders(token: string | null): HeadersInit | undefined {
  if (!token) return undefined;
  return {
    Authorization: `Bearer ${token}`,
  };
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

export function parseSessionControlMessage(text: string): SessionAttachTrace | null {
  if (!text.startsWith(SESSION_CONTROL_PREFIX)) {
    return null;
  }

  const payload = text.slice(SESSION_CONTROL_PREFIX.length);
  try {
    const parsed = JSON.parse(payload) as Partial<SessionAttachTrace>;
    if (parsed.type !== 'supaterm.attach-trace') {
      return null;
    }
    return {
      type: 'supaterm.attach-trace',
      session_reused: parsed.session_reused === true,
      session_age_ms: Number(parsed.session_age_ms ?? 0),
      output_pump_started_ms: parsed.output_pump_started_ms == null ? null : Number(parsed.output_pump_started_ms),
      first_backend_read_ms: parsed.first_backend_read_ms == null ? null : Number(parsed.first_backend_read_ms),
      first_broadcast_ms: parsed.first_broadcast_ms == null ? null : Number(parsed.first_broadcast_ms),
    };
  } catch {
    return null;
  }
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

export async function getShellCapabilities(currentLocation: Location): Promise<ShellCapabilities> {
  const response = await fetch(buildServerApiUrl(currentLocation, '/api/capabilities/shells'));
  if (!response.ok) {
    throw new Error(`Failed to load shell capabilities (${response.status})`);
  }
  return await response.json() as ShellCapabilities;
}

async function getSessionMetadata(currentLocation: Location, sessionId: string): Promise<SessionMetadata> {
  const response = await fetch(buildServerApiUrl(currentLocation, `/api/sessions/${encodeURIComponent(sessionId)}`));
  if (!response.ok) {
    throw new Error(`Failed to load session metadata (${response.status})`);
  }
  return await response.json() as SessionMetadata;
}

async function getShareGrant(currentLocation: Location, sessionId: string): Promise<ShareGrant> {
  const response = await fetch(buildServerApiUrl(currentLocation, `/api/sessions/${encodeURIComponent(sessionId)}/share`));
  if (!response.ok) {
    throw new Error(`Failed to load share grant (${response.status})`);
  }
  return await response.json() as ShareGrant;
}
