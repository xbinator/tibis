/**
 * @file widget-loop.test.ts
 * @description 验证 BWidget 循环数据配置读取、数组路径收集和运行态元素展开。
 */
import type { WidgetElement, WidgetElementLoopConfig, WidgetSchemaObject } from '@/components/BWidget/types';
import type { WidgetRenderContext } from 'types/widget';
import { describe, expect, it } from 'vitest';
import { getWidgetShapeRenderSize } from '@/components/BWidget/utils/widgetGeometry';
import { WIDGET_GROUP_METADATA_KEY } from '@/components/BWidget/utils/widgetGroups';
import {
  collectWidgetLoopDataSourceOptions,
  createWidgetLoopRenderElements,
  type WidgetLoopRenderContext,
  WIDGET_LOOP_METADATA_KEY
} from '@/components/BWidget/utils/widgetLoop';

/**
 * 创建测试循环配置。
 * @param source - 数据源路径
 * @returns 循环配置
 */
function createLoopConfig(source = 'products'): WidgetElementLoopConfig {
  return {
    enabled: true,
    source,
    columns: 2,
    columnGap: 12,
    rowGap: 10,
    itemName: 'item',
    indexName: 'index'
  };
}

/**
 * 创建测试元素。
 * @param id - 元素 ID
 * @param position - 元素位置
 * @param size - 元素尺寸
 * @param metadata - 元素元数据
 * @returns Widget 元素
 */
function createElement(
  id: string,
  position: WidgetElement['position'],
  size: WidgetElement['size'],
  metadata: WidgetElement['metadata'] = {}
): WidgetElement {
  return {
    id,
    name: 'rect',
    label: '矩形',
    icon: 'lucide:square',
    title: id,
    position,
    size,
    rotation: 0,
    style: {},
    metadata
  };
}

/**
 * 创建测试文本元素。
 * @param id - 元素 ID
 * @param position - 元素位置
 * @param size - 元素尺寸
 * @param content - 文本模板内容
 * @param metadata - 元素元数据
 * @returns Widget 文本元素
 */
function createTextElement(
  id: string,
  position: WidgetElement['position'],
  size: WidgetElement['size'],
  content: string,
  metadata: WidgetElement['metadata'] = {}
): WidgetElement {
  return {
    ...createElement(id, position, size, metadata),
    name: 'text',
    label: '文本',
    icon: 'lucide:type',
    style: {
      fontSize: 10
    },
    metadata: {
      ...metadata,
      content
    }
  };
}

/**
 * 创建测试渲染上下文。
 * @returns 渲染上下文
 */
function createRenderContext(): WidgetRenderContext {
  return {
    input: {
      items: [{ name: '入参 A' }, { name: '入参 B' }]
    },
    data: {
      products: [{ name: 'A' }, { name: 'B' }, { name: 'C' }]
    }
  };
}

/**
 * 创建测试入参 schema。
 * @returns 入参 schema
 */
function createInputSchema(): WidgetSchemaObject {
  return {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        description: '入参列表',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' }
          }
        }
      },
      order: {
        type: 'object',
        properties: {
          lines: {
            type: 'array',
            description: '订单行',
            items: { type: 'string' }
          }
        }
      }
    }
  };
}

/**
 * 创建测试 data schema。
 * @returns data schema
 */
function createDataSchema(): WidgetSchemaObject {
  return {
    type: 'object',
    properties: {
      products: {
        type: 'array',
        description: '商品列表',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' }
          }
        }
      },
      status: { type: 'string' }
    }
  };
}

describe('widgetLoop', (): void => {
  it('collects array paths from input and data schemas', (): void => {
    expect(collectWidgetLoopDataSourceOptions(createInputSchema(), createDataSchema()).map((item) => item.value)).toEqual([
      'input.items',
      'input.order.lines',
      'products'
    ]);
  });

  it('expands a single element into grid render elements and removes the template', (): void => {
    const loopElement = createElement('text-1', { x: 10, y: 20 }, { width: 100, height: 52 }, { [WIDGET_LOOP_METADATA_KEY]: createLoopConfig() });
    const result = createWidgetLoopRenderElements([loopElement], createRenderContext());

    expect(result.map((item) => item.element.id)).toEqual(['text-1__loop_0', 'text-1__loop_1', 'text-1__loop_2']);
    expect(result.map((item) => item.element.position)).toEqual([
      { x: 10, y: 20 },
      { x: 122, y: 20 },
      { x: 10, y: 82 }
    ]);
    expect(result[0].renderContext.locals).toEqual({ item: { name: 'A' }, index: 0 });
  });

  it('uses rotated visual bounds when calculating loop grid offsets', (): void => {
    const loopElement = createElement('rect-1', { x: 0, y: 0 }, { width: 100, height: 50 }, { [WIDGET_LOOP_METADATA_KEY]: createLoopConfig() });
    loopElement.rotation = 90;
    const result = createWidgetLoopRenderElements([loopElement], createRenderContext());

    expect(result.map((item) => item.element.position).slice(0, 2)).toEqual([
      { x: 0, y: 0 },
      { x: 62, y: 0 }
    ]);
  });

  it('measures loop template bounds with each iteration locals', (): void => {
    const loopConfig = createLoopConfig();
    const longName = '这是一个需要多行换行的超级长文本';
    const loopElement = createTextElement('text-1', { x: 10, y: 20 }, { width: 30, height: 12 }, '{{ item.name }}', {
      [WIDGET_LOOP_METADATA_KEY]: loopConfig
    });
    const renderContext: WidgetRenderContext = {
      input: {},
      data: {
        products: [{ name: '短' }, { name: longName }, { name: '尾' }]
      }
    };
    const longItemContext: WidgetLoopRenderContext = {
      ...renderContext,
      locals: {
        item: {
          name: longName
        },
        index: 1
      }
    };
    const expectedCellHeight = getWidgetShapeRenderSize(loopElement, longItemContext).height;
    const result = createWidgetLoopRenderElements([loopElement], renderContext);

    expect(expectedCellHeight).toBeGreaterThan(loopElement.size.height);
    expect(result[2].element.position.y).toBeCloseTo(loopElement.position.y + expectedCellHeight + loopConfig.rowGap);
  });

  it('expands a grouped template from group bounds and shares iteration locals', (): void => {
    const groupOwner = createElement('card-bg', { x: 20, y: 10 }, { width: 120, height: 60 }, {
      [WIDGET_GROUP_METADATA_KEY]: 'group-1',
      [WIDGET_LOOP_METADATA_KEY]: createLoopConfig()
    });
    const groupChild = createElement('card-title', { x: 24, y: 18 }, { width: 40, height: 20 }, { [WIDGET_GROUP_METADATA_KEY]: 'group-1' });
    const result = createWidgetLoopRenderElements([groupOwner, groupChild], createRenderContext());

    expect(result.map((item) => item.element.id)).toEqual([
      'card-bg__loop_0',
      'card-title__loop_0',
      'card-bg__loop_1',
      'card-title__loop_1',
      'card-bg__loop_2',
      'card-title__loop_2'
    ]);
    expect(result[1].element.position).toEqual({ x: 24, y: 18 });
    expect(result[3].element.position).toEqual({ x: 156, y: 18 });
    expect(result[0].renderContext.locals).toBe(result[1].renderContext.locals);
    expect(result[2].renderContext.locals).not.toBe(result[0].renderContext.locals);
  });

  it('uses the first enabled loop owner when a group has multiple loop configs', (): void => {
    const groupOwner = createElement('card-bg', { x: 20, y: 10 }, { width: 120, height: 60 }, {
      [WIDGET_GROUP_METADATA_KEY]: 'group-1',
      [WIDGET_LOOP_METADATA_KEY]: createLoopConfig('input.items')
    });
    const groupChild = createElement('card-title', { x: 24, y: 18 }, { width: 40, height: 20 }, {
      [WIDGET_GROUP_METADATA_KEY]: 'group-1',
      [WIDGET_LOOP_METADATA_KEY]: createLoopConfig('products')
    });
    const result = createWidgetLoopRenderElements([groupOwner, groupChild], createRenderContext());

    expect(result.map((item) => item.element.id)).toEqual(['card-bg__loop_0', 'card-title__loop_0', 'card-bg__loop_1', 'card-title__loop_1']);
    expect(result[0].renderContext.locals).toEqual({ item: { name: '入参 A' }, index: 0 });
    expect(result[2].renderContext.locals).toEqual({ item: { name: '入参 B' }, index: 1 });
  });

  it('keeps expanded loop nodes in the original layer order slot', (): void => {
    const belowElement = createElement('below', { x: 0, y: 0 }, { width: 20, height: 20 });
    const loopElement = createElement('loop', { x: 10, y: 10 }, { width: 20, height: 20 }, { [WIDGET_LOOP_METADATA_KEY]: createLoopConfig() });
    const aboveElement = createElement('above', { x: 20, y: 20 }, { width: 20, height: 20 });
    const result = createWidgetLoopRenderElements([belowElement, loopElement, aboveElement], createRenderContext());

    expect(result.map((item) => item.element.id)).toEqual(['below', 'loop__loop_0', 'loop__loop_1', 'loop__loop_2', 'above']);
  });

  it('does not render loop templates when the source is missing or not an array', (): void => {
    const loopElement = createElement('text-1', { x: 10, y: 20 }, { width: 100, height: 52 }, {
      [WIDGET_LOOP_METADATA_KEY]: createLoopConfig('missing.items')
    });

    expect(createWidgetLoopRenderElements([loopElement], createRenderContext())).toEqual([]);
  });
});
