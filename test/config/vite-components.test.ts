/**
 * @file vite-components.test.ts
 * @description 验证 Vite 自动组件目录包含当前组件目录。
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * 读取 Vite 配置源码。
 * @returns Vite 配置源码
 */
function readViteConfigSource(): string {
  return readFileSync(new URL('../../vite.config.ts', import.meta.url), 'utf8');
}

describe('vite component auto import config', (): void => {
  it('registers BWidget instead of the removed BDrawing directory', (): void => {
    const source = readViteConfigSource();

    expect(source).toContain("'BWidget'");
    expect(source).not.toContain("'BDrawing'");
  });
});
