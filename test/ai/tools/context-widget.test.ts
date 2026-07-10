/**
 * @file context-widget.test.ts
 * @description 验证 Widget 工具上下文注册与当前激活状态彼此分离。
 */
import { describe, expect, it, vi } from 'vitest';
import { createWidgetToolContextRegistry, type WidgetToolContext } from '@/ai/tools/context/widget';
import { createDefaultWidgetData } from '@/components/BWidget/utils/widgetData';

/**
 * 创建 Widget 工具上下文测试替身。
 * @param id - Widget 文件 ID
 * @returns Widget 工具上下文
 */
function createContext(id: string): WidgetToolContext {
  return {
    id,
    getSnapshot: vi.fn(() => ({
      file: {
        id,
        name: id,
        ext: 'json',
        path: null,
        title: `${id}.json`
      },
      value: createDefaultWidgetData()
    })),
    replaceValue: vi.fn()
  };
}

describe('WidgetToolContextRegistry', (): void => {
  it('does not make a registered context current implicitly', (): void => {
    const registry = createWidgetToolContextRegistry();

    registry.register('widget-a', createContext('widget-a'));

    expect(registry.getCurrentContext()).toBeUndefined();
  });

  it('sets current only for a registered context', (): void => {
    const registry = createWidgetToolContextRegistry();
    const context = createContext('widget-a');
    registry.setCurrent('missing');
    registry.register('widget-a', context);
    registry.setCurrent('widget-a');

    expect(registry.getCurrentContext()).toBe(context);
  });

  it('finds a registered context by document id without changing the current context', (): void => {
    const registry = createWidgetToolContextRegistry();
    const contextA = createContext('widget-a');
    const contextB = createContext('widget-b');
    registry.register('widget-a', contextA);
    registry.register('widget-b', contextB);
    registry.setCurrent('widget-b');

    expect(registry.getContext('widget-a')).toBe(contextA);
    expect(registry.getCurrentContext()).toBe(contextB);
    expect(registry.getContext('missing')).toBeUndefined();
  });

  it('clears current only when the id matches', (): void => {
    const registry = createWidgetToolContextRegistry();
    const context = createContext('widget-a');
    registry.register('widget-a', context);
    registry.setCurrent('widget-a');

    registry.clearCurrent('widget-b');
    expect(registry.getCurrentContext()).toBe(context);

    registry.clearCurrent('widget-a');
    expect(registry.getCurrentContext()).toBeUndefined();
  });

  it('does not fall back to a background context after unregistering current', (): void => {
    const registry = createWidgetToolContextRegistry();
    registry.register('widget-a', createContext('widget-a'));
    registry.register('widget-b', createContext('widget-b'));
    registry.setCurrent('widget-b');

    registry.unregister('widget-b');

    expect(registry.getCurrentContext()).toBeUndefined();
  });
});
