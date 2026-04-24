import { describe, expect, test } from 'bun:test';
import {
  decodeWebSocketText,
  parseGuestEnvelope,
  parseHostEnvelope,
  parseRelayToGuestEnvelope,
  parseRelayToHostEnvelope,
  serializeEnvelope,
} from '../../proxy/src/protocol';

describe('proxy relay protocol helpers', () => {
  test('parses host and guest envelopes safely', () => {
    expect(parseHostEnvelope(JSON.stringify({
      type: 'terminal.output',
      data: 'hello',
      stream: 'stdout',
    }))).toEqual({
      type: 'terminal.output',
      data: 'hello',
      stream: 'stdout',
    });

    expect(parseGuestEnvelope(JSON.stringify({
      type: 'terminal.input',
      data: 'ls\r',
    }))).toEqual({
      type: 'terminal.input',
      data: 'ls\r',
    });

    expect(parseGuestEnvelope(JSON.stringify({
      type: 'terminal.resize',
      cols: 120,
      rows: 40,
    }))).toEqual({
      type: 'terminal.resize',
      cols: 120,
      rows: 40,
    });

    expect(parseHostEnvelope('{"type":"nope"}')).toBeNull();
    expect(parseGuestEnvelope('{"type":"terminal.resize","cols":"wide"}')).toBeNull();
    expect(parseRelayToHostEnvelope(JSON.stringify({
      type: 'terminal.input',
      guestId: 'guest-1',
      data: 'pwd\r',
    }))).toEqual({
      type: 'terminal.input',
      guestId: 'guest-1',
      data: 'pwd\r',
    });
    expect(parseRelayToGuestEnvelope(JSON.stringify({
      type: 'relay.error',
      code: 'expired',
      message: 'done',
    }))).toEqual({
      type: 'relay.error',
      code: 'expired',
      message: 'done',
    });
  });

  test('serializes relay envelopes and decodes buffers safely', () => {
    const payload = serializeEnvelope({
      type: 'relay.error',
      code: 'expired',
      message: 'done',
    });
    expect(payload).toBe('{"type":"relay.error","code":"expired","message":"done"}');

    const buffer = new TextEncoder().encode('hello').buffer;
    expect(decodeWebSocketText(buffer)).toBe('hello');
    expect(decodeWebSocketText(new Uint8Array([104, 105]))).toBe('hi');
  });
});
