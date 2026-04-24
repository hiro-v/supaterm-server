import type { ShareMode } from './share-metadata';

export type ConnectionAttachment =
  | { role: 'host' }
  | { role: 'guest'; guestId: string; mode: ShareMode };

export function acceptHostSocket(ctx: DurableObjectState, socket: WebSocket): void {
  ctx.acceptWebSocket(socket, ['host']);
  socket.serializeAttachment({ role: 'host' } satisfies ConnectionAttachment);
}

export function acceptGuestSocket(
  ctx: DurableObjectState,
  socket: WebSocket,
  guestId: string,
  mode: ShareMode,
): void {
  ctx.acceptWebSocket(socket, ['guest']);
  socket.serializeAttachment({ role: 'guest', guestId, mode } satisfies ConnectionAttachment);
}

export function getHostSocket(ctx: DurableObjectState): WebSocket | null {
  const [host] = ctx.getWebSockets('host').filter(isOpenSocket);
  return host ?? null;
}

export function getGuestSockets(ctx: DurableObjectState): WebSocket[] {
  return ctx.getWebSockets('guest').filter(isOpenSocket);
}

export function getOpenSockets(ctx: DurableObjectState): WebSocket[] {
  return ctx.getWebSockets().filter(isOpenSocket);
}

export function readConnectionAttachment(ws: WebSocket): ConnectionAttachment | null {
  const value = ws.deserializeAttachment() as ConnectionAttachment | null;
  return value ?? null;
}

function isOpenSocket(ws: WebSocket): boolean {
  return ws.readyState === WebSocket.OPEN;
}
