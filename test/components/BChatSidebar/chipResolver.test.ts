/**
 * @file chipResolver.test.ts
 * @description chipResolver 单元测试，覆盖新格式、旧格式降级、边界场景。
 * @vitest-environment jsdom
 */
import { describe, expect, test } from 'vitest';
import { chipResolver } from '@/components/BChatSidebar/utils/chipResolver';
import type { ChipResult } from '@/components/BPromptEditor/extensions/variableChip';

/**
 * 窄化 ChipResult 并断言 Widget 构造参数。
 */
function expectFileRefWidget(result: ChipResult | null, expected: { fileName: string; startLine: number; endLine: number }): void {
  expect(result).not.toBeNull();
  const chipResult = result as ChipResult;
  expect(chipResult).toHaveProperty('widget');
  if ('widget' in chipResult) {
    expect(chipResult.widget).toMatchObject({
      fileName: expected.fileName,
      startLine: expected.startLine,
      endLine: expected.endLine
    });
  }
}

describe('chipResolver', () => {
  describe('新格式（4 字段）', () => {
    test('范围引用：startLine !== endLine', () => {
      expectFileRefWidget(chipResolver('file-ref:abc123|file.ts|5|15'), {
        fileName: 'file.ts',
        startLine: 5,
        endLine: 15
      });
    });

    test('单行引用：startLine === endLine', () => {
      expectFileRefWidget(chipResolver('file-ref:abc123|file.ts|10|10'), {
        fileName: 'file.ts',
        startLine: 10,
        endLine: 10
      });
    });

    test('无行号：startLine === endLine === 0', () => {
      expectFileRefWidget(chipResolver('file-ref:abc123|file.ts|0|0'), {
        fileName: 'file.ts',
        startLine: 0,
        endLine: 0
      });
    });

    test('endLine < startLine 异常数据 → 退化为单行引用', () => {
      expectFileRefWidget(chipResolver('file-ref:abc123|file.ts|5|2'), {
        fileName: 'file.ts',
        startLine: 5,
        endLine: 5
      });
    });

    test('空 startLine 字段 → startLine=0', () => {
      expectFileRefWidget(chipResolver('file-ref:abc123|file.ts||3'), {
        fileName: 'file.ts',
        startLine: 0,
        endLine: 3
      });
    });

    test('空 endLine 字段 → endLine=startLine', () => {
      expectFileRefWidget(chipResolver('file-ref:abc123|file.ts|7|'), {
        fileName: 'file.ts',
        startLine: 7,
        endLine: 7
      });
    });
  });

  describe('旧格式降级（3 字段）', () => {
    test('单行：数字字符串 "10"', () => {
      expectFileRefWidget(chipResolver('file-ref:abc123|file.ts|10'), {
        fileName: 'file.ts',
        startLine: 10,
        endLine: 10
      });
    });

    test('范围：带横线 "10-20"', () => {
      expectFileRefWidget(chipResolver('file-ref:abc123|file.ts|10-20'), {
        fileName: 'file.ts',
        startLine: 10,
        endLine: 20
      });
    });

    test('空 line 字段 → 降级为无行号', () => {
      expectFileRefWidget(chipResolver('file-ref:abc123|file.ts|'), {
        fileName: 'file.ts',
        startLine: 0,
        endLine: 0
      });
    });

    test('非法 line 格式（非数字非范围）→ 降级为无行号', () => {
      expectFileRefWidget(chipResolver('file-ref:abc123|file.ts|abc'), {
        fileName: 'file.ts',
        startLine: 0,
        endLine: 0
      });
    });
  });

  describe('非 file-ref 类型', () => {
    test('其他类型 body → 返回 null', () => {
      expect(chipResolver('todo:something')).toBeNull();
    });

    test('空 body → 返回 null', () => {
      expect(chipResolver('file-ref:')).toBeNull();
    });

    test('空字符串 → 返回 null', () => {
      expect(chipResolver('')).toBeNull();
    });
  });

  describe('FileRefWidget DOM 渲染', () => {
    /**
     * 从 chipResolver 结果中提取 Widget 并返回其 toDOM 结果。
     */
    function resolveWidgetDom(body: string): HTMLElement | null {
      const result = chipResolver(body);
      if (result && 'widget' in result) {
        // WidgetType.toDOM 需要 EditorView 参数，FileRefWidget 子类不使用该参数
        return (result.widget as { toDOM(view?: unknown): HTMLElement }).toDOM();
      }
      return null;
    }

    test('toDOM 单行渲染', () => {
      const dom = resolveWidgetDom('file-ref:abc123|file.ts|5|5');
      expect(dom?.textContent).toBe('file.ts:5');
    });

    test('toDOM 范围渲染', () => {
      const dom = resolveWidgetDom('file-ref:abc123|file.ts|5|15');
      expect(dom?.textContent).toBe('file.ts:5-15');
    });

    test('toDOM 无行号仅显示文件名', () => {
      const dom = resolveWidgetDom('file-ref:abc123|file.ts|0|0');
      expect(dom?.textContent).toBe('file.ts');
    });
  });
});
