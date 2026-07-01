/**
 * @file WidgetTool/index.ts
 * @description Widget 工具实现，LLM 通过 widget 读取说明，通过 open_widget 打开聊天小组件。
 */
import type { AIToolContext, AIToolExecutionResult, AIToolExecutor } from 'types/ai';
import type { ChatMessageWidgetPart } from 'types/chat';
import { cloneDeep, isPlainObject } from 'lodash-es';
import type { WidgetDefinition } from '@/ai/widget/types';
import type { WidgetSchemaObject } from '@/components/BWidget/types';
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
const OPEN_WIDGET_DESCRIPTION_HEADER = 'Open a widget in chat. This does not fetch data or execute widget code. Available widgets:';

/** 打开 Widget 工具 description 固定尾部。 */
const OPEN_WIDGET_DESCRIPTION_FOOTER =
  'Call with id and optional input extracted from the user message. Do not provide state or output; the widget runtime owns them.';

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
 * Widget 工具返回给模型的小组件契约。
 */
export interface WidgetContractToolResult {
  /** 小组件稳定 ID */
  id: string;
  /** 小组件名称 */
  name: string;
  /** 小组件用途说明 */
  description: string;
  /** 小组件入参 schema */
  inputSchema: WidgetSchemaObject;
  /** 小组件状态 schema */
  stateSchema: WidgetSchemaObject;
}

/** 打开 Widget 工具执行结果。 */
export type OpenWidgetToolResult = Pick<ChatMessageWidgetPart, 'sessionId' | 'widgetId' | 'value' | 'renderContext'> & { kind: 'widget_display' };

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
function createWidgetContractToolResult(widget: WidgetDefinition): WidgetContractToolResult {
  return {
    id: widget.id,
    name: widget.name,
    description: widget.description,
    inputSchema: cloneDeep(widget.data.inputSchema),
    stateSchema: cloneDeep(widget.data.stateSchema)
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
 * 创建打开小组件时的初始渲染上下文。
 * @param input - 打开 Widget 工具输入
 * @returns 小组件渲染上下文
 */
function createOpenWidgetRenderContext(input: OpenWidgetToolInput): ChatMessageWidgetPart['renderContext'] {
  return {
    input: isWidgetInputRecord(input.input) ? cloneDeep(input.input) : {},
    state: {}
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
 * @returns 小组件展示快照
 */
function createOpenWidgetToolResult(widget: WidgetDefinition, input: OpenWidgetToolInput, context?: AIToolContext): OpenWidgetToolResult {
  return {
    kind: 'widget_display',
    sessionId: `widget-${createSafeWidgetId(widget.id)}-${createSafeWidgetId(context?.toolCallId ?? 'manual')}`,
    widgetId: widget.id,
    value: cloneDeep(widget.data),
    renderContext: createOpenWidgetRenderContext(input)
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
export function createWidgetTool(store: WidgetStoreLike): AIToolExecutor<WidgetToolInput, WidgetContractToolResult> {
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
    async execute(input: WidgetToolInput): Promise<AIToolExecutionResult<WidgetContractToolResult>> {
      const widget = findEnabledWidgetById(store, input.id);

      if (!widget) {
        return createWidgetNotFoundResult(store, input.id, WIDGET_TOOL_NAME);
      }

      return createToolSuccessResult(WIDGET_TOOL_NAME, createWidgetContractToolResult(widget));
    }
  };
}

/**
 * 创建打开 Widget 工具执行器。
 * @param store - Widget store 实例
 * @returns 工具执行器
 */
export function createOpenWidgetTool(store: WidgetStoreLike): AIToolExecutor<OpenWidgetToolInput, OpenWidgetToolResult> {
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
    async execute(input: OpenWidgetToolInput, context?: AIToolContext): Promise<AIToolExecutionResult<OpenWidgetToolResult>> {
      const widget = findEnabledWidgetById(store, input.id);

      if (!widget) {
        return createWidgetNotFoundResult(store, input.id, OPEN_WIDGET_TOOL_NAME);
      }

      return createToolSuccessResult(OPEN_WIDGET_TOOL_NAME, createOpenWidgetToolResult(widget, input, context));
    }
  };
}
