/**
 * @file builtin-widget-patch.test.ts
 * @description 验证 Widget 编辑工具结构化 Patch 的安全解析与原子应用。
 */
import { describe, expect, it } from 'vitest';
import {
  applyWidgetDocumentPatches,
  validateWidgetDocumentPatches,
  WidgetDocumentPatchError,
  type WidgetDocumentPatch
} from '@/ai/tools/builtin/WidgetTool/patch';
import type { WidgetData, WidgetElement } from '@/components/BWidget/types';
import { createDefaultWidgetData } from '@/components/BWidget/utils/widgetData';
import { createDefaultWidgetElementLoopConfig } from '@/components/BWidget/utils/widgetLoop';

/**
 * 创建 Patch 测试使用的合法元素。
 * @param id - 元素 ID
 * @returns 合法 Widget 元素
 */
function createElement(id: string): WidgetElement {
  return {
    id,
    name: 'rect',
    label: '矩形',
    icon: 'lucide:square',
    title: id,
    position: { x: 0, y: 0 },
    size: { width: 120, height: 80 },
    rotation: 0,
    style: {},
    loop: createDefaultWidgetElementLoopConfig(),
    metadata: {}
  };
}

/**
 * 创建包含一个元素的 WidgetData。
 * @returns Patch 测试数据
 */
function createWidgetData(): WidgetData {
  return {
    ...createDefaultWidgetData(),
    metadata: {
      legacy: true
    },
    elements: [createElement('node-1')]
  };
}

describe('Widget document Patch', (): void => {
  it('sets nested fields without mutating the original WidgetData', (): void => {
    const current = createWidgetData();
    const next = applyWidgetDocumentPatches(current, [{ op: 'set', path: ['elements', 0, 'style', 'color'], value: '#111827' }]);

    expect(next.elements[0].style.color).toBe('#111827');
    expect(current.elements[0].style.color).toBeUndefined();
  });

  it('appends an element when the set index equals the array length', (): void => {
    const current = createWidgetData();
    const appended = createElement('node-2');
    const next = applyWidgetDocumentPatches(current, [{ op: 'set', path: ['elements', 1], value: appended }]);

    expect(next.elements.map((element: WidgetElement): string => element.id)).toEqual(['node-1', 'node-2']);
    expect(next.elements[1]).not.toBe(appended);
  });

  it('deletes an array item with splice semantics', (): void => {
    const current: WidgetData = {
      ...createWidgetData(),
      elements: [createElement('node-1'), createElement('node-2')]
    };
    const next = applyWidgetDocumentPatches(current, [{ op: 'delete', path: ['elements', 0] }]);

    expect(next.elements.map((element: WidgetElement): string => element.id)).toEqual(['node-2']);
  });

  it('deletes an existing nested object field', (): void => {
    const next = applyWidgetDocumentPatches(createWidgetData(), [{ op: 'delete', path: ['metadata', 'legacy'] }]);

    expect(next.metadata).not.toHaveProperty('legacy');
  });

  it('rejects empty Patch lists and unsafe prototype paths', (): void => {
    expect(validateWidgetDocumentPatches([])).toEqual({ valid: false, message: expect.any(String) });
    expect(validateWidgetDocumentPatches([{ op: 'set', path: ['metadata', '__proto__', 'polluted'], value: true }])).toEqual({
      valid: false,
      message: expect.stringContaining('__proto__')
    });
  });

  it('rejects unknown WidgetData root paths', (): void => {
    expect(validateWidgetDocumentPatches([{ op: 'set', path: ['legacy'], value: true }])).toEqual({
      valid: false,
      message: expect.stringContaining('legacy')
    });
  });

  it('rejects missing parent containers', (): void => {
    expect(() => applyWidgetDocumentPatches(createWidgetData(), [{ op: 'set', path: ['metadata', 'missing', 'value'], value: true }])).toThrow(
      WidgetDocumentPatchError
    );
  });

  it('rejects out-of-range array indexes', (): void => {
    expect(() => applyWidgetDocumentPatches(createWidgetData(), [{ op: 'set', path: ['elements', 2], value: createElement('node-2') }])).toThrow(
      WidgetDocumentPatchError
    );
  });

  it('rejects deletion of required root fields', (): void => {
    expect(() => applyWidgetDocumentPatches(createWidgetData(), [{ op: 'delete', path: ['name'] }])).toThrow(WidgetDocumentPatchError);
  });

  it('rejects a Patch result that is not strict WidgetData', (): void => {
    const patches: WidgetDocumentPatch[] = [{ op: 'set', path: ['inputSchema'], value: { type: 'object' } }];

    expect(() => applyWidgetDocumentPatches(createWidgetData(), patches)).toThrow(/inputSchema/u);
  });
});
