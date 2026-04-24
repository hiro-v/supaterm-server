import {
  decodeWebSocketText,
  parseRelayToGuestEnvelope,
  parseRelayToHostEnvelope,
  serializeEnvelope,
} from '../protocol';
import { createOutputBatcher } from './output-batcher';
import { generateShareId } from './share-id';
import { isSessionControlMessage } from './session-control';

export type BridgeMode = 'view' | 'control';
export type BridgeShell = 'fish' | 'zsh' | 'bash' | 'sh';

export type StartedShareBridge = {
  shareId: string;
  stop: () => Promise<void>;
};

export type StartShareBridgeOptions = {
  relayBaseUrl: string;
  serverBaseUrl: string;
  sessionId: string;
  token: string;
  shareId?: string;
  title?: string;
  mode?: BridgeMode;
  expiresAtUnixMs?: number | null;
  shell?: BridgeShell;
  cols?: number;
  rows?: number;
  outputBatchWindowMs?: number;
  outputBatchBytes?: number;
  createServerSocket?: (url: string) => WebSocket;
  createRelaySocket?: (url: string) => WebSocket;
};

export async function startShareBridge(options: StartShareBridgeOptions): Promise<StartedShareBridge> {
  const shareId = options.shareId ?? generateShareId();
  const createServerSocket = options.createServerSocket ?? ((url: string) => new WebSocket(url));
  const createRelaySocket = options.createRelaySocket ?? ((url: string) => new WebSocket(url));

  const serverSocket = createServerSocket(buildServerWebSocketUrl(options));
  const relaySocket = createRelaySocket(buildRelayHostWebSocketUrl(options.relayBaseUrl, {
    shareId,
    title: options.title,
    mode: options.mode ?? 'control',
    expiresAtUnixMs: options.expiresAtUnixMs ?? null,
  }));

  serverSocket.binaryType = 'arraybuffer';
  relaySocket.binaryType = 'arraybuffer';

  const outputBatcher = createOutputBatcher({
    flushDelayMs: options.outputBatchWindowMs,
    maxBufferedBytes: options.outputBatchBytes,
    onFlush: (chunk) => {
      if (relaySocket.readyState !== WebSocket.OPEN) return;
      relaySocket.send(serializeEnvelope({
        type: 'terminal.output',
        data: chunk,
      }));
    },
  });

  serverSocket.addEventListener('message', (event) => {
    const text = decodeWebSocketText(event.data);
    if (isSessionControlMessage(text)) {
      return;
    }
    outputBatcher.push(text);
  });

  relaySocket.addEventListener('message', (event) => {
    const message = parseRelayToHostEnvelope(event.data);
    if (!message) return;

    switch (message.type) {
      case 'terminal.input':
        serverSocket.send(message.data);
        return;
      case 'terminal.resize':
        serverSocket.send(JSON.stringify({
          type: 'resize',
          cols: message.cols,
          rows: message.rows,
        }));
        return;
      case 'relay.error':
        return;
    }
  });

  serverSocket.addEventListener('close', () => {
    outputBatcher.stop();
    closeSocket(relaySocket).catch(() => {});
  });

  relaySocket.addEventListener('close', () => {
    outputBatcher.stop();
    closeSocket(serverSocket).catch(() => {});
  });

  await Promise.all([
    waitForOpen(serverSocket, 'server session websocket'),
    waitForOpen(relaySocket, 'relay host websocket'),
  ]);

  return {
    shareId,
    stop: async () => {
      outputBatcher.stop();
      await Promise.allSettled([
        closeSocket(serverSocket),
        closeSocket(relaySocket),
      ]);
    },
  };
}

export async function openRelayGuestSession(options: {
  relayBaseUrl: string;
  shareId: string;
  mode?: BridgeMode;
  command: string;
  completionMarker?: string;
  timeoutMs?: number;
}): Promise<string> {
  const marker = options.completionMarker ?? '__SUPATERM_PROXY_DONE__';
  const query = new URLSearchParams({
    mode: options.mode ?? 'control',
  });

  const socket = new WebSocket(
    `${toWebSocketOrigin(options.relayBaseUrl)}/api/shares/${encodeURIComponent(options.shareId)}/guest?${query.toString()}`,
  );
  socket.binaryType = 'arraybuffer';

  return await new Promise((resolve, reject) => {
    let transcript = '';
    let settled = false;
    const timeout = setTimeout(() => {
      finish(() => reject(new Error(`relay guest session timed out\n${transcript}`)));
    }, options.timeoutMs ?? 15_000);

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try {
        socket.close();
      } catch {}
      fn();
    };

    socket.addEventListener('open', () => {
      socket.send(serializeEnvelope({
        type: 'terminal.input',
        data: `\u0003\u0015${options.command}; printf '${marker}\\n'\r`,
      }));
    });

    socket.addEventListener('message', (event) => {
      const message = parseRelayToGuestEnvelope(event.data);
      if (!message) return;

      switch (message.type) {
        case 'terminal.output':
          transcript += message.data;
          if (transcript.includes(marker)) {
            finish(() => resolve(transcript));
          }
          return;
        case 'terminal.exit':
          if (transcript.includes(marker)) {
            finish(() => resolve(transcript));
            return;
          }
          finish(() => reject(new Error(`relay guest session exited early\n${transcript}`)));
          return;
        case 'relay.error':
          finish(() => reject(new Error(`relay guest error: ${message.code}: ${message.message}`)));
      }
    });

    socket.addEventListener('error', () => {
      finish(() => reject(new Error(`relay guest websocket error\n${transcript}`)));
    });

    socket.addEventListener('close', () => {
      if (!settled) {
        finish(() => reject(new Error(`relay guest websocket closed early\n${transcript}`)));
      }
    });
  });
}

function buildServerWebSocketUrl(options: StartShareBridgeOptions): string {
  const url = new URL(`/api/sessions/${encodeURIComponent(options.sessionId)}/ws`, options.serverBaseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('cols', String(options.cols ?? 80));
  url.searchParams.set('rows', String(options.rows ?? 24));
  url.searchParams.set('token', options.token);
  if (options.shell) {
    url.searchParams.set('shell', options.shell);
  }
  return url.toString();
}

function buildRelayHostWebSocketUrl(
  relayBaseUrl: string,
  options: {
    shareId: string;
    title?: string;
    mode: BridgeMode;
    expiresAtUnixMs: number | null;
  },
): string {
  const url = new URL(`/api/shares/${encodeURIComponent(options.shareId)}/host`, relayBaseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('mode', options.mode);
  if (options.title) {
    url.searchParams.set('title', options.title);
  }
  if (options.expiresAtUnixMs != null) {
    url.searchParams.set('expiresAtUnixMs', String(options.expiresAtUnixMs));
  }
  return url.toString();
}

function toWebSocketOrigin(baseUrl: string): string {
  return baseUrl.replace(/^http/, 'ws');
}

async function waitForOpen(socket: WebSocket, label: string): Promise<void> {
  if (socket.readyState === WebSocket.OPEN) return;

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`${label} timed out before open`));
    }, 10_000);

    const cleanup = () => {
      clearTimeout(timeout);
      socket.removeEventListener('open', handleOpen);
      socket.removeEventListener('error', handleError);
      socket.removeEventListener('close', handleClose);
    };

    const handleOpen = () => {
      cleanup();
      resolve();
    };

    const handleError = () => {
      cleanup();
      reject(new Error(`${label} failed before open`));
    };

    const handleClose = () => {
      cleanup();
      reject(new Error(`${label} closed before open`));
    };

    socket.addEventListener('open', handleOpen);
    socket.addEventListener('error', handleError);
    socket.addEventListener('close', handleClose);
  });
}

async function closeSocket(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.CLOSED) return;

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      cleanup();
    }, 2_000);

    const cleanup = () => {
      clearTimeout(timeout);
      socket.removeEventListener('close', handleClose);
      resolve();
    };

    const handleClose = () => {
      cleanup();
    };

    socket.addEventListener('close', handleClose);

    try {
      socket.close();
    } catch {
      cleanup();
    }
  });
}
