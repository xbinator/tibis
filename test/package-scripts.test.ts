/**
 * @file package-scripts.test.ts
 * @description 验证 package.json 中的脚本声明满足当前仓库的跨平台执行要求。
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * package.json 中与仓库校验相关的清单数据结构。
 */
interface PackageScriptsManifest {
  /** npm scripts 映射表。 */
  scripts?: Record<string, string>;
  /** 生产依赖映射表。 */
  dependencies?: Record<string, string>;
}

/**
 * 读取仓库根目录 package.json 的脚本配置。
 * @returns package.json 中的 scripts 配置对象
 */
function readPackageScripts(): PackageScriptsManifest {
  const packageJsonPath = resolve(process.cwd(), 'package.json');
  const packageJsonContent = readFileSync(packageJsonPath, 'utf8');

  return JSON.parse(packageJsonContent) as PackageScriptsManifest;
}

describe('package scripts', () => {
  it('uses a cross-platform test command', () => {
    const manifest = readPackageScripts();

    expect(manifest.scripts?.test).toBe('cross-env HOST=127.0.0.1 vitest run');
  });

  it('disables implicit electron-builder publishing during package builds', () => {
    const manifest = readPackageScripts();

    expect(manifest.scripts?.['electron:build']).toBe('pnpm run build && pnpm run electron:build-main && electron-builder --publish never');
  });

  it('cleans stale electron main output before compiling', () => {
    const manifest = readPackageScripts();

    expect(manifest.scripts?.['electron:build-main']).toBe('node scripts/clean-dist-electron.mjs && tsc -p electron/tsconfig.json');
  });

  it('declares speech manifest helper scripts', () => {
    const manifest = readPackageScripts();

    expect(manifest.scripts?.['speech:dev:prepare']).toBe('node ./scripts/speech/dev-runtime.mjs prepare');
    expect(manifest.scripts?.['speech:dev:serve']).toBe('node ./scripts/speech/dev-runtime.mjs serve');
    expect(manifest.scripts?.['speech:dev:start']).toBe(
      'concurrently -k "pnpm run speech:dev:serve" "cross-env TIBIS_SPEECH_RUNTIME_MANIFEST_URL=http://127.0.0.1:8787/manifest.json pnpm dev"'
    );
    expect(manifest.scripts?.['speech:manifest:fill']).toBe('node ./scripts/speech/manifest-tool.mjs fill');
    expect(manifest.scripts?.['speech:manifest:hash']).toBe('node ./scripts/speech/manifest-tool.mjs hash');
    expect(manifest.scripts?.['speech:manifest:localize']).toBe('node ./scripts/speech/manifest-tool.mjs localize');
    expect(manifest.scripts?.['speech:manifest:validate']).toBe('node ./scripts/speech/manifest-tool.mjs validate');
  });
});

describe('package runtime dependencies', () => {
  it('declares AI SDK runtime transitive packages needed by electron-builder', () => {
    const manifest = readPackageScripts();

    expect(manifest.dependencies?.['@ai-sdk/provider']).toBeDefined();
    expect(manifest.dependencies?.['@ai-sdk/provider-utils']).toBeDefined();
    expect(manifest.dependencies?.['@ai-sdk/gateway']).toBeDefined();
    expect(manifest.dependencies?.['@opentelemetry/api']).toBeDefined();
    expect(manifest.dependencies?.['@standard-schema/spec']).toBeDefined();
    expect(manifest.dependencies?.['eventsource-parser']).toBeDefined();
    expect(manifest.dependencies?.zod).toBeDefined();
  });

  it('declares Tavily form-data dependency closure needed by packaged Electron runtime', () => {
    const manifest = readPackageScripts();

    expect(manifest.dependencies?.['form-data']).toBeDefined();
    expect(manifest.dependencies?.asynckit).toBeDefined();
    expect(manifest.dependencies?.['call-bind-apply-helpers']).toBeDefined();
    expect(manifest.dependencies?.['combined-stream']).toBeDefined();
    expect(manifest.dependencies?.['delayed-stream']).toBeDefined();
    expect(manifest.dependencies?.['dunder-proto']).toBeDefined();
    expect(manifest.dependencies?.['es-define-property']).toBeDefined();
    expect(manifest.dependencies?.['es-errors']).toBeDefined();
    expect(manifest.dependencies?.['es-set-tostringtag']).toBeDefined();
    expect(manifest.dependencies?.['es-object-atoms']).toBeDefined();
    expect(manifest.dependencies?.['function-bind']).toBeDefined();
    expect(manifest.dependencies?.['get-intrinsic']).toBeDefined();
    expect(manifest.dependencies?.['get-proto']).toBeDefined();
    expect(manifest.dependencies?.gopd).toBeDefined();
    expect(manifest.dependencies?.['has-symbols']).toBeDefined();
    expect(manifest.dependencies?.['has-tostringtag']).toBeDefined();
    expect(manifest.dependencies?.hasown).toBeDefined();
    expect(manifest.dependencies?.['math-intrinsics']).toBeDefined();
    expect(manifest.dependencies?.['mime-types']).toBeDefined();
    expect(manifest.dependencies?.['mime-db']).toBeDefined();
  });
});
