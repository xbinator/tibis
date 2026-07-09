/**
 * @file widget-elements-registry.test.ts
 * @description 验证 BWidget 元素注册表公开工具、视图和设置面板映射。
 */
import { describe, expect, it } from 'vitest';
import type { WidgetElementSchema } from '@/components/BWidget/elements';
import { getWidgetElementSchema, getWidgetElementSetter, getWidgetElementView, WIDGET_ELEMENT_SCHEMAS } from '@/components/BWidget/elements';

describe('BWidget element registry', (): void => {
  it('registers the button element schema for the sidebar tool list', (): void => {
    const schemaNames = WIDGET_ELEMENT_SCHEMAS.map((schema: WidgetElementSchema): string => schema.name);
    const buttonSchema = getWidgetElementSchema('button');

    expect(schemaNames).toContain('button');
    expect(buttonSchema).toMatchObject({
      name: 'button',
      label: '按钮',
      icon: 'lucide:mouse-pointer-click',
      createAnchor: 'center',
      createCursor: 'pointer',
      metadata: {
        actions: [],
        disabled: false,
        loading: false,
        text: '按钮'
      }
    });
  });

  it('registers button view and setter components', (): void => {
    expect(getWidgetElementView('button')).not.toBeNull();
    expect(getWidgetElementSetter('button')).not.toBeNull();
  });
});
