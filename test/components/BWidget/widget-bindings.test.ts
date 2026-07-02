/**
 * @file widget-bindings.test.ts
 * @description 验证 BWidget 模板绑定根作用域解析。
 */
import type { WidgetRenderContext } from 'types/widget';
import { describe, expect, it } from 'vitest';
import { evaluateWidgetBindingExpression, resolveWidgetTemplateValue } from '@/components/BWidget/utils/widgetBindings';

/** 已移除的旧根变量名。 */
const REMOVED_LEGACY_ROOT = ['last', 'Result'].join('');

/**
 * 创建测试渲染上下文。
 * @returns 渲染上下文
 */
function createRenderContext(): WidgetRenderContext {
  return {
    input: {
      city: '上海'
    },
    data: {
      weather: {
        temperature: 28
      }
    }
  };
}

describe('widgetBindings', (): void => {
  it('does not resolve removed legacy binding root', (): void => {
    const context = {
      ...createRenderContext(),
      [REMOVED_LEGACY_ROOT]: {
        status: 'success'
      }
    } as unknown as WidgetRenderContext;
    const expression = `${REMOVED_LEGACY_ROOT}.status`;
    const template = `{{ ${expression} }}`;

    expect(evaluateWidgetBindingExpression(expression, context)).toEqual({
      resolved: false,
      value: undefined
    });
    expect(resolveWidgetTemplateValue(template, context)).toBe(template);
  });

  it('does not resolve removed output binding root', (): void => {
    const context = {
      ...createRenderContext(),
      output: {
        condition: '晴'
      }
    } as unknown as WidgetRenderContext;
    const expression = 'output.condition';
    const template = `{{ ${expression} }}`;

    expect(evaluateWidgetBindingExpression(expression, context)).toEqual({
      resolved: false,
      value: undefined
    });
    expect(resolveWidgetTemplateValue(template, context)).toBe(template);
  });
});
