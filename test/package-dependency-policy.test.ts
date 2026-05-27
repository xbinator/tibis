/**
 * @file package-dependency-policy.test.ts
 * @description 校验 package.json 中与原生模块安装相关的依赖策略。
 */
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

/**
 * package.json 中关心的字段。
 */
interface PackageManifest {
  /** npm scripts 配置。 */
  scripts?: Record<string, string>;
  /** 运行时依赖配置。 */
  dependencies?: Record<string, string>;
  /** pnpm 专属配置。 */
  pnpm?: {
    /** pnpm 依赖补丁配置。 */
    patchedDependencies?: Record<string, string>;
  };
}

/**
 * 读取 Shell runner 源码。
 * @returns Shell runner 源码文本
 */
async function readShellRunnerSource(): Promise<string> {
  return readFile(new URL('../electron/main/modules/shell/runner.mts', import.meta.url), 'utf8');
}

/**
 * 读取当前仓库的 package.json。
 * @returns package.json 的结构化内容
 */
async function readPackageManifest(): Promise<PackageManifest> {
  const content = await readFile(new URL('../package.json', import.meta.url), 'utf8');
  return JSON.parse(content) as PackageManifest;
}

/**
 * 读取当前仓库的 pnpm lockfile 文本。
 * @returns pnpm-lock.yaml 的文本内容
 */
async function readPnpmLockfile(): Promise<string> {
  return readFile(new URL('../pnpm-lock.yaml', import.meta.url), 'utf8');
}

describe('package dependency policy', () => {
  it('keeps native tree-sitter out of the runtime dependency graph', async () => {
    const manifest = await readPackageManifest();
    const lockfile = await readPnpmLockfile();

    expect(manifest.dependencies).not.toHaveProperty('tree-sitter');
    expect(manifest.pnpm?.patchedDependencies ?? {}).not.toHaveProperty('tree-sitter@0.25.0');
    expect(lockfile).not.toContain('tree-sitter@0.25.0:');
  });

  it('rebuilds only Electron native modules that are used through native bindings', async () => {
    const manifest = await readPackageManifest();

    expect(manifest.scripts?.postinstall).toBe('electron-rebuild --only better-sqlite3');
  });

  it('keeps effect top-level entry out of the Electron runtime graph', async () => {
    const manifest = await readPackageManifest();
    const shellRunnerSource = await readShellRunnerSource();

    expect(shellRunnerSource).not.toContain("from 'effect'");
    expect(manifest.dependencies).not.toHaveProperty('effect');
    expect(manifest.dependencies).not.toHaveProperty('@effect/platform');
    expect(manifest.dependencies).not.toHaveProperty('@effect/platform-node');
  });
});
