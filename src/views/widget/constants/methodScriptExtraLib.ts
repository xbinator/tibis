/**
 * @file methodScriptExtraLib.ts
 * @description 小组件JS 脚本 Monaco extra lib 内容生成工具。
 */

import type { WidgetSchemaObject, WidgetSchemaProperty } from '@/components/BWidget/types';

/** TypeScript 标识符匹配表达式。 */
const TYPESCRIPT_IDENTIFIER_PATTERN = /^[A-Za-z_$][\w$]*$/;
/** TypeScript 声明缩进文本。 */
const TYPESCRIPT_DECLARATION_INDENT = '  ';

/**
 * Widget schema 字段类型表达式读取函数。
 */
type WidgetSchemaPropertyTypeExpressionReader = (property: WidgetSchemaProperty, indentLevel: number) => string;

/**
 * 生成指定层级的 TypeScript 缩进。
 * @param level - 缩进层级
 * @returns 缩进文本
 */
function createTypeScriptIndent(level: number): string {
  return TYPESCRIPT_DECLARATION_INDENT.repeat(level);
}

/**
 * 生成可用于 TypeScript 属性声明的字段名。
 * @param key - schema 字段名
 * @returns TypeScript 属性名
 */
function formatTypeScriptPropertyName(key: string): string {
  return TYPESCRIPT_IDENTIFIER_PATTERN.test(key) ? key : JSON.stringify(key);
}

/**
 * 清理可写入 JSDoc 的说明文本。
 * @param text - 原始说明
 * @returns 安全说明文本
 */
function sanitizeTypeScriptDocText(text: string): string {
  return text.replaceAll('*/', '*\\/').replace(/\s+/g, ' ').trim();
}

/**
 * 生成 schema 字段的 JSDoc 行。
 * @param property - schema 字段
 * @param indentLevel - 缩进层级
 * @returns JSDoc 行
 */
function createWidgetSchemaPropertyDocLines(property: WidgetSchemaProperty, indentLevel: number): string[] {
  if (!property.description) {
    return [];
  }

  return [`${createTypeScriptIndent(indentLevel)}/** ${sanitizeTypeScriptDocText(property.description)} */`];
}

/**
 * 生成 schema 接口的 JSDoc 行。
 * @param schema - Widget schema
 * @returns JSDoc 行
 */
function createWidgetSchemaInterfaceDocLines(schema: WidgetSchemaObject): string[] {
  if (!schema.description) {
    return [];
  }

  return [`/** ${sanitizeTypeScriptDocText(schema.description)} */`];
}

/**
 * 将 Widget schema properties 转换为 TypeScript 属性声明。
 * @param properties - schema 字段集合
 * @param requiredFields - 必填字段列表
 * @param indentLevel - 缩进层级
 * @param readTypeExpression - 字段类型表达式读取函数
 * @returns TypeScript 属性声明行
 */
function createWidgetSchemaPropertyLines(
  properties: Record<string, WidgetSchemaProperty>,
  requiredFields: string[],
  indentLevel: number,
  readTypeExpression: WidgetSchemaPropertyTypeExpressionReader
): string[] {
  return Object.entries(properties).flatMap(([key, property]: [string, WidgetSchemaProperty]): string[] => {
    const optionalFlag = requiredFields.includes(key) ? '' : '?';
    const propertyName = formatTypeScriptPropertyName(key);
    const typeExpression = readTypeExpression(property, indentLevel);

    return [
      ...createWidgetSchemaPropertyDocLines(property, indentLevel),
      `${createTypeScriptIndent(indentLevel)}${propertyName}${optionalFlag}: ${typeExpression}`
    ];
  });
}

/**
 * 将 Widget 对象 schema 字段转换为 TypeScript 对象类型表达式。
 * @param properties - schema 字段集合
 * @param requiredFields - 必填字段列表
 * @param indentLevel - 当前缩进层级
 * @param readTypeExpression - 字段类型表达式读取函数
 * @returns TypeScript 对象类型表达式
 */
function createWidgetSchemaObjectTypeExpression(
  properties: Record<string, WidgetSchemaProperty>,
  requiredFields: string[],
  indentLevel: number,
  readTypeExpression: WidgetSchemaPropertyTypeExpressionReader
): string {
  return [
    '{',
    ...createWidgetSchemaPropertyLines(properties, requiredFields, indentLevel + 1, readTypeExpression),
    `${createTypeScriptIndent(indentLevel)}}`
  ].join('\n');
}

/**
 * 将 Widget schema 字段转换为 TypeScript 类型表达式。
 * @param property - schema 字段
 * @param indentLevel - 当前缩进层级
 * @returns TypeScript 类型表达式
 */
function createWidgetSchemaPropertyTypeExpression(property: WidgetSchemaProperty, indentLevel: number): string {
  if (property.type === 'string') {
    return 'string';
  }

  if (property.type === 'number') {
    return 'number';
  }

  if (property.type === 'boolean') {
    return 'boolean';
  }

  if (property.type === 'array') {
    return `Array<${property.items ? createWidgetSchemaPropertyTypeExpression(property.items, indentLevel) : 'unknown'}>`;
  }

  if (!property.properties || Object.keys(property.properties).length === 0) {
    return 'Record<string, unknown>';
  }

  return createWidgetSchemaObjectTypeExpression(property.properties, property.required ?? [], indentLevel, createWidgetSchemaPropertyTypeExpression);
}

/**
 * 根据 Widget schema 生成 TypeScript 接口声明。
 * @param interfaceName - 接口名称
 * @param schema - Widget schema
 * @returns TypeScript 接口声明
 */
export function createWidgetSchemaInterfaceDeclaration(interfaceName: string, schema: WidgetSchemaObject): string {
  const propertyLines = createWidgetSchemaPropertyLines(schema.properties, schema.required ?? [], 1, createWidgetSchemaPropertyTypeExpression);

  return [
    ...createWidgetSchemaInterfaceDocLines(schema),
    `declare interface ${interfaceName} {`,
    ...(propertyLines.length > 0 ? propertyLines : ['  [key: string]: unknown']),
    '}'
  ].join('\n');
}

/**
 * 创建 Widget JS 脚本编辑器类型提示内容。
 * @param inputSchema - 入参 schema
 * @param dataSchema - 数据 schema
 * @returns Monaco extra lib 内容
 */
export function createWidgetMethodScriptExtraLibContent(inputSchema: WidgetSchemaObject, dataSchema: WidgetSchemaObject): string {
  return `
${createWidgetSchemaInterfaceDeclaration('WidgetInput', inputSchema)}
${createWidgetSchemaInterfaceDeclaration('WidgetData', dataSchema)}

declare interface WidgetSendMessageContentPart {
  /** 消息片段类型。 */
  type: 'text'
  /** 文本内容。 */
  text: string
}

declare interface WidgetSendMessagePayload {
  /** 上行消息内容，支持纯文本或文本片段数组。 */
  content: string | WidgetSendMessageContentPart[]
  /** 是否为错误消息，默认 false。 */
  isError?: boolean
}

declare type WidgetSendMessageInput = string | WidgetSendMessageContentPart[] | WidgetSendMessagePayload

declare type WidgetHttpQueryValue = string | number | boolean | null | undefined
declare type WidgetHttpJsonValue = string | number | boolean | null | WidgetHttpJsonValue[] | { [key: string]: WidgetHttpJsonValue }
declare type WidgetHttpBody = WidgetHttpJsonValue | Blob | FormData | ReadableStream | URLSearchParams | ArrayBuffer

declare interface WidgetHttpGetOptions {
  /** 查询参数。 */
  query?: Record<string, WidgetHttpQueryValue>
}

declare interface WidgetHttpRequestOptions {
  /** 查询参数。 */
  query?: Record<string, WidgetHttpQueryValue>
  /** 请求体，普通对象会作为 JSON 发送，字符串和特殊请求体会直接发送。 */
  body?: WidgetHttpBody
}

declare interface RequestResponse {
  /** 最终响应 URL。 */
  url: string
  /** HTTP 状态码。 */
  status: number
  /** 是否为 2xx 响应。 */
  ok: boolean
  /** 响应头。 */
  headers: Record<string, string>
  /** 响应数据。 */
  data: unknown
}

declare interface WidgetHttpClient {
  /** 发送 GET 请求。 */
  get(url: string, options?: WidgetHttpGetOptions): Promise<RequestResponse>
  /** 发送 POST 请求。 */
  post(url: string, options?: WidgetHttpRequestOptions): Promise<RequestResponse>
  /** 发送 PUT 请求。 */
  put(url: string, options?: WidgetHttpRequestOptions): Promise<RequestResponse>
  /** 发送 PATCH 请求。 */
  patch(url: string, options?: WidgetHttpRequestOptions): Promise<RequestResponse>
  /** 发送 DELETE 请求。 */
  delete(url: string, options?: WidgetHttpRequestOptions): Promise<RequestResponse>
}

declare interface WidgetThisContext {
  /**
   * 调用小组件时 AI 提取到的入参。
   * @example const city = this.$input.city
   */
  $input: WidgetInput
  /**
   * 当前小组件运行态数据，可通过 $setData 更新。
   * @example const weather = this.$data.weather
   */
  $data: WidgetData
  /**
   * 托管 HTTP 客户端，request 超时和队列由系统统一控制。
   * @example const response = await this.$http.get('https://api.example.com/weather', { query: { city: this.$input.city } })
   */
  $http: WidgetHttpClient
  /**
   * 写入小组件运行态数据，path 支持点路径，例如 weather.temperature。
   * @example this.$setData('weather.temperature', 28)
   */
  $setData(path: string, value: unknown): void
  /**
   * 向聊天上行一条消息。调用后表示当前小组件交互结束；未调用时继续等待用户操作。
   * @param message - 上行消息，支持字符串、文本片段数组或带 isError 的对象。
   * @example this.$sendMessage('确认下单')
   * @example this.$sendMessage({ content: [{ type: 'text', text: '确认下单' }] })
   */
  $sendMessage(message: WidgetSendMessageInput): Promise<void>
}

declare type WidgetLifecycleHook = (this: WidgetThisContext) => void | Promise<void>
declare type WidgetMethod = (this: WidgetThisContext, ...args: unknown[]) => void | Promise<void>
declare type WidgetMethodMap = Record<string, WidgetMethod>

declare interface WidgetConfig {
  /** 小组件运行态初始数据。 */
  data?: Partial<WidgetData>
  /** 小组件创建或展示时执行。 */
  mounted?: WidgetLifecycleHook
  /** 小组件运行完成后执行一次。 */
  unmounted?: WidgetLifecycleHook
  /** 由元素事件触发的方法集合。 */
  methods?: WidgetMethodMap & ThisType<WidgetThisContext>
}

declare function Widget(config: WidgetConfig & ThisType<WidgetThisContext>): WidgetConfig
`;
}
