import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dir, '../..');

describe('CI and hook configuration', () => {
  test('pre-commit hook delegates to the checked-in script entrypoint', () => {
    const hook = readRepoFile('.git-hooks/pre-commit');

    expect(hook).toContain('exec bun run ./scripts/pre-commit.ts');
  });

  test('test workflow covers macOS and Linux with recursive submodules and cache setup', () => {
    const workflow = readRepoFile('.github/workflows/test.yml');

    expect(workflow).toContain('ubuntu-latest');
    expect(workflow).toContain('macos-latest');
    expect(workflow).toContain('FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: "true"');
    expect(workflow).toContain('submodules: recursive');
    expect(workflow).toContain('uses: ./.github/actions/setup-ci');
    expect(workflow).toContain('bun run test:unit');
    expect(workflow).toContain('bun run test:integration');
    expect(workflow).toContain('bun run test:contract');
    expect(workflow).toContain('bun run test:e2e');
    expect(workflow).not.toContain('name: browser (${{ matrix.os }}, ${{ matrix.shard }})');
    expect(workflow).not.toContain('SUPATERM_PLAYWRIGHT_SHARD: ${{ matrix.shard }}');
    expect(workflow).not.toContain('shard: 1/2');
    expect(workflow).not.toContain('shard: 2/2');
    expect(workflow).toContain('name: perf report (ubuntu-latest)');
    expect(workflow).toContain('continue-on-error: true');
    expect(workflow).toContain('GH_TOKEN: ${{ github.token }}');
    expect(workflow).toContain('name: Resolve perf baseline source');
    expect(workflow).toContain('mkdir -p .agent-harness/artifacts');
    expect(workflow).toContain('git fetch --no-tags --depth=1 origin "${{ github.base_ref }}"');
    expect(workflow).toContain('git show "origin/${{ github.base_ref }}:.agent-harness/artifacts/perf-baseline.json"');
    expect(workflow).toContain('elif [ -f .agent-harness/artifacts/perf-baseline.json ]; then');
    expect(workflow).toContain('baseline_source=generated-fallback');
    expect(workflow).toContain('name: Ensure perf baseline exists');
    expect(workflow).toContain("if: steps.perf_baseline.outputs.baseline_source == 'generated-fallback'");
    expect(workflow).toContain('SUPATERM_PERF_OUTPUT_PATH=.agent-harness/artifacts/perf-baseline.base.json');
    expect(workflow).toContain('SUPATERM_PERF_SAMPLES=1 bun run perf:current');
    expect(workflow).toContain('bun run perf:check');
    expect(workflow).toContain('SUPATERM_PERF_BASELINE_PATH=.agent-harness/artifacts/perf-baseline.base.json');
    expect(workflow).toContain('actions/upload-artifact@v7');
    expect(workflow).toContain('GITHUB_STEP_SUMMARY');
    expect(workflow).toContain('PERF_BASELINE_SOURCE');
    expect(workflow).toContain('perf check report was not generated; collection timed out or failed before writing artifacts.');
    expect(workflow).toContain('formatTrend(report.comparisons.shellReadyMs)');
    expect(workflow).toContain('formatTrend(report.comparisons.startup.workbenchMountedMs)');
    expect(workflow).toContain('formatTrend(report.comparisons.startup.rendererReadyMs)');
    expect(workflow).toContain('formatTrend(report.comparisons.startup.websocketOpenMs)');
    expect(workflow).toContain('formatTrend(report.comparisons.startup.firstTerminalBytesMs)');
    expect(workflow).toContain('formatTrend(report.comparisons.startup.firstPaneConnectedMarkMs)');
    expect(workflow).toContain('formatTrend(report.comparisons.startup.serverOutputPumpStartedMs)');
    expect(workflow).toContain('formatTrend(report.comparisons.startup.serverFirstBackendReadMs)');
    expect(workflow).toContain('formatTrend(report.comparisons.startup.serverFirstBroadcastMs)');
    expect(workflow).toContain('vs ${trend.baseline}${trend.unit}');
    expect(workflow).toContain('.agent-harness/artifacts/perf-baseline.base.json');
    expect(workflow).toContain('.agent-harness/artifacts/perf-current.json');
    expect(workflow).toContain('.agent-harness/artifacts/perf-check.json');
    expect(workflow).toContain('if-no-files-found: warn');
    expect(workflow).toContain('renderer atlas resets');
    expect(workflow).toContain('rect buffer capacity');
    expect(workflow).toContain('glyph buffer capacity');
  });

  test('shared setup action restores Bun, Zig, and Playwright caches', () => {
    const action = readRepoFile('.github/actions/setup-ci/action.yml');

    expect(action).toContain('oven-sh/setup-bun@v2');
    expect(action).toContain('mlugg/setup-zig@v2.2.1');
    expect(action).toContain('actions/cache@v5');
    expect(action).toContain('~/.bun/install/cache');
    expect(action).toContain('~/.cache/zig');
    expect(action).toContain('~/.cache/ms-playwright');
    expect(action).toContain('.tooling/zlint/zig-out');
    expect(action).toContain('third_party/zmx/.zig-cache');
    expect(action).toContain('cd web');
    expect(action).toContain('bun install --frozen-lockfile');
    expect(action).toContain('third_party/libghostty/node_modules');
    expect(action).toContain('cd third_party/libghostty');
    expect(action).toContain('git clone --depth=1 https://github.com/DonIsaac/zlint.git .tooling/zlint');
    expect(action).toContain('ZLINT_BIN=${GITHUB_WORKSPACE}/.tooling/zlint/zig-out/bin/zlint');
  });

  test('browser test script self-hosts the app instead of assuming port 3000 is already in use', () => {
    const packageJson = readRepoFile('package.json');
    const browserScript = readRepoFile('scripts/test-browser.ts');
    const libghosttyIgnore = readRepoFile('third_party/libghostty/.gitignore');

    expect(packageJson).toContain('"test:browser": "bun run ./scripts/test-browser.ts"');
    expect(packageJson).toContain('"web:build": "bun run libghosty:apply');
    expect(browserScript).toContain('startServer({');
    expect(browserScript).toContain('ensureWebBuilt()');
    expect(browserScript).toContain("SUPATERM_BASE_URL: server.baseUrl");
    expect(libghosttyIgnore).not.toContain('ghostty-vt.wasm');
  });

  test('local Linux Docker tooling exists for dev parity without moving CI onto Docker', () => {
    const packageJson = readRepoFile('package.json');
    const compose = readRepoFile('compose.yml');
    const dockerfile = readRepoFile('Dockerfile.dev');
    const wrapper = readRepoFile('scripts/docker-linux-dev.sh');
    const workflow = readRepoFile('.github/workflows/test.yml');

    expect(packageJson).toContain('"docker:linux:check": "sh ./scripts/docker-linux-dev.sh check"');
    expect(packageJson).toContain('"docker:linux:test": "sh ./scripts/docker-linux-dev.sh test"');
    expect(compose).toContain('linux-dev:');
    expect(compose).toContain('dockerfile: Dockerfile.dev');
    expect(dockerfile).toContain('ubuntu:24.04');
    expect(dockerfile).toContain('https://mise.run');
    expect(wrapper).toContain('docker compose run --rm linux-dev');
    expect(wrapper).toContain('mise trust mise.toml && mise install && mise run check');
    expect(workflow).not.toContain('container:');
    expect(workflow).toContain('runs-on: ${{ matrix.os }}');
  });

  test('tip release workflow force-moves the tip tag and updates the prerelease', () => {
    const workflow = readRepoFile('.github/workflows/release-tip.yml');

    expect(workflow).toContain('FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: "true"');
    expect(workflow).toContain('git tag -fa tip');
    expect(workflow).toContain('git push --force origin tip');
    expect(workflow).toContain('gh release create tip');
    expect(workflow).toContain('gh release edit tip');
    expect(workflow).toContain('--prerelease');
    expect(workflow).toContain('actions/checkout@v6');
    expect(workflow).toContain('actions/upload-artifact@v7');
    expect(workflow).toContain('actions/download-artifact@v8');
  });

  test('nightly release workflow bumps patch semver on a midnight GMT schedule and ships macOS/Linux binaries', () => {
    const workflow = readRepoFile('.github/workflows/release-nightly.yml');

    expect(workflow).toContain('cron: "0 0 * * *"');
    expect(workflow).toContain('workflow_dispatch: {}');
    expect(workflow).toContain('FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: "true"');
    expect(workflow).toContain('bun run --silent version:bump:patch');
    expect(workflow).toContain('git commit -m "chore(release): bump nightly version to ${VERSION}"');
    expect(workflow).toContain('TAG="v${VERSION}-nightly"');
    expect(workflow).toContain('ubuntu-latest');
    expect(workflow).toContain('macos-latest');
    expect(workflow).toContain('zig build --release=small -Dembed-assets=true');
    expect(workflow).toContain('sh ./scripts/package-release.sh "${{ needs.prepare.outputs.version }}"');
    expect(workflow).toContain('gh release create "${{ needs.prepare.outputs.tag }}"');
    expect(workflow).toContain('--prerelease');
    expect(workflow).toContain('actions/checkout@v6');
    expect(workflow).toContain('actions/upload-artifact@v7');
    expect(workflow).toContain('actions/download-artifact@v8');
  });

  test('production release workflow tags the current semver version and publishes a GitHub release', () => {
    const workflow = readRepoFile('.github/workflows/release-prod.yml');

    expect(workflow).toContain('workflow_dispatch: {}');
    expect(workflow).toContain('FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: "true"');
    expect(workflow).toContain('bun run --silent version:current');
    expect(workflow).toContain('TAG="v${VERSION}"');
    expect(workflow).toContain('git tag -a "${TAG}"');
    expect(workflow).toContain('git push origin "${TAG}"');
    expect(workflow).toContain('ubuntu-latest');
    expect(workflow).toContain('macos-latest');
    expect(workflow).toContain('zig build --release=small -Dembed-assets=true');
    expect(workflow).toContain('sh ./scripts/package-release.sh "${{ needs.prepare.outputs.version }}"');
    expect(workflow).toContain('gh release create "${{ needs.prepare.outputs.tag }}"');
    expect(workflow).not.toContain('--prerelease');
    expect(workflow).toContain('actions/checkout@v6');
    expect(workflow).toContain('actions/upload-artifact@v7');
    expect(workflow).toContain('actions/download-artifact@v8');
  });
});

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}
