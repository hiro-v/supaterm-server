import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bumpPatchVersion, parseSemver, readCanonicalVersion, setCanonicalVersion } from '../../scripts/release-version';

describe('release-version', () => {
  test('reads and bumps the shared patch version across root and web package manifests', () => {
    const repoRoot = createTempRepo('1.2.3');

    expect(readCanonicalVersion(repoRoot)).toBe('1.2.3');
    expect(bumpPatchVersion(repoRoot)).toBe('1.2.4');
    expect(readCanonicalVersion(repoRoot)).toBe('1.2.4');
  });

  test('sets the shared version across both manifests', () => {
    const repoRoot = createTempRepo('0.0.1');

    expect(setCanonicalVersion('0.0.9', repoRoot)).toBe('0.0.9');
    expect(JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version).toBe('0.0.9');
    expect(JSON.parse(readFileSync(path.join(repoRoot, 'web/package.json'), 'utf8')).version).toBe('0.0.9');
  });

  test('parseSemver rejects non-plain semver values', () => {
    expect(() => parseSemver('1.2')).toThrow();
    expect(() => parseSemver('1.2.3-beta.1')).toThrow();
    expect(parseSemver('2.3.4')).toEqual({ major: 2, minor: 3, patch: 4 });
  });
});

function createTempRepo(version: string): string {
  const repoRoot = mkdtempSync(path.join(os.tmpdir(), 'supaterm-version-'));
  mkdirSync(path.join(repoRoot, 'web'));
  writePackage(path.join(repoRoot, 'package.json'), version);
  writePackage(path.join(repoRoot, 'web/package.json'), version);
  return repoRoot;
}

function writePackage(targetPath: string, version: string): void {
  writeFileSync(targetPath, `${JSON.stringify({ name: 'supaterm-server', version }, null, 2)}\n`);
}
