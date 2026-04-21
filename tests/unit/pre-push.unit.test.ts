import { describe, expect, test } from 'bun:test';
import { getPrePushCommands, PRE_PUSH_COMMANDS } from '../../scripts/pre-push';

describe('pre-push checks', () => {
  test('runs the same critical non-browser gate used for local push validation', () => {
    expect(getPrePushCommands()).toEqual(PRE_PUSH_COMMANDS);
    expect(PRE_PUSH_COMMANDS).toEqual([
      ['bun', 'run', 'zig:lint'],
      ['zig', 'build', 'check'],
      ['bun', 'run', 'web:typecheck'],
      ['bun', 'run', 'proxy:typecheck'],
      ['bun', 'run', 'test:unit'],
      ['bun', 'run', 'test:integration'],
      ['bun', 'run', 'test:contract'],
      ['bun', 'run', 'test:e2e'],
      ['bun', 'run', 'web:build'],
    ]);
  });
});
