const DEFAULT_FLUSH_DELAY_MS = 25;
const DEFAULT_MAX_BUFFERED_BYTES = 4_096;

type TimeoutHandle = ReturnType<typeof setTimeout>;

export type OutputBatcher = {
  push: (chunk: string) => void;
  flush: () => void;
  stop: () => void;
};

export type OutputBatcherOptions = {
  onFlush: (chunk: string) => void;
  flushDelayMs?: number;
  maxBufferedBytes?: number;
  scheduleTimeout?: (callback: () => void, delayMs: number) => TimeoutHandle;
  clearScheduledTimeout?: (handle: TimeoutHandle) => void;
};

export function createOutputBatcher(options: OutputBatcherOptions): OutputBatcher {
  const flushDelayMs = options.flushDelayMs ?? DEFAULT_FLUSH_DELAY_MS;
  const maxBufferedBytes = options.maxBufferedBytes ?? DEFAULT_MAX_BUFFERED_BYTES;
  const scheduleTimeout = options.scheduleTimeout ?? setTimeout;
  const clearScheduledTimeout = options.clearScheduledTimeout ?? clearTimeout;
  const encoder = new TextEncoder();

  let buffered = '';
  let bufferedBytes = 0;
  let timer: TimeoutHandle | null = null;

  const flush = () => {
    clearTimer();
    if (buffered.length === 0) return;

    const chunk = buffered;
    buffered = '';
    bufferedBytes = 0;
    options.onFlush(chunk);
  };

  const clearTimer = () => {
    if (timer == null) return;
    clearScheduledTimeout(timer);
    timer = null;
  };

  return {
    push: (chunk) => {
      if (chunk.length === 0) return;

      buffered += chunk;
      bufferedBytes += encoder.encode(chunk).byteLength;
      if (bufferedBytes >= maxBufferedBytes) {
        flush();
        return;
      }

      if (timer == null) {
        timer = scheduleTimeout(flush, flushDelayMs);
      }
    },
    flush,
    stop: flush,
  };
}
