import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dir, '..');
const versionFiles = ['package.json', path.join('web', 'package.json')] as const;
const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

type PackageJson = {
  version?: unknown;
  [key: string]: unknown;
};

export function readCanonicalVersion(root = repoRoot): string {
  const versions = versionFiles.map((relativePath) => readVersionFile(root, relativePath));
  const canonical = versions[0];
  for (const version of versions.slice(1)) {
    if (version !== canonical) {
      throw new Error(`version mismatch across package manifests: ${versions.join(', ')}`);
    }
  }
  return canonical;
}

export function setCanonicalVersion(version: string, root = repoRoot): string {
  assertSemver(version);
  for (const relativePath of versionFiles) {
    writeVersionFile(root, relativePath, version);
  }
  return version;
}

export function bumpPatchVersion(root = repoRoot): string {
  const current = readCanonicalVersion(root);
  const parsed = parseSemver(current);
  return setCanonicalVersion(`${parsed.major}.${parsed.minor}.${parsed.patch + 1}`, root);
}

export function parseSemver(version: string): { major: number; minor: number; patch: number } {
  const match = semverPattern.exec(version);
  if (!match) {
    throw new Error(`invalid semver version "${version}"`);
  }
  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
  };
}

function readVersionFile(root: string, relativePath: string): string {
  const absolutePath = path.join(root, relativePath);
  const parsed = JSON.parse(readFileSync(absolutePath, 'utf8')) as PackageJson;
  if (typeof parsed.version !== 'string') {
    throw new Error(`${relativePath} is missing a string "version" field`);
  }
  assertSemver(parsed.version);
  return parsed.version;
}

function writeVersionFile(root: string, relativePath: string, version: string): void {
  const absolutePath = path.join(root, relativePath);
  const parsed = JSON.parse(readFileSync(absolutePath, 'utf8')) as PackageJson;
  parsed.version = version;
  writeFileSync(absolutePath, `${JSON.stringify(parsed, null, 2)}\n`);
}

function assertSemver(version: string): void {
  if (!semverPattern.test(version)) {
    throw new Error(`expected plain semver x.y.z, received "${version}"`);
  }
}

function printUsage(): void {
  console.error('usage: bun run ./scripts/release-version.ts <current|set|bump> [args]');
}

if (import.meta.main) {
  const [command, subcommand] = process.argv.slice(2);

  try {
    switch (command) {
      case 'current':
        console.log(readCanonicalVersion());
        break;
      case 'set':
        if (!subcommand) {
          printUsage();
          process.exit(1);
        }
        console.log(setCanonicalVersion(subcommand));
        break;
      case 'bump':
        if (subcommand !== 'patch') {
          printUsage();
          process.exit(1);
        }
        console.log(bumpPatchVersion());
        break;
      default:
        printUsage();
        process.exit(1);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
