/**
 * @file widget-data-validation.test.ts
 * @description 验证 WidgetData 严格校验器拒绝非法结构且不执行归一化。
 */
import { describe, expect, it } from 'vitest';
import type { WidgetData, WidgetElement } from '@/components/BWidget/types';
import { createDefaultWidgetData } from '@/components/BWidget/utils/widgetData';
import { validateWidgetData } from '@/components/BWidget/utils/widgetDataValidation';
import { createDefaultWidgetElementLoopConfig } from '@/components/BWidget/utils/widgetLoop';

/**
 * 创建严格校验测试使用的合法元素。
 * @param id - 元素 ID
 * @param name - 元素类型名称
 * @returns 合法 Widget 元素
 */
function createElement(id: string, name = 'rect'): WidgetElement {
  return {
    id,
    name,
    label: name === 'group' ? '组合' : '矩形',
    icon: name === 'group' ? 'lucide:group' : 'lucide:square',
    title: id,
    position: { x: 0, y: 0 },
    size: { width: 120, height: 80 },
    rotation: 0,
    style: {},
    loop: createDefaultWidgetElementLoopConfig(),
    metadata: {}
  };
}

describe('validateWidgetData', (): void => {
  it('accepts the canonical default WidgetData', (): void => {
    expect(validateWidgetData(createDefaultWidgetData())).toEqual({ valid: true });
  });

  it('reports an invalid schema without replacing it with defaults', (): void => {
    const value = {
      ...createDefaultWidgetData(),
      inputSchema: {
        type: 'object'
      }
    };

    expect(validateWidgetData(value)).toEqual({
      valid: false,
      path: ['inputSchema', 'properties'],
      message: expect.any(String)
    });
  });

  it('rejects unexpected fields in root and nested Widget schemas', (): void => {
    const value = {
      ...createDefaultWidgetData(),
      inputSchema: {
        type: 'object',
        properties: {
          city: {
            type: 'string',
            legacy: true
          }
        },
        required: [],
        legacy: true
      }
    };

    expect(validateWidgetData(value)).toEqual({
      valid: false,
      path: ['inputSchema', 'legacy'],
      message: expect.any(String)
    });

    delete (value.inputSchema as Record<string, unknown>).legacy;
    expect(validateWidgetData(value)).toEqual({
      valid: false,
      path: ['inputSchema', 'properties', 'city', 'legacy'],
      message: expect.any(String)
    });
  });

  it('rejects duplicate element ids across nested groups', (): void => {
    const group = {
      ...createElement('group-1', 'group'),
      children: [createElement('duplicate')]
    };
    const value: WidgetData = {
      ...createDefaultWidgetData(),
      elements: [createElement('duplicate'), group]
    };

    expect(validateWidgetData(value)).toEqual({
      valid: false,
      path: ['elements', 1, 'children', 0, 'id'],
      message: expect.stringContaining('duplicate')
    });
  });

  it('rejects invalid loop layout values at their exact path', (): void => {
    const element = createElement('node-1');
    element.loop.columns = 0;
    const value: WidgetData = {
      ...createDefaultWidgetData(),
      elements: [element]
    };

    expect(validateWidgetData(value)).toEqual({
      valid: false,
      path: ['elements', 0, 'loop', 'columns'],
      message: expect.any(String)
    });
  });

  it('requires metadata to be a plain object', (): void => {
    const value = {
      ...createDefaultWidgetData(),
      metadata: new Date()
    };

    expect(validateWidgetData(value)).toEqual({
      valid: false,
      path: ['metadata'],
      message: expect.any(String)
    });
  });

  it('rejects unexpected root fields', (): void => {
    const value = {
      ...createDefaultWidgetData(),
      legacy: true
    };

    expect(validateWidgetData(value)).toEqual({
      valid: false,
      path: ['legacy'],
      message: expect.any(String)
    });
  });

  it('rejects unexpected element fields instead of silently dropping them', (): void => {
    const value = {
      ...createDefaultWidgetData(),
      elements: [
        {
          ...createElement('node-1'),
          legacy: true
        }
      ]
    };

    expect(validateWidgetData(value)).toEqual({
      valid: false,
      path: ['elements', 0, 'legacy'],
      message: expect.any(String)
    });
  });

  it('rejects children on non-group elements because the renderer ignores them', (): void => {
    const value = {
      ...createDefaultWidgetData(),
      elements: [
        {
          ...createElement('node-1'),
          children: [createElement('hidden-child')]
        }
      ]
    };

    expect(validateWidgetData(value)).toEqual({
      valid: false,
      path: ['elements', 0, 'children'],
      message: expect.any(String)
    });
  });

  it('rejects an element name without a registered renderer', (): void => {
    const value: WidgetData = {
      ...createDefaultWidgetData(),
      elements: [createElement('node-1', 'unsupported')]
    };

    expect(validateWidgetData(value)).toEqual({
      valid: false,
      path: ['elements', 0, 'name'],
      message: expect.stringContaining('未注册')
    });
  });

  it('rejects unsupported Widget style fields and invalid style value types', (): void => {
    const element = createElement('node-1');
    const style = element.style as Record<string, unknown>;
    style.legacy = true;
    const value: WidgetData = {
      ...createDefaultWidgetData(),
      elements: [element]
    };

    expect(validateWidgetData(value)).toEqual({
      valid: false,
      path: ['elements', 0, 'style', 'legacy'],
      message: expect.any(String)
    });

    delete style.legacy;
    style.fontSize = 'large';
    expect(validateWidgetData(value)).toEqual({
      valid: false,
      path: ['elements', 0, 'style', 'fontSize'],
      message: expect.any(String)
    });
  });
});
