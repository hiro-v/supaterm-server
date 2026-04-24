import { describe, expect, test } from 'bun:test';
import { planPreCommit, selectWebTypecheckCommand } from '../../scripts/pre-commit';

describe('pre-commit planning', () => {
  test('skips when no files are staged', () => {
    expect(planPreCommit([])).toEqual({
      stagedFiles: [],
      runWebChecks: false,
      runZigChecks: false,
      skip: true,
    });
  });

  test('skips for docs-only changes', () => {
    const plan = planPreCommit([
      'README.md',
      'docs/architecture.md',
      '.agent/skills/web-ui.md',
    ]);

    expect(plan.skip).toBe(true);
    expect(plan.runWebChecks).toBe(false);
    expect(plan.runZigChecks).toBe(false);
  });

  test('runs web checks for web and patch workflow changes', () => {
    const plan = planPreCommit([
      'web/src/workbench.ts',
      'scripts/libghosty-patch.sh',
    ]);

    expect(plan.skip).toBe(false);
    expect(plan.runWebChecks).toBe(true);
    expect(plan.runZigChecks).toBe(false);
  });

  test('runs web checks for proxy workspace changes', () => {
    const plan = planPreCommit(['proxy/src/index.ts']);

    expect(plan.skip).toBe(false);
    expect(plan.runWebChecks).toBe(true);
    expect(plan.runZigChecks).toBe(false);
  });

  test('runs zig checks for runtime and zmx changes', () => {
    const plan = planPreCommit([
      'src/main.zig',
      'third_party/zmx/src/main.zig',
    ]);

    expect(plan.skip).toBe(false);
    expect(plan.runWebChecks).toBe(false);
    expect(plan.runZigChecks).toBe(true);
  });

  test('runs both check sets for workflow-level changes', () => {
    const plan = planPreCommit(['.github/workflows/test.yml']);

    expect(plan.skip).toBe(false);
    expect(plan.runWebChecks).toBe(true);
    expect(plan.runZigChecks).toBe(true);
  });

  test('runs web checks for hook and shared action changes', () => {
    const hookPlan = planPreCommit(['.git-hooks/pre-commit']);
    expect(hookPlan.skip).toBe(false);
    expect(hookPlan.runWebChecks).toBe(true);
    expect(hookPlan.runZigChecks).toBe(false);

    const actionPlan = planPreCommit(['.github/actions/setup-ci/action.yml']);
    expect(actionPlan.skip).toBe(false);
    expect(actionPlan.runWebChecks).toBe(true);
    expect(actionPlan.runZigChecks).toBe(false);
  });

  test('uses a direct web typecheck when the libghostty upstream submodule is not initialized', () => {
    expect(selectWebTypecheckCommand(false)).toEqual(['bun', 'run', 'web:typecheck:fast']);
    expect(selectWebTypecheckCommand(true)).toEqual(['bun', 'run', 'web:typecheck']);
  });
});
