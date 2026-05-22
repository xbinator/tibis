/**
 * @file chipResolver.test.ts
 * @description chipResolver 单元测试，覆盖文件引用 token 解析和 DOM 渲染。
 * @vitest-environment jsdom
 */
import { describe, expect, test, vi } from 'vitest';
import { createFileRefChipResolver } from '@/components/BChatSidebar/utils/chipResolver';
import type { ChipResult } from '@/components/BPromptEditor/extensions/variableChip';
import { parseFileReferenceToken } from '@/utils/file';

/**
 * 从 ChipResult 中提取 widget 对应的 DOM。
 * @param result - chip 解析结果
 * @returns 渲染后的 DOM；无法提取时返回 null
 */
function resolveWidgetDom(result: ChipResult | null): HTMLElement | null {
  if (!result || !('widget' in result)) {
    return null;
  }

  return (result.widget as { toDOM(view?: unknown): HTMLElement }).toDOM();
}

/**
 * 默认空打开回调，供纯渲染断言复用。
 */
function noopOpenFile(): void {
  // no-op
}

describe('chipResolver', () => {
  describe('存储格式（#path 行号）', () => {
    test('范围引用优先显示 render 行号', () => {
      const dom = resolveWidgetDom(createFileRefChipResolver(noopOpenFile)('#src/demo.ts 12-14|20-24'));
      expect(dom?.textContent).toBe('demo.ts20-24');
    });

    test('旧格式缺少 render 行号时回退到源码行号', () => {
      const dom = resolveWidgetDom(createFileRefChipResolver(noopOpenFile)('#src/demo.ts 12-14'));
      expect(dom?.textContent).toBe('demo.ts12-14');
    });

    test('支持未保存草稿引用', () => {
      const dom = resolveWidgetDom(createFileRefChipResolver(noopOpenFile)('#unsaved://draft123/draft.md 3-5|8-10'));
      expect(dom?.textContent).toBe('draft.md8-10');
    });

    test('无行号引用只显示文件名', () => {
      const dom = resolveWidgetDom(createFileRefChipResolver(noopOpenFile)('#src/demo.ts'));
      expect(dom?.textContent).toBe('demo.ts');
      expect(dom?.querySelector('.b-file-ref-chip__lines')).toBeNull();
    });

    test('无行号的未保存草稿引用', () => {
      const dom = resolveWidgetDom(createFileRefChipResolver(noopOpenFile)('#unsaved://draft123/draft.md'));
      expect(dom?.textContent).toBe('draft.md');
    });
  });

  describe('非 file-ref 类型', () => {
    test('其他类型 body → 返回 null', () => {
      expect(createFileRefChipResolver(noopOpenFile)('@file.ts:5')).toBeNull();
    });

    test('空字符串 → 返回 null', () => {
      expect(createFileRefChipResolver(noopOpenFile)('')).toBeNull();
    });
  });

  describe('FileRefWidget DOM 渲染', () => {
    test('toDOM 单行渲染回退到源码行号', () => {
      const dom = resolveWidgetDom(createFileRefChipResolver(noopOpenFile)('#src/demo.ts 5-5'));
      expect(dom?.textContent).toBe('demo.ts5');
    });

    test('toDOM 存储格式优先显示 render 行号', () => {
      const dom = resolveWidgetDom(createFileRefChipResolver(noopOpenFile)('#src/demo.ts 12-14|20-24'));
      expect(dom?.textContent).toBe('demo.ts20-24');
    });

    test('点击 widget 时触发 onOpenFile', () => {
      const onOpenFile = vi.fn();
      const dom = resolveWidgetDom(createFileRefChipResolver(onOpenFile)('#src/demo.ts 12-14|20-24'));

      dom?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(onOpenFile).toHaveBeenCalledWith({
        rawPath: 'src/demo.ts',
        filePath: 'src/demo.ts',
        fileId: null,
        fileName: 'demo.ts',
        startLine: 12,
        endLine: 14
      });
    });

    test('按 Enter 键时触发 onOpenFile', () => {
      const onOpenFile = vi.fn();
      const dom = resolveWidgetDom(createFileRefChipResolver(onOpenFile)('#src/demo.ts 12-14|20-24'));

      dom?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      expect(onOpenFile).toHaveBeenCalledTimes(1);
    });

    test('toDOM 使用统一的文件名与行号子节点结构', () => {
      const dom = resolveWidgetDom(createFileRefChipResolver(noopOpenFile)('#src/demo.ts 12-14|20-24'));

      expect(dom?.className).toBe('b-file-ref-chip');
      expect(dom?.getAttribute('title')).toBe('src/demo.ts');
      expect(dom?.querySelector('.b-file-ref-chip__filename')?.textContent).toBe('demo.ts');
      expect(dom?.querySelector('.b-file-ref-chip__lines')?.textContent).toBe('20-24');
    });
  });
});

describe('parseFileReferenceToken', () => {
  test('parses storage token with render line metadata', () => {
    expect(parseFileReferenceToken('#src/demo.ts 12-14|20-24')).toEqual({
      rawPath: 'src/demo.ts',
      filePath: 'src/demo.ts',
      fileId: null,
      fileName: 'demo.ts',
      startLine: 12,
      endLine: 14,
      renderStartLine: 20,
      renderEndLine: 24,
      lineText: '12-14',
      isUnsaved: false
    });
  });

  test('falls back to source lines when render metadata is absent', () => {
    expect(parseFileReferenceToken('#src/demo.ts 12-14')).toEqual({
      rawPath: 'src/demo.ts',
      filePath: 'src/demo.ts',
      fileId: null,
      fileName: 'demo.ts',
      startLine: 12,
      endLine: 14,
      renderStartLine: 12,
      renderEndLine: 14,
      lineText: '12-14',
      isUnsaved: false
    });
  });

  test('parses unsaved references into fileId and null filePath', () => {
    expect(parseFileReferenceToken('#unsaved://draft123/draft.md 3-5|8-10')).toEqual({
      rawPath: 'unsaved://draft123/draft.md',
      filePath: null,
      fileId: 'draft123',
      fileName: 'draft.md',
      startLine: 3,
      endLine: 5,
      renderStartLine: 8,
      renderEndLine: 10,
      lineText: '3-5',
      isUnsaved: true
    });
  });

  test('parses token without line numbers (whole file reference)', () => {
    expect(parseFileReferenceToken('#src/demo.ts')).toEqual({
      rawPath: 'src/demo.ts',
      filePath: 'src/demo.ts',
      fileId: null,
      fileName: 'demo.ts',
      startLine: 0,
      endLine: 0,
      renderStartLine: 0,
      renderEndLine: 0,
      lineText: '',
      isUnsaved: false
    });
  });

  test('parses unsaved reference without line numbers', () => {
    expect(parseFileReferenceToken('#unsaved://draft123/draft.md')).toEqual({
      rawPath: 'unsaved://draft123/draft.md',
      filePath: null,
      fileId: 'draft123',
      fileName: 'draft.md',
      startLine: 0,
      endLine: 0,
      renderStartLine: 0,
      renderEndLine: 0,
      lineText: '',
      isUnsaved: true
    });
  });

  test('returns null for invalid tokens', () => {
    expect(parseFileReferenceToken('@file.ts:5')).toBeNull();
  });
});
