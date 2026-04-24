export interface ProxyEnv {
  SHARE_RELAY: DurableObjectNamespace;
  HOST_SHARED_SECRET?: string;
  HOST_REGISTRATION_TOKEN_SECRET?: string;
  MAX_SHARE_TTL_SECONDS?: string;
}

export function isAuthorizedHostRequest(
  request: Request,
  env: Pick<ProxyEnv, 'HOST_SHARED_SECRET'>,
): boolean {
  const expected = env.HOST_SHARED_SECRET?.trim();
  if (!expected) return true;

  return readBearerToken(request) === expected;
}

export function readBearerToken(request: Request): string | null {
  const authorization = request.headers.get('Authorization');
  if (!authorization) return null;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}
