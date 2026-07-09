/**
 * @file WidgetTool/index.ts
 * @description Widget 工具实现，LLM 通过 widget 读取说明，通过 open_widget 打开聊天小组件。
 */
import type { AIToolContext, AIToolExecutionResult, AIToolExecutor } from 'types/ai';
import type { WidgetContract, WidgetDisplayPayload, WidgetExecutionResult, WidgetRenderContext } from 'types/widget';
import { cloneDeep, isPlainObject } from 'lodash-es';
import type { WidgetDefinition } from '@/ai/widget/types';
import { createToolFailureResult, createToolSuccessResult } from '../../results';

/** Widget 工具名称。 */
export const WIDGET_TOOL_NAME = 'widget';
/** 打开 Widget 工具名称。 */
export const OPEN_WIDGET_TOOL_NAME = 'open_widget';

/** Widget 工具 description 最大长度，避免大量小组件挤占上下文。 */
const MAX_WIDGET_DESCRIPTION_LENGTH = 4000;

/** Widget 工具 description 固定头部。 */
const WIDGET_DESCRIPTION_HEADER = 'Inspect a widget by id. Available widgets:';

/** Widget 工具 description 固定尾部。 */
const WIDGET_DESCRIPTION_FOOTER = 'Call this tool with id to read widget schemas and decide which optional input fields can be passed to open_widget.';

/** 打开 Widget 工具 description 固定头部。 */
const OPEN_WIDGET_DESCRIPTION_HEADER = 'Open a widget in chat and run its optional onExecute before display. Available widgets:';

/** 打开 Widget 工具 description 固定尾部。 */
const OPEN_WIDGET_DESCRIPTION_FOOTER =
  'Call with id and optional input extracted from the user message. Do not provide state or output; the widget runtime owns them and returns execution status.';

/**
 * Widget Store 接口，仅声明 WidgetTool 所需的方法。
 */
export interface WidgetStoreLike {
  /** 获取已启用的小组件列表 */
  getEnabledWidgets: () => WidgetDefinition[];
  /** 是否已完成初始化 */
  initialized: boolean;
}

/**
 * Widget 工具输入。
 */
export interface WidgetToolInput {
  /** 小组件稳定 ID */
  id: string;
}

/**
 * 打开 Widget 工具输入。
 */
export interface OpenWidgetToolInput {
  /** 小组件稳定 ID */
  id: string;
  /** 绑定到 Widget input 的数据 */
  input?: Record<string, unknown>;
}

/**
 * open_widget 前置运行态状态。
 */
export interface OpenWidgetRuntimeState {
  /** Widget快照值 */
  value: WidgetDisplayPayload['value'];
  /** Widget运行态渲染上下文 */
  renderContext: WidgetRenderContext;
}

/**
 * open_widget 前置执行结果。
 */
export interface OpenWidgetRuntimeExecuteResult {
  /** 执行后的运行态状态 */
  state: OpenWidgetRuntimeState;
  /** 模型可见执行状态 */
  execution: WidgetExecutionResult;
}

/**
 * open_widget 前置执行器输入。
 */
export interface OpenWidgetRuntimeExecutorInput {
  /** 初始运行态状态 */
  state: OpenWidgetRuntimeState;
}

/**
 * open_widget 前置执行器。
 */
export type OpenWidgetRuntimeExecutor = (input: OpenWidgetRuntimeExecutorInput) => Promise<OpenWidgetRuntimeExecuteResult>;

/**
 * open_widget 工具创建选项。
 */
export interface OpenWidgetToolOptions {
  /** renderer 侧 Widget 沙箱执行器 */
  executeWidget?: OpenWidgetRuntimeExecutor;
}

/**
 * 创建可用于会话 ID 的小组件 ID。
 * @param id - 小组件 ID
 * @returns 安全 ID
 */
function createSafeWidgetId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}

/**
 * 生成小组件列表工具的动态 description。
 * @param store - Widget store 实例
 * @param header - 描述头部
 * @param footer - 描述尾部
 * @param emptyDescription - 空列表描述
 * @returns description 字符串
 */
function buildWidgetListDescription(store: WidgetStoreLike, header: string, footer: string, emptyDescription: string): string {
  const widgets = store.getEnabledWidgets().filter((widget: WidgetDefinition): boolean => !widget.parseError);

  if (widgets.length === 0) {
    return emptyDescription;
  }

  const lines: string[] = [];

  for (const widget of widgets) {
    const nextLine = `- ${widget.id}: ${widget.name} - ${widget.description}`;
    const omitted = widgets.length - lines.length - 1;
    const omissionLine = omitted > 0 ? `... ${omitted} more widgets omitted to keep this tool description compact.` : '';
    const candidate = [header, ...lines, nextLine, omissionLine, '', footer].filter(Boolean).join('\n');

    if (candidate.length > MAX_WIDGET_DESCRIPTION_LENGTH) {
      if (omissionLine) {
        lines.push(omissionLine);
      }
      break;
    }

    lines.push(nextLine);
  }

  return [header, ...lines, '', footer].join('\n');
}

/**
 * 生成 Widget 工具的动态 description。
 * @param store - Widget store 实例
 * @returns description 字符串
 */
function buildWidgetDescription(store: WidgetStoreLike): string {
  return buildWidgetListDescription(store, WIDGET_DESCRIPTION_HEADER, WIDGET_DESCRIPTION_FOOTER, 'Inspect a widget by id. No widgets available.');
}

/**
 * 生成打开 Widget 工具的动态 description。
 * @param store - Widget store 实例
 * @returns description 字符串
 */
function buildOpenWidgetDescription(store: WidgetStoreLike): string {
  return buildWidgetListDescription(store, OPEN_WIDGET_DESCRIPTION_HEADER, OPEN_WIDGET_DESCRIPTION_FOOTER, 'Open a widget in chat. No widgets available.');
}

/**
 * 从 WidgetDefinition 创建模型可读取的小组件契约。
 * @param widget - 小组件定义
 * @returns 小组件契约
 */
function createWidgetContract(widget: WidgetDefinition): WidgetContract {
  return {
    id: widget.id,
    name: widget.name,
    description: widget.description,
    inputSchema: cloneDeep(widget.data.inputSchema),
    outputSchema: cloneDeep(widget.data.outputSchema),
    dataSchema: cloneDeep(widget.data.dataSchema)
  };
}

/**
 * 判断值是否为可绑定到 Widget input 的普通记录。
 * @param value - 待判断值
 * @returns 是否为普通记录
 */
function isWidgetInputRecord(value: unknown): value is Record<string, unknown> {
  return isPlainObject(value);
}

/**
 * 创建打开小组件时的入参。
 * @param input - 打开 Widget 工具输入
 * @returns 小组件入参
 */
function createOpenWidgetInput(input: OpenWidgetToolInput): Record<string, unknown> {
  return isWidgetInputRecord(input.input) ? cloneDeep(input.input) : {};
}

/**
 * 创建打开小组件时的初始运行态状态。
 * @param widget - 小组件定义
 * @param input - 打开 Widget 工具输入
 * @returns 小组件运行态状态
 */
function createOpenWidgetInitialState(widget: WidgetDefinition, input: OpenWidgetToolInput): OpenWidgetRuntimeState {
  return {
    value: cloneDeep(widget.data),
    renderContext: {
      input: createOpenWidgetInput(input),
      output: undefined,
      data: {}
    }
  };
}

/**
 * 从已启用小组件列表中按 ID 查找小组件。
 * @param store - Widget store 实例
 * @param id - 小组件 ID
 * @returns 匹配的小组件或 undefined
 */
function findEnabledWidgetById(store: WidgetStoreLike, id: string): WidgetDefinition | undefined {
  return store.getEnabledWidgets().find((widget: WidgetDefinition): boolean => widget.id === id && !widget.parseError);
}

/**
 * 从 WidgetDefinition 创建聊天展示快照。
 * @param widget - 小组件定义
 * @param input - 打开 Widget 工具输入
 * @param context - 工具执行上下文
 * @param options - open_widget 工具创建选项
 * @returns 小组件展示快照
 */
async function createWidgetDisplayPayload(
  widget: WidgetDefinition,
  input: OpenWidgetToolInput,
  context: AIToolContext | undefined,
  options: OpenWidgetToolOptions
): Promise<WidgetDisplayPayload> {
  const initialState = createOpenWidgetInitialState(widget, input);
  const executed = options.executeWidget
    ? await options.executeWidget({ state: initialState })
    : {
        state: initialState,
        execution: { status: 'success', output: undefined } satisfies WidgetExecutionResult
      };

  return {
    sessionId: `widget-${createSafeWidgetId(widget.id)}-${createSafeWidgetId(context?.toolCallId ?? 'manual')}`,
    widgetId: widget.id,
    value: cloneDeep(executed.state.value),
    renderContext: cloneDeep(executed.state.renderContext),
    execution: cloneDeep(executed.execution)
  };
}

/**
 * 创建找不到 Widget 时的错误结果。
 * @param store - Widget store 实例
 * @param id - 小组件 ID
 * @param toolName - 当前工具名称
 * @returns 工具失败结果
 */
function createWidgetNotFoundResult(store: WidgetStoreLike, id: string, toolName: string): AIToolExecutionResult<never> {
  const available = store
    .getEnabledWidgets()
    .filter((item: WidgetDefinition): boolean => !item.parseError)
    .map((item: WidgetDefinition): string => item.id)
    .join(', ');

  return createToolFailureResult(toolName, 'TOOL_NOT_FOUND', `Widget '${id}' not found. Available widgets: ${available || 'none'}`);
}

/**
 * 创建 Widget 工具执行器。
 * @param store - Widget store 实例
 * @returns 工具执行器
 */
export function createWidgetTool(store: WidgetStoreLike): AIToolExecutor<WidgetToolInput, WidgetContract> {
  return {
    definition: {
      name: WIDGET_TOOL_NAME,
      description: () => buildWidgetDescription(store),
      source: 'builtin',
      riskLevel: 'read',
      permissionCategory: 'system',
      requiresActiveDocument: false,
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The stable widget id to inspect.'
          }
        },
        required: ['id'],
        additionalProperties: false
      }
    },
    async execute(input: WidgetToolInput): Promise<AIToolExecutionResult<WidgetContract>> {
      const widget = findEnabledWidgetById(store, input.id);

      if (!widget) {
        return createWidgetNotFoundResult(store, input.id, WIDGET_TOOL_NAME);
      }

      return createToolSuccessResult(WIDGET_TOOL_NAME, createWidgetContract(widget));
    }
  };
}

/**
 * 创建打开 Widget 工具执行器。
 * @param store - Widget store 实例
 * @returns 工具执行器
 */
export function createOpenWidgetTool(store: WidgetStoreLike, options: OpenWidgetToolOptions = {}): AIToolExecutor<OpenWidgetToolInput, WidgetDisplayPayload> {
  return {
    definition: {
      name: OPEN_WIDGET_TOOL_NAME,
      description: () => buildOpenWidgetDescription(store),
      source: 'builtin',
      riskLevel: 'read',
      permissionCategory: 'system',
      requiresActiveDocument: false,
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The stable widget id to open in chat.'
          },
          input: {
            type: 'object',
            description: 'Optional initial input values extracted from the user message.'
          }
        },
        required: ['id'],
        additionalProperties: false
      }
    },
    async execute(input: OpenWidgetToolInput, context?: AIToolContext): Promise<AIToolExecutionResult<WidgetDisplayPayload>> {
      const widget = findEnabledWidgetById(store, input.id);

      if (!widget) {
        return createWidgetNotFoundResult(store, input.id, OPEN_WIDGET_TOOL_NAME);
      }

      return createToolSuccessResult(OPEN_WIDGET_TOOL_NAME, await createWidgetDisplayPayload(widget, input, context, options));
    }
  };
}
