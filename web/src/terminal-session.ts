import {
  buildSessionWebSocketUrl,
  decodeTerminalMessage,
  parseSessionControlMessage,
  resolveSessionToken,
  type SessionAttachTrace,
  type SessionConnectionDetails,
} from './session';

type MessageEventLike = {
  data: unknown;
};

type WebSocketLike = {
  readonly readyState: number;
  binaryType: BinaryType;
  send(data: string): void;
  close(): void;
  addEventListener(
    type: 'open' | 'close' | 'error' | 'message',
    listener: (event?: MessageEventLike) => void,
  ): void;
};

export type TerminalSessionConnectionOptions = {
  currentLocation?: Location;
  session: SessionConnectionDetails;
  onOpen?: () => void;
  onSocketOpen?: () => void;
  onClose?: () => void;
  onError?: () => void;
  onFirstText?: () => void;
  onAttachTrace?: (trace: SessionAttachTrace) => void;
  onText?: (text: string) => void;
  tokenResolver?: typeof resolveSessionToken;
  messageDecoder?: typeof decodeTerminalMessage;
  socketFactory?: (url: string) => WebSocketLike;
};

export class TerminalSessionConnection {
  private readonly currentLocation: Location;
  private readonly session: SessionConnectionDetails;
  private readonly onOpen;
  private readonly onSocketOpen;
  private readonly onClose;
  private readonly onError;
  private readonly onFirstText;
  private readonly onAttachTrace;
  private readonly onText;
  private readonly tokenResolver;
  private readonly messageDecoder;
  private readonly socketFactory;
  private socket: WebSocketLike | null = null;
  private lastResize: { cols: number; rows: number } | null = null;
  private disposed = false;
  private sawFirstText = false;

  constructor(options: TerminalSessionConnectionOptions) {
    this.currentLocation = options.currentLocation ?? window.location;
    this.session = options.session;
    this.onOpen = options.onOpen;
    this.onSocketOpen = options.onSocketOpen;
    this.onClose = options.onClose;
    this.onError = options.onError;
    this.onFirstText = options.onFirstText;
    this.onAttachTrace = options.onAttachTrace;
    this.onText = options.onText;
    this.tokenResolver = options.tokenResolver ?? resolveSessionToken;
    this.messageDecoder = options.messageDecoder ?? decodeTerminalMessage;
    this.socketFactory = options.socketFactory ?? ((url) => new WebSocket(url));
  }

  async connect(initialSize: { cols: number; rows: number }): Promise<void> {
    if (this.disposed || this.socket) return;

    const token = await this.tokenResolver(this.currentLocation, this.session);
    if (this.disposed) return;

    const socket = this.socketFactory(
      buildSessionWebSocketUrl(
        this.currentLocation,
        this.session.sessionId,
        token,
        this.session.shell,
        initialSize.cols,
        initialSize.rows,
      ),
    );
    socket.binaryType = 'arraybuffer';

    socket.addEventListener('open', () => {
      this.lastResize = null;
      this.onSocketOpen?.();
      this.onOpen?.();
    });

    socket.addEventListener('close', () => {
      this.onClose?.();
    });

    socket.addEventListener('error', () => {
      this.onError?.();
    });

    socket.addEventListener('message', (event?: MessageEventLike) => {
      if (!event) return;
      void this.handleMessage(event);
    });

    this.socket = socket;
  }

  sendInput(data: string): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(data);
  }

  resize(cols: number, rows: number): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    if (this.lastResize?.cols === cols && this.lastResize.rows === rows) return;
    this.lastResize = { cols, rows };
    this.socket.send(JSON.stringify({ type: 'resize', cols, rows }));
  }

  dispose(): void {
    this.disposed = true;
    this.socket?.close();
    this.socket = null;
  }

  private async handleMessage(event: MessageEventLike): Promise<void> {
    const text = await this.messageDecoder(event.data);
    const control = parseSessionControlMessage(text);
    if (control) {
      this.onAttachTrace?.(control);
      return;
    }
    if (text.length > 0) {
      if (!this.sawFirstText) {
        this.sawFirstText = true;
        this.onFirstText?.();
      }
      this.onText?.(text);
    }
  }
}
