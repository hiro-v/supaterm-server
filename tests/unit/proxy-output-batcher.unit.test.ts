import { describe, expect, test } from 'bun:test';
import { createOutputBatcher } from '../../proxy/src/bridge/output-batcher';

describe('proxy output batcher', () => {
  test('flushes buffered output on the scheduled window', () => {
    const flushed: string[] = [];
    let scheduled: (() => void) | null = null;

    const batcher = createOutputBatcher({
      onFlush: (chunk) => {
        flushed.push(chunk);
      },
      scheduleTimeout: (callback) => {
        scheduled = callback;
        return 1 as ReturnType<typeof setTimeout>;
      },
      clearScheduledTimeout: () => {},
    });

    batcher.push('hello');
    batcher.push(' world');

    expect(flushed).toEqual([]);
    scheduled?.();
    expect(flushed).toEqual(['hello world']);
  });

  test('flushes immediately when the batch exceeds the size cap', () => {
    const flushed: string[] = [];

    const batcher = createOutputBatcher({
      onFlush: (chunk) => {
        flushed.push(chunk);
      },
      maxBufferedBytes: 5,
      scheduleTimeout: (() => 1) as typeof setTimeout,
      clearScheduledTimeout: () => {},
    });

    batcher.push('hello');
    expect(flushed).toEqual(['hello']);
  });
});
