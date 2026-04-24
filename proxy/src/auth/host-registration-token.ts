import type { ProxyEnv } from '../config';
import { readBearerToken } from '../config';

const TOKEN_VERSION = 'v1';
const TOKEN_AUDIENCE = 'supaterm-share-relay';

export type HostRegistrationClaims = {
  aud: typeof TOKEN_AUDIENCE;
  share_id: string;
  exp: number;
  iat: number;
  sub?: string;
};

export async function authorizeHostRequest(
  request: Request,
  env: Pick<ProxyEnv, 'HOST_REGISTRATION_TOKEN_SECRET'>,
  shareId: string,
  nowUnixMs = Date.now(),
): Promise<boolean> {
  const secret = env.HOST_REGISTRATION_TOKEN_SECRET?.trim();
  if (!secret) return true;

  const token = readBearerToken(request);
  if (!token) return false;

  const claims = await verifyHostRegistrationToken(token, secret, nowUnixMs);
  return claims?.share_id === shareId;
}

export async function issueHostRegistrationToken(
  claims: HostRegistrationClaims,
  secret: string,
): Promise<string> {
  const encodedPayload = encodeBase64UrlUtf8(JSON.stringify(claims));
  const signature = await signText(`${TOKEN_VERSION}.${encodedPayload}`, secret);
  return `${TOKEN_VERSION}.${encodedPayload}.${signature}`;
}

export async function verifyHostRegistrationToken(
  token: string,
  secret: string,
  nowUnixMs = Date.now(),
): Promise<HostRegistrationClaims | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [version, encodedPayload, signature] = parts;
  if (version !== TOKEN_VERSION) return null;

  const expectedSignature = await signText(`${version}.${encodedPayload}`, secret);
  if (!timingSafeEqual(signature, expectedSignature)) return null;

  const claims = parseClaims(decodeBase64UrlUtf8(encodedPayload));
  if (!claims) return null;
  if (claims.aud !== TOKEN_AUDIENCE) return null;
  if (!Number.isFinite(claims.exp) || claims.exp <= nowUnixMs) return null;
  if (!Number.isFinite(claims.iat) || claims.iat > nowUnixMs + 60_000) return null;

  return claims;
}

function parseClaims(raw: string): HostRegistrationClaims | null {
  try {
    const parsed = JSON.parse(raw) as Partial<HostRegistrationClaims>;
    if (parsed.aud !== TOKEN_AUDIENCE) return null;
    if (typeof parsed.share_id !== 'string' || parsed.share_id.length === 0) return null;
    if (!Number.isFinite(parsed.exp) || !Number.isFinite(parsed.iat)) return null;
    if (parsed.sub != null && typeof parsed.sub !== 'string') return null;
    const exp = Number(parsed.exp);
    const iat = Number(parsed.iat);
    return {
      aud: TOKEN_AUDIENCE,
      share_id: parsed.share_id,
      exp: Math.trunc(exp),
      iat: Math.trunc(iat),
      sub: parsed.sub,
    };
  } catch {
    return null;
  }
}

async function signText(text: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return encodeBase64UrlBytes(new Uint8Array(signature));
}

function encodeBase64UrlUtf8(text: string): string {
  return encodeBase64UrlBytes(new TextEncoder().encode(text));
}

function encodeBase64UrlBytes(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function decodeBase64UrlUtf8(value: string): string {
  const normalized = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder().decode(bytes);
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;

  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}
