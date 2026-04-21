import type { ProxyEnv } from './config';
import { createJsonResponse, isWebSocketUpgrade, parseProxyRoute } from './http';
import {
  parseGuestEnvelope,
  parseHostEnvelope,
  serializeEnvelope,
  type RelayToGuestEnvelope,
  type RelayToHostEnvelope,
} from './protocol';
import {
  clearShareMetadata,
  getShareMetadata,
  isExpired,
  normalizeShareMode,
  normalizeTitle,
  resolveShareExpiresAtUnixMs,
  type ShareMode,
  updateShareMetadata,
} from './relay/share-metadata';
import {
  acceptGuestSocket,
  acceptHostSocket,
  getGuestSockets,
  getHostSocket,
  getOpenSockets,
  readConnectionAttachment,
} from './relay/share-sockets';

export class ShareRelayDurableObject {
  private readonly ctx: DurableObjectState;
  private readonly env: ProxyEnv;

  constructor(ctx: DurableObjectState, env: ProxyEnv) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const route = parseProxyRoute(request.method, new URL(request.url));

    switch (route.kind) {
      case 'share-meta':
        return this.handleMetadata(route.shareId);
      case 'host-websocket':
        return this.handleHostSocket(route.shareId, request);
      case 'guest-websocket':
        return this.handleGuestSocket(route.shareId, request);
      default:
        return new Response('Not found', { status: 404 });
    }
  }

  async alarm(): Promise<void> {
    await this.expireShare('Share expired');
  }

  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): Promise<void> {
    const attachment = readConnectionAttachment(ws);
    if (!attachment) {
      this.sendRelayError(ws, 'bad_message', 'Missing relay attachment');
      return;
    }

    if (attachment.role === 'host') {
      this.handleHostMessage(ws, message);
      return;
    }

    this.handleGuestMessage(ws, attachment.guestId, attachment.mode, message);
  }

  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    _wasClean: boolean,
  ): Promise<void> {
    const attachment = readConnectionAttachment(ws);
    if (attachment?.role !== 'host') return;

    await this.closeGuestSockets('Host disconnected', code || 1011);
    await clearShareMetadata(this.ctx.storage);
  }

  private async handleMetadata(shareId: string): Promise<Response> {
    const metadata = await getShareMetadata(this.ctx.storage);
    if (!metadata || metadata.shareId !== shareId) {
      return new Response('Share not found', { status: 404 });
    }
    if (isExpired(metadata)) {
      await this.expireShare('Share expired');
      return new Response('Share expired', { status: 410 });
    }

    return createJsonResponse({
      share_id: shareId,
      title: metadata.title,
      mode: metadata.mode,
      host_connected: getHostSocket(this.ctx) !== null,
      guest_count: getGuestSockets(this.ctx).length,
      expires_at_unix_ms: metadata.expiresAtUnixMs,
      guest_websocket_path: `/api/shares/${encodeURIComponent(shareId)}/guest`,
    });
  }

  private async handleHostSocket(shareId: string, request: Request): Promise<Response> {
    if (!isWebSocketUpgrade(request)) {
      return new Response('Expected websocket upgrade', { status: 426 });
    }

    if (getHostSocket(this.ctx)) {
      return new Response('Host already connected', { status: 409 });
    }

    const url = new URL(request.url);
    const expiresAtUnixMs = resolveShareExpiresAtUnixMs(url.searchParams.get('expiresAtUnixMs'), this.env);
    const mode = normalizeShareMode(url.searchParams.get('mode'));
    const title = normalizeTitle(url.searchParams.get('title'));

    await updateShareMetadata(this.ctx.storage, shareId, (current) => ({
      ...current,
      shareId,
      mode,
      title: title ?? current.title,
      expiresAtUnixMs,
    }));

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    acceptHostSocket(this.ctx, server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  private async handleGuestSocket(shareId: string, request: Request): Promise<Response> {
    if (!isWebSocketUpgrade(request)) {
      return new Response('Expected websocket upgrade', { status: 426 });
    }

    const metadata = await getShareMetadata(this.ctx.storage);
    if (!metadata || metadata.shareId !== shareId) {
      return new Response('Share not found', { status: 404 });
    }
    if (isExpired(metadata)) {
      await this.expireShare('Share expired');
      return new Response('Share expired', { status: 410 });
    }

    if (!getHostSocket(this.ctx)) {
      return new Response('Host unavailable', { status: 503 });
    }

    const requestedMode = normalizeShareMode(new URL(request.url).searchParams.get('mode'));
    const guestMode = metadata.mode === 'view' ? 'view' : requestedMode;
    const guestId = crypto.randomUUID();

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    acceptGuestSocket(this.ctx, server, guestId, guestMode);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  private handleHostMessage(ws: WebSocket, message: ArrayBuffer | string): void {
    const envelope = parseHostEnvelope(message);
    if (!envelope) {
      this.sendRelayError(ws, 'bad_message', 'Invalid host message');
      return;
    }

    switch (envelope.type) {
      case 'terminal.output':
        this.broadcastToGuests({
          type: 'terminal.output',
          data: envelope.data,
          stream: envelope.stream,
        });
        return;
      case 'terminal.exit':
        this.broadcastToGuests({
          type: 'terminal.exit',
          code: envelope.code,
          signal: envelope.signal,
        });
        return;
    }
  }

  private handleGuestMessage(
    ws: WebSocket,
    guestId: string,
    mode: ShareMode,
    message: ArrayBuffer | string,
  ): void {
    const envelope = parseGuestEnvelope(message);
    if (!envelope) {
      this.sendRelayError(ws, 'bad_message', 'Invalid guest message');
      return;
    }

    if (mode !== 'control') {
      this.sendRelayError(ws, 'readonly', 'Guest is connected in view mode');
      return;
    }

    switch (envelope.type) {
      case 'terminal.input':
        this.sendToHost({
          type: 'terminal.input',
          guestId,
          data: envelope.data,
        });
        return;
      case 'terminal.resize':
        this.sendToHost({
          type: 'terminal.resize',
          guestId,
          cols: envelope.cols,
          rows: envelope.rows,
        });
        return;
    }
  }

  private broadcastToGuests(envelope: RelayToGuestEnvelope): void {
    for (const ws of getGuestSockets(this.ctx)) {
      ws.send(serializeEnvelope(envelope));
    }
  }

  private sendToHost(envelope: RelayToHostEnvelope): void {
    const host = getHostSocket(this.ctx);
    if (!host) return;
    host.send(serializeEnvelope(envelope));
  }

  private async expireShare(reason: string): Promise<void> {
    for (const ws of getOpenSockets(this.ctx)) {
      this.sendRelayError(ws, 'expired', reason);
      ws.close(1000, reason);
    }

    await clearShareMetadata(this.ctx.storage);
  }

  private async closeGuestSockets(reason: string, code: number): Promise<void> {
    for (const ws of getGuestSockets(this.ctx)) {
      this.sendRelayError(ws, 'host_unavailable', reason);
      ws.close(code, reason);
    }
  }

  private sendRelayError(
    ws: WebSocket,
    code: 'bad_message' | 'expired' | 'host_unavailable' | 'readonly',
    message: string,
  ): void {
    ws.send(serializeEnvelope({
      type: 'relay.error',
      code,
      message,
    }));
  }
}
