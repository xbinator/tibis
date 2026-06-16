/**
 * @file drawing-context.test.ts
 * @description 验证 Drawing AI 工具上下文注册表。
 */
import { describe, expect, it } from 'vitest';
import type { DrawingToolContext } from '@/ai/tools/context/drawing';
import { createDrawingToolContextRegistry } from '@/ai/tools/context/drawing';
import type { DrawingData } from '@/components/BDrawing/types';

/**
 * 创建测试画图数据。
 * @returns 测试画图数据
 */
function createDrawingData(): DrawingData {
  return {
    elements: [],
    edges: [],
    viewport: {
      center: { x: 0, y: 0 },
      zoom: 1
    }
  };
}

/**
 * 创建测试 Drawing 工具上下文。
 * @param id - 上下文 ID
 * @returns Drawing 工具上下文
 */
function createContext(id: string): DrawingToolContext {
  return {
    id,
    title: `${id}.tibis`,
    path: null,
    getData: createDrawingData,
    replaceData: async (): Promise<DrawingData> => createDrawingData()
  };
}

describe('drawingToolContextRegistry', (): void => {
  it('returns the latest registered drawing context as current', (): void => {
    const registry = createDrawingToolContextRegistry();
    const first = createContext('drawing-1');
    const second = createContext('drawing-2');

    registry.register(first.id, first);
    registry.register(second.id, second);

    expect(registry.getCurrentContext()).toBe(second);
  });

  it('falls back to the previous drawing context after unregistering the current one', (): void => {
    const registry = createDrawingToolContextRegistry();
    const first = createContext('drawing-1');
    const second = createContext('drawing-2');

    registry.register(first.id, first);
    registry.register(second.id, second);
    registry.unregister(second.id);

    expect(registry.getCurrentContext()).toBe(first);
  });
});
