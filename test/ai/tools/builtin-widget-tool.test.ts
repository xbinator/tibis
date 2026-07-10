/**
 * @file builtin-widget-tool.test.ts
 * @description 验证 Widget 工具按小组件名称与说明暴露可用小组件契约。
 */
import type { AIToolContext } from 'types/ai';
import { describe, expect, it } from 'vitest';
import { createOpenWidgetTool, createWidgetTool, OPEN_WIDGET_TOOL_NAME, WIDGET_TOOL_NAME, type WidgetStoreLike } from '@/ai/tools/builtin/WidgetTool';
import type { WidgetDefinition } from '@/ai/widget/types';
import type { WidgetData } from '@/components/BWidget/types';
import { createDefaultWidgetData } from '@/components/BWidget/utils/widgetData';

/**
 * 创建测试用小组件定义。
 * @returns 小组件定义
 */
function createWeatherWidget(): WidgetDefinition {
  const data: WidgetData = {
    ...createDefaultWidgetData(),
    name: '天气小组件',
    description: '根据城市名称展示天气概况',
    inputSchema: {
      type: 'object',
      properties: {
        city: {
          type: 'string',
          description: '城市名称'
        }
      },
      required: ['city']
    },
    outputSchema: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: '天气摘要'
        }
      },
      required: ['summary']
    },
    metadata: {
      skill: {
        triggers: ['天气']
      }
    }
  };

  return {
    id: 'weather',
    name: data.name,
    description: data.description,
    data,
    filePath: '/home/.tibis/widgets/weather/widget.json',
    enabled: true,
    parsedAt: 1
  };
}

/**
 * 创建测试用 Widget Store。
 * @param widgets - 可用小组件列表
 * @returns Widget Store 夹具
 */
function createWidgetStore(widgets: WidgetDefinition[], latestWidgets: WidgetDefinition[] = widgets): WidgetStoreLike {
  return {
    initialized: true,
    getEnabledWidgets: (): WidgetDefinition[] => widgets.filter((widget: WidgetDefinition): boolean => widget.enabled && !widget.parseError),
    resolveLatestEnabledWidget: async (id: string): Promise<WidgetDefinition | undefined> =>
      latestWidgets.find((widget: WidgetDefinition): boolean => widget.id === id && widget.enabled)
  } as WidgetStoreLike;
}

/**
 * 读取工具 description 文本。
 * @param tool - Widget 工具
 * @returns description 文本
 */
function readDescription(tool: ReturnType<typeof createWidgetTool>): string {
  return typeof tool.definition.description === 'function' ? tool.definition.description() : tool.definition.description;
}

describe('WidgetTool', (): void => {
  it('lists enabled widgets by id, name and description without reading metadata.skill', (): void => {
    const tool = createWidgetTool(createWidgetStore([createWeatherWidget()]));
    const description = readDescription(tool);

    expect(tool.definition.name).toBe(WIDGET_TOOL_NAME);
    expect(description).toContain('- weather: 天气小组件 - 根据城市名称展示天气概况');
    expect(description).not.toContain('triggers');
  });

  it('loads widget contract by stable id', async (): Promise<void> => {
    const tool = createWidgetTool(createWidgetStore([createWeatherWidget()]));
    const result = await tool.execute({ id: 'weather' });

    expect(result).toMatchObject({
      toolName: WIDGET_TOOL_NAME,
      status: 'success',
      data: {
        id: 'weather',
        name: '天气小组件',
        description: '根据城市名称展示天气概况',
        inputSchema: {
          properties: {
            city: {
              description: '城市名称'
            }
          }
        },
        outputSchema: {
          properties: {
            summary: {
              description: '天气摘要'
            }
          }
        }
      }
    });
  });

  it('loads the widget contract from the execution-time Store resolver', async (): Promise<void> => {
    const oldWidget = createWeatherWidget();
    const latestWidget = {
      ...createWeatherWidget(),
      description: '执行时最新描述',
      data: {
        ...createWeatherWidget().data,
        description: '执行时最新描述'
      }
    };
    const tool = createWidgetTool(createWidgetStore([oldWidget], [latestWidget]));

    const result = await tool.execute({ id: 'weather' });

    expect(result).toMatchObject({
      status: 'success',
      data: {
        description: '执行时最新描述'
      }
    });
  });

  it('fails explicitly when the execution-time Widget source is invalid', async (): Promise<void> => {
    const oldWidget = createWeatherWidget();
    const invalidWidget = {
      ...createWeatherWidget(),
      parseError: 'Unexpected token'
    };
    const tool = createWidgetTool(createWidgetStore([oldWidget], [invalidWidget]));

    const result = await tool.execute({ id: 'weather' });

    expect(result).toMatchObject({
      status: 'failure',
      error: {
        code: 'INVALID_INPUT',
        message: expect.stringContaining('Unexpected token')
      }
    });
  });

  it('fails when widget id is not found', async (): Promise<void> => {
    const tool = createWidgetTool(createWidgetStore([createWeatherWidget()]));
    const result = await tool.execute({ id: 'coffee' });

    expect(result).toMatchObject({
      toolName: WIDGET_TOOL_NAME,
      status: 'failure',
      error: {
        code: 'TOOL_NOT_FOUND',
        message: expect.stringContaining('coffee')
      }
    });
  });

  it('does not inspect disabled widgets', async (): Promise<void> => {
    const tool = createWidgetTool(createWidgetStore([{ ...createWeatherWidget(), enabled: false }]));
    const result = await tool.execute({ id: 'weather' });

    expect(result).toMatchObject({
      toolName: WIDGET_TOOL_NAME,
      status: 'failure',
      error: {
        code: 'TOOL_NOT_FOUND'
      }
    });
  });

  it('creates a renderable widget snapshot through open widget tool', async (): Promise<void> => {
    const tool = createOpenWidgetTool(createWidgetStore([createWeatherWidget()]));
    const result = await tool.execute(
      {
        id: 'weather',
        input: {
          city: '上海'
        }
      },
      { toolCallId: 'tool-call-widget' } as AIToolContext
    );

    expect(tool.definition.name).toBe(OPEN_WIDGET_TOOL_NAME);
    expect(tool.definition.parameters.properties).not.toHaveProperty('state');
    expect(tool.definition.parameters.properties).not.toHaveProperty('output');
    expect(result).toMatchObject({
      toolName: OPEN_WIDGET_TOOL_NAME,
      status: 'success',
      data: {
        sessionId: 'widget-weather-tool-call-widget',
        widgetId: 'weather',
        value: {
          name: '天气小组件',
          description: '根据城市名称展示天气概况'
        },
        renderContext: {
          input: {
              city: '上海'
            },
            output: undefined,
          data: {}
        },
        execution: {
          status: 'success',
          output: undefined
        }
      }
    });
  });

  it('opens widget without input values', async (): Promise<void> => {
    const tool = createOpenWidgetTool(createWidgetStore([createWeatherWidget()]));
    const result = await tool.execute({ id: 'weather' }, { toolCallId: 'tool-call-widget' } as AIToolContext);

    expect(result).toMatchObject({
      toolName: OPEN_WIDGET_TOOL_NAME,
      status: 'success',
      data: {
        renderContext: {
          input: {},
            output: undefined,
          data: {}
        },
        execution: {
          status: 'success',
          output: undefined
        }
      }
    });
  });

  it('does not open disabled widgets', async (): Promise<void> => {
    const tool = createOpenWidgetTool(createWidgetStore([{ ...createWeatherWidget(), enabled: false }]));
    const result = await tool.execute({ id: 'weather' }, { toolCallId: 'tool-call-widget' } as AIToolContext);

    expect(result).toMatchObject({
      toolName: OPEN_WIDGET_TOOL_NAME,
      status: 'failure',
      error: {
        code: 'TOOL_NOT_FOUND'
      }
    });
  });
});
