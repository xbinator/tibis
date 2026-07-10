/**
 * @file builtin-widget-tool.test.ts
 * @description 验证 Widget 工具按小组件名称与说明暴露可用小组件契约。
 * @vitest-environment jsdom
 */
import type { AIToolContext } from 'types/ai';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEditWidgetTool,
  createGetWidgetTool,
  createOpenWidgetTool,
  createWidgetTool,
  EDIT_WIDGET_TOOL_NAME,
  GET_WIDGET_TOOL_NAME,
  OPEN_WIDGET_TOOL_NAME,
  WIDGET_TOOL_NAME,
  type WidgetStoreLike
} from '@/ai/tools/builtin/WidgetTool';
import type { AIToolConfirmationAdapter } from '@/ai/tools/confirmation';
import type { WidgetDocumentSnapshot, WidgetToolContext } from '@/ai/tools/context/widget';
import type { WidgetDefinition } from '@/ai/widget/types';
import type { WidgetData } from '@/components/BWidget/types';
import { createDefaultWidgetData } from '@/components/BWidget/utils/widgetData';
import { useToolPermissionStore } from '@/stores/chat/toolPermission';

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
function createWidgetStore(widgets: WidgetDefinition[]): WidgetStoreLike {
  return {
    initialized: true,
    getEnabledWidgets: (): WidgetDefinition[] => widgets.filter((widget: WidgetDefinition): boolean => widget.enabled && !widget.parseError)
  };
}

/**
 * 读取工具 description 文本。
 * @param tool - Widget 工具
 * @returns description 文本
 */
function readDescription(tool: ReturnType<typeof createWidgetTool>): string {
  return typeof tool.definition.description === 'function' ? tool.definition.description() : tool.definition.description;
}

/**
 * Widget 编辑页上下文测试夹具。
 */
interface WidgetEditorContextFixture {
  /** Widget 工具上下文 */
  context: WidgetToolContext;
  /** replaceValue 调用记录 */
  replaceValue: ReturnType<typeof vi.fn<(value: WidgetData) => void>>;
  /** 读取当前夹具数据 */
  readValue: () => WidgetData;
  /** 模拟页面在确认期间更新数据 */
  setValue: (value: WidgetData) => void;
}

/**
 * 创建 Widget 编辑页上下文测试夹具。
 * @param initialValue - 初始 WidgetData
 * @returns Widget 编辑页上下文夹具
 */
function createWidgetEditorContextFixture(initialValue: WidgetData = createDefaultWidgetData()): WidgetEditorContextFixture {
  let value = structuredClone(initialValue);
  const replaceValue = vi.fn<(nextValue: WidgetData) => void>((nextValue: WidgetData): void => {
    value = structuredClone(nextValue);
  });
  const context: WidgetToolContext = {
    id: 'widget-editor-1',
    getSnapshot: (): WidgetDocumentSnapshot => ({
      file: {
        id: 'widget-editor-1',
        name: 'weather',
        ext: 'json',
        path: null,
        title: 'weather.json'
      },
      value: structuredClone(value)
    }),
    replaceValue
  };

  return {
    context,
    replaceValue,
    readValue: (): WidgetData => structuredClone(value),
    setValue: (nextValue: WidgetData): void => {
      value = structuredClone(nextValue);
    }
  };
}

/**
 * 创建默认批准的工具确认适配器。
 * @returns 确认适配器
 */
function createConfirmationAdapter(): AIToolConfirmationAdapter {
  return {
    confirm: vi.fn(async (): Promise<true> => true),
    onExecutionStart: vi.fn(),
    onExecutionComplete: vi.fn()
  };
}

describe('WidgetTool', (): void => {
  beforeEach((): void => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

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

  it('defines page-scoped get and edit Widget tools', (): void => {
    const fixture = createWidgetEditorContextFixture();
    const getTool = createGetWidgetTool(fixture.context, { isCurrent: (): boolean => true });
    const editTool = createEditWidgetTool(fixture.context, { confirm: createConfirmationAdapter(), isCurrent: (): boolean => true });

    expect(getTool.definition).toMatchObject({
      name: GET_WIDGET_TOOL_NAME,
      riskLevel: 'read',
      permissionCategory: 'document',
      requiresActiveDocument: false
    });
    expect(editTool.definition).toMatchObject({
      name: EDIT_WIDGET_TOOL_NAME,
      riskLevel: 'write',
      permissionCategory: 'document',
      requiresActiveDocument: false
    });
    expect(editTool.definition).not.toHaveProperty('safeAutoApprove');
  });

  it('returns a detached snapshot from get_widget', async (): Promise<void> => {
    const fixture = createWidgetEditorContextFixture({
      ...createDefaultWidgetData(),
      name: 'weather'
    });
    const tool = createGetWidgetTool(fixture.context, { isCurrent: (): boolean => true });
    const result = await tool.execute({});

    expect(result).toMatchObject({
      toolName: GET_WIDGET_TOOL_NAME,
      status: 'success',
      data: {
        file: {
          title: 'weather.json'
        },
        value: {
          name: 'weather'
        }
      }
    });
    if (result.status !== 'success') throw new Error('get_widget 应返回成功结果');
    result.data.value.name = 'mutated result';
    expect(fixture.readValue().name).toBe('weather');
  });

  it('rejects get_widget when its captured page is no longer current', async (): Promise<void> => {
    const tool = createGetWidgetTool(createWidgetEditorContextFixture().context, { isCurrent: (): boolean => false });

    expect(await tool.execute({})).toMatchObject({
      toolName: GET_WIDGET_TOOL_NAME,
      status: 'failure',
      error: {
        code: 'STALE_CONTEXT'
      }
    });
  });

  it('rejects invalid Patch input before requesting permission', async (): Promise<void> => {
    const fixture = createWidgetEditorContextFixture();
    const confirm = createConfirmationAdapter();
    const tool = createEditWidgetTool(fixture.context, { confirm, isCurrent: (): boolean => true });

    expect(await tool.execute({ patches: [] })).toMatchObject({
      toolName: EDIT_WIDGET_TOOL_NAME,
      status: 'failure',
      error: {
        code: 'INVALID_INPUT'
      }
    });
    expect(confirm.confirm).not.toHaveBeenCalled();
    expect(fixture.replaceValue).not.toHaveBeenCalled();
  });

  it('reapplies approved Patch to the latest page data after confirmation', async (): Promise<void> => {
    const fixture = createWidgetEditorContextFixture({
      ...createDefaultWidgetData(),
      name: 'before confirmation'
    });
    const confirm = createConfirmationAdapter();
    vi.mocked(confirm.confirm).mockImplementation(async () => {
      fixture.setValue({
        ...fixture.readValue(),
        name: 'changed by user'
      });
      return true;
    });
    const tool = createEditWidgetTool(fixture.context, { confirm, isCurrent: (): boolean => true });
    const result = await tool.execute({
      patches: [{ op: 'set', path: ['description'], value: 'AI description' }]
    });

    expect(result).toMatchObject({
      toolName: EDIT_WIDGET_TOOL_NAME,
      status: 'success',
      data: {
        value: {
          name: 'changed by user',
          description: 'AI description'
        }
      }
    });
    expect(fixture.readValue()).toMatchObject({
      name: 'changed by user',
      description: 'AI description'
    });
    expect(confirm.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining('weather.json')
      })
    );
  });

  it('still requests confirmation in autoSafe mode because Widget patches can change executable code', async (): Promise<void> => {
    const fixture = createWidgetEditorContextFixture();
    const confirm = createConfirmationAdapter();
    useToolPermissionStore().toolPermissionMode = 'autoSafe';
    const tool = createEditWidgetTool(fixture.context, { confirm, isCurrent: (): boolean => true });
    const result = await tool.execute({
      patches: [{ op: 'set', path: ['execute', 'code'], value: 'export default class Weather extends Widget { onMounted() {} }' }]
    });

    expect(result).toMatchObject({
      toolName: EDIT_WIDGET_TOOL_NAME,
      status: 'success'
    });
    expect(confirm.confirm).toHaveBeenCalledTimes(1);
    expect(fixture.readValue().execute.code).toContain('onMounted');
  });

  it('waits for the page replacement transaction before returning the final snapshot', async (): Promise<void> => {
    let value = createDefaultWidgetData();
    const context: WidgetToolContext = {
      id: 'widget-editor-1',
      getSnapshot: (): WidgetDocumentSnapshot => ({
        file: {
          id: 'widget-editor-1',
          name: 'weather',
          ext: 'json',
          path: null,
          title: 'weather.json'
        },
        value: structuredClone(value)
      }),
      replaceValue: async (nextValue: WidgetData): Promise<void> => {
        await Promise.resolve();
        value = {
          ...structuredClone(nextValue),
          name: 'normalized by page'
        };
      }
    };
    const tool = createEditWidgetTool(context, { confirm: createConfirmationAdapter(), isCurrent: (): boolean => true });

    expect(await tool.execute({ patches: [{ op: 'set', path: ['description'], value: 'AI description' }] })).toMatchObject({
      status: 'success',
      data: {
        value: {
          name: 'normalized by page',
          description: 'AI description'
        }
      }
    });
  });

  it('does not write when the captured context becomes stale during confirmation', async (): Promise<void> => {
    const fixture = createWidgetEditorContextFixture();
    let isCurrent = true;
    const confirm = createConfirmationAdapter();
    vi.mocked(confirm.confirm).mockImplementation(async () => {
      isCurrent = false;
      return true;
    });
    const tool = createEditWidgetTool(fixture.context, { confirm, isCurrent: (): boolean => isCurrent });

    expect(await tool.execute({ patches: [{ op: 'set', path: ['name'], value: 'stale write' }] })).toMatchObject({
      toolName: EDIT_WIDGET_TOOL_NAME,
      status: 'failure',
      error: {
        code: 'STALE_CONTEXT'
      }
    });
    expect(fixture.replaceValue).not.toHaveBeenCalled();
  });

  it('rejects a Patch that produces invalid WidgetData', async (): Promise<void> => {
    const fixture = createWidgetEditorContextFixture();
    const tool = createEditWidgetTool(fixture.context, { confirm: createConfirmationAdapter(), isCurrent: (): boolean => true });

    expect(await tool.execute({ patches: [{ op: 'set', path: ['inputSchema'], value: { type: 'object' } }] })).toMatchObject({
      toolName: EDIT_WIDGET_TOOL_NAME,
      status: 'failure',
      error: {
        code: 'INVALID_INPUT',
        message: expect.stringContaining('inputSchema')
      }
    });
    expect(fixture.replaceValue).not.toHaveBeenCalled();
  });

  it('does not write when the user rejects confirmation', async (): Promise<void> => {
    const fixture = createWidgetEditorContextFixture();
    const confirm = createConfirmationAdapter();
    vi.mocked(confirm.confirm).mockResolvedValue(false);
    const tool = createEditWidgetTool(fixture.context, { confirm, isCurrent: (): boolean => true });

    expect(await tool.execute({ patches: [{ op: 'set', path: ['name'], value: 'rejected' }] })).toMatchObject({
      status: 'cancelled',
      error: {
        code: 'USER_CANCELLED'
      }
    });
    expect(fixture.replaceValue).not.toHaveBeenCalled();
  });

  it('respects readonly permission mode', async (): Promise<void> => {
    const fixture = createWidgetEditorContextFixture();
    const confirm = createConfirmationAdapter();
    useToolPermissionStore().toolPermissionMode = 'readonly';
    const tool = createEditWidgetTool(fixture.context, { confirm, isCurrent: (): boolean => true });

    expect(await tool.execute({ patches: [{ op: 'set', path: ['name'], value: 'blocked' }] })).toMatchObject({
      status: 'failure',
      error: {
        code: 'PERMISSION_DENIED'
      }
    });
    expect(confirm.confirm).not.toHaveBeenCalled();
    expect(fixture.replaceValue).not.toHaveBeenCalled();
  });
});
