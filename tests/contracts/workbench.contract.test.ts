import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  computeSessionShareToken,
  startServer,
  type StartedServer,
} from '../helpers/runtime';
import { createInitialWorkbenchState } from '../../web/src/workbench/state';

type WorkbenchSnapshot = {
  workbench_id: string;
  updated_at_unix_ms: number;
  state: ReturnType<typeof createInitialWorkbenchState>;
};

describe('workbench snapshot API contract', () => {
  const workbenchId = 'contract.workbench:v1';
  const shareSecret = 'contract-workbench-secret';
  const token = computeSessionShareToken(workbenchId, shareSecret);
  let server: StartedServer;

  beforeAll(async () => {
    server = await startServer({
      backend: 'local',
      tokenPolicy: 'session',
      shareTokenSecret: shareSecret,
      env: {
        SHELL: '/bin/sh',
      },
    });
  });

  afterAll(async () => {
    await server.stop();
  });

  test('snapshot endpoint requires the same session authorization policy', async () => {
    const response = await fetch(
      `${server.baseUrl}/api/workbench/${encodeURIComponent(workbenchId)}`,
    );

    expect(response.status).toBe(403);
    expect(await response.text()).toContain('Unauthorized');
  });

  test('put and get roundtrip preserves the shared workbench snapshot contract', async () => {
    const state = createInitialWorkbenchState(workbenchId);
    state.workspaces[0]!.name = 'Shared';
    state.workspaces[0]!.tabs[0]!.title = 'Patch';
    state.sidebarCollapsed = true;

    const putResponse = await fetch(
      `${server.baseUrl}/api/workbench/${encodeURIComponent(workbenchId)}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(state),
      },
    );
    expect(putResponse.status).toBe(204);

    const getResponse = await fetch(
      `${server.baseUrl}/api/workbench/${encodeURIComponent(workbenchId)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    expect(getResponse.status).toBe(200);

    const payload = await getResponse.json() as WorkbenchSnapshot;
    expect(Object.keys(payload).sort()).toEqual([
      'state',
      'updated_at_unix_ms',
      'workbench_id',
    ]);
    expect(payload.workbench_id).toBe(workbenchId);
    expect(payload.updated_at_unix_ms).toBeGreaterThan(0);
    expect(payload.state).toEqual(state);
  });
});
