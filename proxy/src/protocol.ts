export type RelayErrorCode =
  | 'bad_message'
  | 'expired'
  | 'host_unavailable'
  | 'readonly';

export type RelayErrorEnvelope = {
  type: 'relay.error';
  code: RelayErrorCode;
  message: string;
};

export type HostEnvelope =
  {
    type: 'terminal.output';
    data: string;
    stream?: 'stdout' | 'stderr';
  }
  | {
      type: 'terminal.exit';
      code: number | null;
      signal?: string | null;
    };

export type GuestEnvelope =
  | {
      type: 'terminal.input';
      data: string;
    }
  | {
      type: 'terminal.resize';
      cols: number;
      rows: number;
    };

export type RelayToHostEnvelope =
  {
    type: 'terminal.input';
    guestId: string;
    data: string;
  }
  | {
      type: 'terminal.resize';
      guestId: string;
      cols: number;
      rows: number;
    }
  | RelayErrorEnvelope;

export type RelayToGuestEnvelope =
  {
    type: 'terminal.output';
    data: string;
    stream?: 'stdout' | 'stderr';
  }
  | {
      type: 'terminal.exit';
      code: number | null;
      signal?: string | null;
    }
  | RelayErrorEnvelope;

type RelayEnvelope = HostEnvelope | GuestEnvelope | RelayToHostEnvelope | RelayToGuestEnvelope;

type JsonRecord = Record<string, unknown>;

export function decodeWebSocketText(message: ArrayBuffer | ArrayBufferView | string): string {
  if (typeof message === 'string') return message;
  if (ArrayBuffer.isView(message)) {
    return new TextDecoder().decode(message);
  }
  return new TextDecoder().decode(message);
}

export function serializeEnvelope(envelope: RelayEnvelope): string {
  return JSON.stringify(envelope);
}

export function parseHostEnvelope(message: ArrayBuffer | ArrayBufferView | string): HostEnvelope | null {
  const value = parseJsonRecord(decodeWebSocketText(message));
  if (!value || typeof value.type !== 'string') return null;

  switch (value.type) {
    case 'terminal.output':
      if (typeof value.data !== 'string') return null;
      return {
        type: 'terminal.output',
        data: value.data,
        stream: value.stream === 'stderr' ? 'stderr' : value.stream === 'stdout' ? 'stdout' : undefined,
      };
    case 'terminal.exit':
      return {
        type: 'terminal.exit',
        code: normalizeNullableInteger(value.code),
        signal: normalizeOptionalText(value.signal),
      };
    default:
      return null;
  }
}

export function parseGuestEnvelope(message: ArrayBuffer | ArrayBufferView | string): GuestEnvelope | null {
  const value = parseJsonRecord(decodeWebSocketText(message));
  if (!value || typeof value.type !== 'string') return null;

  switch (value.type) {
    case 'terminal.input':
      if (typeof value.data !== 'string') return null;
      return {
        type: 'terminal.input',
        data: value.data,
      };
    case 'terminal.resize':
      if (!Number.isInteger(value.cols) || !Number.isInteger(value.rows)) return null;
      return {
        type: 'terminal.resize',
        cols: Number(value.cols),
        rows: Number(value.rows),
      };
    default:
      return null;
  }
}

export function parseRelayToHostEnvelope(
  message: ArrayBuffer | ArrayBufferView | string,
): RelayToHostEnvelope | null {
  const value = parseJsonRecord(decodeWebSocketText(message));
  if (!value || typeof value.type !== 'string') return null;

  switch (value.type) {
    case 'terminal.input':
      if (typeof value.data !== 'string' || typeof value.guestId !== 'string') return null;
      return {
        type: 'terminal.input',
        guestId: value.guestId,
        data: value.data,
      };
    case 'terminal.resize':
      if (
        typeof value.guestId !== 'string'
        || !Number.isInteger(value.cols)
        || !Number.isInteger(value.rows)
      ) {
        return null;
      }
      return {
        type: 'terminal.resize',
        guestId: value.guestId,
        cols: Number(value.cols),
        rows: Number(value.rows),
      };
    case 'relay.error':
      return parseRelayErrorEnvelope(value);
    default:
      return null;
  }
}

export function parseRelayToGuestEnvelope(
  message: ArrayBuffer | ArrayBufferView | string,
): RelayToGuestEnvelope | null {
  const value = parseJsonRecord(decodeWebSocketText(message));
  if (!value || typeof value.type !== 'string') return null;

  switch (value.type) {
    case 'terminal.output':
      if (typeof value.data !== 'string') return null;
      return {
        type: 'terminal.output',
        data: value.data,
        stream: value.stream === 'stderr' ? 'stderr' : value.stream === 'stdout' ? 'stdout' : undefined,
      };
    case 'terminal.exit':
      return {
        type: 'terminal.exit',
        code: normalizeNullableInteger(value.code),
        signal: normalizeOptionalText(value.signal),
      };
    case 'relay.error':
      return parseRelayErrorEnvelope(value);
    default:
      return null;
  }
}

function parseJsonRecord(raw: string): JsonRecord | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isJsonRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null;
}

function parseRelayErrorEnvelope(value: JsonRecord): RelayErrorEnvelope | null {
  if (!isRelayErrorCode(value.code) || typeof value.message !== 'string') return null;
  return {
    type: 'relay.error',
    code: value.code,
    message: value.message,
  };
}

function normalizeOptionalText(value: unknown): string | null | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeNullableInteger(value: unknown): number | null {
  if (value == null) return null;
  if (!Number.isInteger(value)) return null;
  return Number(value);
}

function isRelayErrorCode(value: unknown): value is RelayErrorCode {
  return value === 'bad_message'
    || value === 'expired'
    || value === 'host_unavailable'
    || value === 'readonly';
}
