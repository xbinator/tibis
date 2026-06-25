/**
 * @file component-file-names.test.ts
 * @description 验证 BDrawing components 目录下的组件文件命名约束。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 读取 BDrawing components 目录中的 Vue 组件文件名。
 * @returns Vue 组件文件名列表
 */
function readComponentFileNames(): string[] {
  return readdirSync(resolve(__dirname, '../../../src/components/BDrawing/components')).filter((fileName: string): boolean => fileName.endsWith('.vue'));
}

/**
 * 读取 BDrawing 元素目录中的指定文件名。
 * @param fileName - 需要匹配的文件名
 * @returns 匹配到的文件路径列表
 */
function readElementFilesByName(fileName: string): string[] {
  return readdirSync(resolve(__dirname, '../../../src/components/BDrawing/elements'), { withFileTypes: true })
    .filter((entry): boolean => entry.isDirectory())
    .map((entry): string => resolve(__dirname, '../../../src/components/BDrawing/elements', entry.name, fileName))
    .filter((filePath: string): boolean => existsSync(filePath));
}

describe('BDrawing component file names', (): void => {
  it('does not use the Drawing prefix for local component files', (): void => {
    const drawingPrefixedFiles = readComponentFileNames().filter((fileName: string): boolean => fileName.startsWith('Drawing'));

    expect(drawingPrefixedFiles).toEqual([]);
  });

  it('does not keep the removed text editor overlay component', (): void => {
    const componentPath = resolve(__dirname, '../../../src/components/BDrawing/components/TextEditorOverlay.vue');
    const indexContent = readFileSync(resolve(__dirname, '../../../src/components/BDrawing/index.vue'), 'utf-8');

    expect(existsSync(componentPath)).toBe(false);
    expect(indexContent).not.toContain('TextEditorOverlay');
    expect(indexContent).not.toContain('<textarea');
  });

  it('uses index.vue as each registered element view entry', (): void => {
    const registryContent = readFileSync(resolve(__dirname, '../../../src/components/BDrawing/elements/index.ts'), 'utf-8');

    expect(readElementFilesByName('View.vue')).toEqual([]);
    expect(readElementFilesByName('index.vue')).toHaveLength(2);
    expect(registryContent).not.toContain('/View.vue');
    expect(registryContent).toContain('/index.vue');
  });
});
