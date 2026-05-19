/**
 * @file vite-config.test.ts
 * @description 验证 Vite 生产构建配置满足 Electron file:// 加载约束。
 */

import { describe, expect, it } from 'vitest';
import type { ConfigEnv, UserConfig, UserConfigExport } from 'vite';
import viteConfig from '../vite.config';

/**
 * 解析当前仓库导出的 Vite 配置。
 * @returns Vite 用户配置对象
 */
async function resolveViteUserConfig(): Promise<UserConfig> {
  const configEnv: ConfigEnv = {
    command: 'build',
    mode: 'production',
    isSsrBuild: false,
    isPreview: false
  };

  if (typeof viteConfig === 'function') {
    return (await viteConfig(configEnv)) as UserConfig;
  }

  return (await Promise.resolve(viteConfig as UserConfigExport)) as UserConfig;
}

describe('vite config', () => {
  it('uses relative production asset paths for Electron loadFile', async () => {
    const config = await resolveViteUserConfig();

    expect(config.base).toBe('./');
  });
});
