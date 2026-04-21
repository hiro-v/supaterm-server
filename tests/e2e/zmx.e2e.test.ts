import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  computeSessionShareToken,
  ensureZmxBuilt,
  fetchJson,
  openTerminalSession,
  openTerminalSessionWithTrace,
  startServer,
  type StartedServer,
} from '../helpers/runtime';
import type { WorkbenchState } from '../../web/src/workbench/state';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

describe('zmx e2e', () => {
  const sessionId = 'e2e.zmx:v1';
  const reconnectSessionId = 'e2e.zmx.reconnect:v1';
  const shareSecret = 'e2e-secret';
  let server: StartedServer;
  let tmpDir = '';

  beforeAll(async () => {
    await ensureZmxBuilt();
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'supaterm-zmx-e2e-'));
    server = await startServer({
      backend: 'zmx',
      enableShareApi: true,
      tokenPolicy: 'session',
      shareTokenSecret: shareSecret,
      zmxSocketDir: tmpDir,
      env: { ZMX_DIR: tmpDir },
    });
  }, 30_000);

  afterAll(async () => {
    if (server) {
      await server.stop();
    }
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('runs a full zmx-backed shared terminal round-trip', async () => {
    const { payload } = await fetchJson<{ token: string }>(
      `${server.baseUrl}/api/sessions/${encodeURIComponent(sessionId)}/share`,
    );
    expect(payload.token).toBe(computeSessionShareToken(sessionId, shareSecret));

    const transcript = await openTerminalSession({
      port: server.port,
      sessionId,
      token: payload.token,
      command: "printf '__ZMX_E2E_OK__\\n'",
      timeoutMs: 20_000,
    });
    expect(transcript).toContain('__ZMX_E2E_OK__');
  });

  test('reconnects to the same zmx session after websocket disconnect', async () => {
    const token = computeSessionShareToken(reconnectSessionId, shareSecret);
    await Bun.sleep(1_000);

    const first = await openTerminalSessionWithTrace({
      port: server.port,
      sessionId: reconnectSessionId,
      token,
      command: "printf '__ZMX_RECONNECT_FIRST__\\n'",
      completionMarker: '__ZMX_RECONNECT_FIRST_DONE__',
      timeoutMs: 20_000,
    });
    expect(first.transcript).toContain('__ZMX_RECONNECT_FIRST__');
    expect(first.attachTrace?.session_reused).toBeFalse();

    await Bun.sleep(1_000);
    const second = await openTerminalSessionWithTrace({
      port: server.port,
      sessionId: reconnectSessionId,
      token,
      command: "printf '__ZMX_RECONNECT_SECOND__\\n'",
      completionMarker: '__ZMX_RECONNECT_SECOND_DONE__',
      delayBeforeCommandMs: 750,
      timeoutMs: 20_000,
    });
    expect(second.transcript).toContain('__ZMX_RECONNECT_SECOND__');
  });

  test('restores persisted workbench layout and reattaches zmx panes by stable pane session ids', async () => {
    const workbenchId = 'e2e.zmx.workbench:v1';
    const workspaceId = 'ws.e2e.zmx';
    const tabId = 'tab.shared';
    const paneId = 'pane.console';
    const paneSessionId = `${workspaceId}.${tabId}.${paneId}`;
    const workbenchToken = computeSessionShareToken(workbenchId, shareSecret);

    const state: WorkbenchState = {
      workspaces: [
        {
          id: workspaceId,
          name: 'Shared',
          activeTabId: tabId,
          tabs: [
            {
              id: tabId,
              title: 'Review',
              activePaneId: paneId,
              root: {
                kind: 'pane',
                id: paneId,
                title: 'Console',
              },
            },
          ],
        },
      ],
      activeWorkspaceId: workspaceId,
      sidebarCollapsed: false,
    };

    const putResponse = await fetch(
      `${server.baseUrl}/api/workbench/${encodeURIComponent(workbenchId)}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${workbenchToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(state),
      },
    );
    expect(putResponse.status).toBe(204);

    const { payload: shareGrant } = await fetchJson<{ token: string }>(
      `${server.baseUrl}/api/sessions/${encodeURIComponent(paneSessionId)}/share`,
    );
    expect(shareGrant.token).toBe(computeSessionShareToken(paneSessionId, shareSecret));

    const first = await openTerminalSessionWithTrace({
      port: server.port,
      sessionId: paneSessionId,
      token: shareGrant.token,
      command: "printf '__ZMX_LAYOUT_RESTORE__\\n'",
      completionMarker: '__ZMX_LAYOUT_RESTORE_DONE__',
      timeoutMs: 20_000,
    });
    expect(first.transcript).toContain('__ZMX_LAYOUT_RESTORE__');

    const getResponse = await fetch(
      `${server.baseUrl}/api/workbench/${encodeURIComponent(workbenchId)}`,
      {
        headers: {
          Authorization: `Bearer ${workbenchToken}`,
        },
      },
    );
    expect(getResponse.status).toBe(200);
    const payload = await getResponse.json() as { state: WorkbenchState };
    expect(payload.state).toEqual(state);

    await Bun.sleep(1_000);
    const second = await openTerminalSessionWithTrace({
      port: server.port,
      sessionId: paneSessionId,
      token: shareGrant.token,
      command: "printf '__ZMX_LAYOUT_RESTORE_SECOND__\\n'",
      completionMarker: '__ZMX_LAYOUT_RESTORE_SECOND_DONE__',
      delayBeforeCommandMs: 750,
      timeoutMs: 20_000,
    });
    expect(second.transcript).toContain('__ZMX_LAYOUT_RESTORE_SECOND__');
  });

  test('attaches to an existing raw zmx session name without creating a hashed alias', async () => {
    const rawSessionId = 'existing-raw';
    const hashedAlias = `sess-${createHash('sha256').update(rawSessionId).digest('hex').slice(0, 16)}`;
    const bootstrap = spawnSync(
      path.join(process.cwd(), 'third_party', 'zmx', 'zig-out', 'bin', 'zmx'),
      [
        'bootstrap',
        rawSessionId,
        '/bin/sh',
        '-c',
        "printf '__RAW_EXISTING__\\n'; exec /bin/sh",
      ],
      {
        env: {
          ...process.env,
          ZMX_DIR: tmpDir,
        },
        encoding: 'utf8',
      },
    );
    expect(bootstrap.status).toBe(0);

    await Bun.sleep(500);

    const token = computeSessionShareToken(rawSessionId, shareSecret);
    const attached = await openTerminalSessionWithTrace({
      port: server.port,
      sessionId: rawSessionId,
      token,
      command: "printf '__RAW_ATTACH__\\n'",
      completionMarker: '__RAW_ATTACH_DONE__',
      delayBeforeCommandMs: 750,
      timeoutMs: 20_000,
    });
    expect(attached.transcript).toContain('__RAW_ATTACH__');

    const listed = spawnSync(
      path.join(process.cwd(), 'third_party', 'zmx', 'zig-out', 'bin', 'zmx'),
      ['list', '--short'],
      {
        env: {
          ...process.env,
          ZMX_DIR: tmpDir,
        },
        encoding: 'utf8',
      },
    );
    expect(listed.status).toBe(0);
    expect(listed.stdout).toContain(rawSessionId);
    expect(listed.stdout).not.toContain(hashedAlias);

    const history = spawnSync(
      path.join(process.cwd(), 'third_party', 'zmx', 'zig-out', 'bin', 'zmx'),
      ['history', rawSessionId],
      {
        env: {
          ...process.env,
          ZMX_DIR: tmpDir,
        },
        encoding: 'utf8',
      },
    );
    expect(history.status).toBe(0);
    expect(history.stdout).toContain('__RAW_ATTACH__');
    expect(history.stdout).not.toContain(hashedAlias);
  });
});
