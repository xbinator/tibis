/**
 * @file api-config-responsive.test.ts
 * @description 验证服务商 API 配置区域的容器响应式样式。
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * 读取 ApiConfig 组件源码。
 * @returns ApiConfig Vue 单文件组件源码
 */
function readApiConfigSource(): string {
  return readFileSync(new URL('../../../../src/views/settings/provider/components/ApiConfig.vue', import.meta.url), 'utf8');
}

/**
 * 提取命名容器查询内部样式内容。
 * @param source - Vue 单文件组件源码
 * @returns API 配置容器查询样式内容
 */
function extractApiConfigContainerQuery(source: string): string {
  return /@container\s+api-config\s+\(max-width:\s*520px\)\s*\{([\s\S]*)\n\}/.exec(source)?.[1] ?? '';
}

describe('ApiConfig responsive style', (): void => {
  it('uses a named container query for the connection test layout', (): void => {
    const source = readApiConfigSource();
    const containerQuery = extractApiConfigContainerQuery(source);

    expect(source).toMatch(/\.config-section\s*\{[\s\S]*container-name:\s*api-config;/);
    expect(source).toMatch(/\.config-section\s*\{[\s\S]*container-type:\s*inline-size;/);
    expect(containerQuery).toMatch(/\.connection-test\s*\{[\s\S]*flex-direction:\s*column;/);
    expect(containerQuery).toMatch(/\.test-actions\s*\{[\s\S]*width:\s*100%;/);
    expect(containerQuery).toMatch(/\.model-select\s*\{[\s\S]*min-width:\s*0;/);
  });
});
