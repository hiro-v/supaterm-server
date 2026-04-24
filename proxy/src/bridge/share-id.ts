const SHARE_ID_PREFIX = 'shr_';
const SHARE_ID_PATTERN = /^shr_[0-9a-f]{32}$/;

export function generateShareId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `${SHARE_ID_PREFIX}${toHex(bytes)}`;
}

export function isOpaqueShareId(value: string): boolean {
  return SHARE_ID_PATTERN.test(value);
}

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, '0');
  }
  return out;
}
