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
    expect(workflow).toContain('submodules: recursive');
    expect(workflow).toContain('uses: ./.github/actions/setup-ci');
    expect(workflow).toContain('bun run test:unit');
    expect(workflow).toContain('bun run test:integration');
    expect(workflow).toContain('bun run test:contract');
    expect(workflow).toContain('bun run test:e2e');
    expect(workflow).toContain('bun run test:browser');
  });

  test('shared setup action restores Bun, Zig, and Playwright caches', () => {
    const action = readRepoFile('.github/actions/setup-ci/action.yml');

    expect(action).toContain('oven-sh/setup-bun@v2');
    expect(action).toContain('mlugg/setup-zig@v2');
    expect(action).toContain('actions/cache@v4');
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

  test('tip release workflow force-moves the tip tag and updates the prerelease', () => {
    const workflow = readRepoFile('.github/workflows/release-tip.yml');

    expect(workflow).toContain('git tag -fa tip');
    expect(workflow).toContain('git push --force origin tip');
    expect(workflow).toContain('gh release create tip');
    expect(workflow).toContain('gh release edit tip');
    expect(workflow).toContain('--prerelease');
  });
});

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}
