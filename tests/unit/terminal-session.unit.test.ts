import { describe, expect, test } from 'bun:test';
import { TerminalSessionConnection } from '../../web/src/terminal-session';

describe('terminal session transport', () => {
  test('connects with resolved token and dedupes resize frames', async () => {
    const socket = new FakeWebSocket();
    const sent: string[] = [];
    socket.send = (data: string) => {
      sent.push(data);
    };

    const connection = new TerminalSessionConnection({
      currentLocation: fakeLocation(),
      session: { sessionId: 'session.a', token: null },
      tokenResolver: async () => 'resolved-token',
      socketFactory: (url) => {
        expect(url).toContain('token=resolved-token');
        return socket;
      },
    });

    await connection.connect({ cols: 80, rows: 24 });
    socket.readyStateValue = WebSocket.OPEN;

    connection.resize(80, 24);
    connection.resize(80, 24);
    connection.resize(120, 30);
    connection.sendInput('echo hi');

    expect(sent).toEqual([
      '{"type":"resize","cols":80,"rows":24}',
      '{"type":"resize","cols":120,"rows":30}',
      'echo hi',
    ]);
  });

  test('decodes inbound frames through the injected decoder', async () => {
    const socket = new FakeWebSocket();
    const received: string[] = [];
    const events: string[] = [];

    const connection = new TerminalSessionConnection({
      currentLocation: fakeLocation(),
      session: { sessionId: 'session.b', token: 'preset' },
      messageDecoder: async (data) => `decoded:${String(data)}`,
      onSocketOpen: () => {
        events.push('socket-open');
      },
      onFirstText: () => {
        events.push('first-text');
      },
      onText: (text) => {
        received.push(text);
      },
      socketFactory: () => socket,
    });

    await connection.connect({ cols: 80, rows: 24 });
    socket.emit('open');
    socket.emit('message', { data: 'payload' });
    socket.emit('message', { data: 'payload-2' });

    await Promise.resolve();
    expect(received).toEqual(['decoded:payload', 'decoded:payload-2']);
    expect(events).toEqual(['socket-open', 'first-text']);
  });

  test('routes attach trace control frames away from terminal text', async () => {
    const socket = new FakeWebSocket();
    const traces: unknown[] = [];
    const received: string[] = [];

    const connection = new TerminalSessionConnection({
      currentLocation: fakeLocation(),
      session: { sessionId: 'session.c', token: 'preset' },
      onAttachTrace: (trace) => {
        traces.push(trace);
      },
      onText: (text) => {
        received.push(text);
      },
      socketFactory: () => socket,
    });

    await connection.connect({ cols: 80, rows: 24 });
    socket.emit('message', {
      data: '\x1e{"type":"supaterm.attach-trace","session_reused":false,"session_age_ms":1,"output_pump_started_ms":0,"first_backend_read_ms":120,"first_broadcast_ms":121}',
    });

    await Promise.resolve();
    expect(received).toEqual([]);
    expect(traces).toHaveLength(1);
  });
});

class FakeWebSocket {
  binaryType: BinaryType = 'blob';
  readyStateValue = WebSocket.CONNECTING;
  send(_data: string): void {}
  close(): void {
    this.readyStateValue = WebSocket.CLOSED;
  }

  private listeners: Record<string, Array<(event?: unknown) => void>> = {};

  get readyState(): number {
    return this.readyStateValue;
  }

  addEventListener(type: string, listener: (event?: unknown) => void): void {
    const entries = this.listeners[type] ?? [];
    entries.push(listener);
    this.listeners[type] = entries;
  }

  emit(type: string, event?: unknown): void {
    for (const listener of this.listeners[type] ?? []) {
      listener(event);
    }
  }
}

function fakeLocation(): Location {
  return {
    protocol: 'http:',
    host: '127.0.0.1:3000',
  } as Location;
}
