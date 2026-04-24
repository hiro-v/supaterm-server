import type { ProxyEnv } from './config';
import { isAuthorizedHostRequest } from './config';
import {
  createJsonResponse,
  isWebSocketUpgrade,
  parseProxyRoute,
} from './http';
import { ShareRelayDurableObject } from './share-relay';

const worker: ExportedHandler<ProxyEnv> = {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const route = parseProxyRoute(request.method, url);

    switch (route.kind) {
      case 'health':
        return createJsonResponse({
          status: 'ok',
          service: 'supaterm-share-proxy',
        });
      case 'share-meta': {
        const stub = env.SHARE_RELAY.getByName(route.shareId);
        return stub.fetch(request);
      }
      case 'host-websocket': {
        if (!isWebSocketUpgrade(request)) {
          return new Response('Expected websocket upgrade', { status: 426 });
        }
        if (!isAuthorizedHostRequest(request, env)) {
          return new Response('Unauthorized', { status: 403 });
        }
        const stub = env.SHARE_RELAY.getByName(route.shareId);
        return stub.fetch(request);
      }
      case 'guest-websocket': {
        if (!isWebSocketUpgrade(request)) {
          return new Response('Expected websocket upgrade', { status: 426 });
        }
        const stub = env.SHARE_RELAY.getByName(route.shareId);
        return stub.fetch(request);
      }
      case 'not-found':
        return new Response('Not found', { status: 404 });
    }
  },
};

export default worker;
export { ShareRelayDurableObject };
