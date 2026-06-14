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

describe('BDrawing component file names', (): void => {
  it('does not use the Drawing prefix for local component files', (): void => {
    const drawingPrefixedFiles = readComponentFileNames().filter((fileName: string): boolean => fileName.startsWith('Drawing'));

    expect(drawingPrefixedFiles).toEqual([]);
  });

  it('keeps the text editor overlay in a dedicated local component', (): void => {
    const componentPath = resolve(__dirname, '../../../src/components/BDrawing/components/TextEditorOverlay.vue');
    const indexContent = readFileSync(resolve(__dirname, '../../../src/components/BDrawing/index.vue'), 'utf-8');

    expect(existsSync(componentPath)).toBe(true);
    expect(indexContent).toContain('TextEditorOverlay');
    expect(indexContent).not.toContain('<textarea');
  });
});
