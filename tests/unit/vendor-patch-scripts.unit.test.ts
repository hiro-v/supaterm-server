import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const createdRoots: string[] = [];

afterEach(() => {
  for (const root of createdRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('vendor patch scripts', () => {
  test('libghosty patch workflow can patch and reapply upstream submodule changes with injected paths', () => {
    const root = createTempRoot('libghosty-script-');
    const packageRoot = path.join(root, 'third_party/libghostty');
    const ghosttyRoot = path.join(packageRoot, 'ghostty');
    const sourceFile = path.join(ghosttyRoot, 'src/sample.zig');
    const patchDir = path.join(root, 'patches/libghosty');
    const patchFile = path.join(patchDir, 'libghosty.patch');

    mkdirSync(path.dirname(sourceFile), { recursive: true });
    writeFileSync(sourceFile, 'const value = "before";\n');

    mkdirSync(ghosttyRoot, { recursive: true });
    initGitRepo(ghosttyRoot, ['src/sample.zig']);

    writeFileSync(sourceFile, 'const value = "after";\n');
    runScript('scripts/libghosty-patch.sh', ['patch'], {
      SUPATERM_ROOT_OVERRIDE: root,
      SUPATERM_LIBGHOSTTY_PATCH_DIR: patchDir,
      SUPATERM_LIBGHOSTTY_GHOSTTY_PATH: ghosttyRoot,
    });

    expect(readFileSync(patchFile, 'utf8')).toContain('src/sample.zig');

    writeFileSync(sourceFile, 'const value = "before";\n');
    runScript('scripts/libghosty-patch.sh', ['apply'], {
      SUPATERM_ROOT_OVERRIDE: root,
      SUPATERM_LIBGHOSTTY_PATCH_DIR: patchDir,
      SUPATERM_LIBGHOSTTY_GHOSTTY_PATH: ghosttyRoot,
    });

    expect(readFileSync(sourceFile, 'utf8')).toContain('"after"');
  });

  test('zmx patch workflow can patch and reapply submodule changes with injected paths', () => {
    const root = createTempRoot('zmx-script-');
    const zmxRoot = path.join(root, 'third_party/zmx');
    const sourceFile = path.join(zmxRoot, 'src/sample.zig');
    const patchDir = path.join(root, 'patches/zmx');
    const patchFile = path.join(patchDir, 'zmx.patch');

    mkdirSync(path.dirname(sourceFile), { recursive: true });
    writeFileSync(sourceFile, 'const value = "before";\n');
    initGitRepo(zmxRoot, ['src/sample.zig']);

    writeFileSync(sourceFile, 'const value = "after";\n');
    runScript('scripts/zmx-patch.sh', ['patch'], {
      SUPATERM_ROOT_OVERRIDE: root,
      SUPATERM_ZMX_SUBMODULE_PATH: zmxRoot,
      SUPATERM_ZMX_PATCH_DIR: patchDir,
    });

    expect(readFileSync(patchFile, 'utf8')).toContain('src/sample.zig');

    writeFileSync(sourceFile, 'const value = "before";\n');
    runScript('scripts/zmx-patch.sh', ['apply'], {
      SUPATERM_ROOT_OVERRIDE: root,
      SUPATERM_ZMX_SUBMODULE_PATH: zmxRoot,
      SUPATERM_ZMX_PATCH_DIR: patchDir,
    });

    expect(readFileSync(sourceFile, 'utf8')).toContain('"after"');
  });
});

function createTempRoot(prefix: string): string {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  createdRoots.push(root);
  return root;
}

function initGitRepo(cwd: string, paths: string[]): void {
  runGit(cwd, ['init']);
  runGit(cwd, ['config', 'user.email', 'codex@example.com']);
  runGit(cwd, ['config', 'user.name', 'Codex']);
  runGit(cwd, ['add', ...paths]);
  runGit(cwd, ['commit', '-m', 'initial']);
}

function runGit(cwd: string, args: string[]): void {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`);
  }
}

function runScript(scriptPath: string, args: string[], env: Record<string, string>): void {
  const repoRoot = path.resolve(import.meta.dir, '../..');
  const result = spawnSync('sh', [path.join(repoRoot, scriptPath), ...args], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    stdio: 'pipe',
  });

  if (result.status !== 0) {
    throw new Error(`${scriptPath} ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`);
  }
}
