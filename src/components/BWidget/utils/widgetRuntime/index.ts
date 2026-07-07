/**
 * @file widgetRuntime/index.ts
 * @description BWidget 运行态脚本沙箱执行工具。
 */
import type { WidgetRuntimePatch } from './patch';
import type { WidgetData } from '../../types';
import type { RequestInput, RequestMethod, RequestResponse } from 'types/request';
import type { WidgetExecutionResult, WidgetHttpClient, WidgetRenderContext, WidgetRuntimeSendMessage, WidgetSendMessageTextPart } from 'types/widget';
import { cloneDeep, isPlainObject } from 'lodash-es';
import ts from 'typescript';
import { getElectronAPI } from '@/shared/platform/electron-api';
import { compileSandboxSource, createSandboxHttpHost, runSandboxCode, SANDBOX_HTTP_HOST_FUNCTION_NAME } from '@/utils/sandbox';
import { isWidgetRuntimePatchArray } from './patch';

/** 沙箱中用于上报 Widget patch 的宿主函数名。 */
const SANDBOX_WIDGET_PATCH_HOST_FUNCTION_NAME = '__sandboxWidgetPatch';

/** 沙箱中用于上报 Widget 日志的宿主函数名。 */
const SANDBOX_WIDGET_LOGGER_HOST_FUNCTION_NAME = '__sandboxWidgetLogger';

/** 沙箱中用于转发 Widget console 调用的宿主函数名。 */
const SANDBOX_WIDGET_CONSOLE_HOST_FUNCTION_NAME = '__sandboxWidgetConsole';

/** 小组件日志级别，与 logger.info/warn/error 对齐。 */
type WidgetLogLevel = 'info' | 'warn' | 'error';

/** 小组件 console 级别，对齐标准 console 方法。 */
type WidgetConsoleLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

/** 缺省 Widget class 脚本。 */
const EMPTY_WIDGET_CLASS_SCRIPT = 'export default class Component extends Widget {}';
/** Widget class 非公开成员元数据字段。 */
const WIDGET_NON_PUBLIC_MEMBER_NAMES_PROPERTY = '__widgetNonPublicMemberNames';

/**
 * Widget 内部运行态数据快照。
 */
export interface WidgetRuntimeState {
  /** Widget快照值 */
  value: WidgetData;
  /** Widget运行态渲染上下文 */
  renderContext: WidgetRenderContext;
}

/** Widget 运行态变化来源。 */
export type WidgetRuntimeChangeReason = 'mount' | 'interaction';

/**
 * Widget 运行态对外变化事件。
 */
export interface WidgetRuntimeChange {
  /** 运行态变化来源 */
  reason: WidgetRuntimeChangeReason;
  /** Widget快照值 */
  value: WidgetData;
  /** Widget运行态渲染上下文 */
  renderContext: WidgetRenderContext;
  /** 脚本声明的上行消息 */
  sendMessage?: WidgetRuntimeSendMessage;
}

/**
 * 小组件脚本生命周期执行选项。
 */
interface WidgetLifecycleRunOptions {
  /** 小组件托管 HTTP 客户端。 */
  http?: WidgetHttpClient;
  /** 是否使用 Worker 执行脚本。 */
  useWorker?: boolean;
  /** Worker 执行超时。 */
  timeoutMs?: number;
  /** 脚本执行中的运行态 patch 回调。 */
  onPatch?: (patches: WidgetRuntimePatch[]) => void | Promise<void>;
  /** 脚本执行中的日志回调（$logger.info/warn/error 触发）。 */
  onLogger?: (level: WidgetLogLevel, args: unknown[]) => void | Promise<void>;
  /** 脚本执行中的 console 回调（console.log/info/warn/error/debug 触发），转发到主线程 DevTools。 */
  onConsole?: (level: WidgetConsoleLevel, args: unknown[]) => void | Promise<void>;
}

/** 小组件脚本生命周期名称。 */
type WidgetScriptLifecycleName = 'onExecute' | 'onMounted';

/**
 * 小组件脚本运行载荷。
 */
interface WidgetScriptRunPayload {
  /** 用户编写的默认导出 Widget class 脚本。 */
  scriptCode: string;
  /** 元素声明的交互脚本。 */
  interactionCode?: string;
  /** 需要执行的生命周期。 */
  lifecycleName?: WidgetScriptLifecycleName;
  /** 小组件启动入参。 */
  input: WidgetRenderContext['input'];
  /** onExecute 返回值。 */
  output: WidgetRenderContext['output'];
  /** 小组件当前运行态数据。 */
  data: Record<string, unknown>;
}

/**
 * 小组件脚本运行结果。
 */
interface WidgetScriptRunResult {
  /** 运行后的数据快照。 */
  data: Record<string, unknown>;
  /** 是否写入过数据。 */
  dataChanged: boolean;
  /** 指定生命周期是否真实存在并执行过。 */
  lifecycleExecuted?: boolean;
  /** 生命周期或交互返回值。 */
  returnValue?: unknown;
  /** 脚本声明的上行消息。 */
  sendMessage?: WidgetRuntimeSendMessage;
}

/**
 * 小组件脚本运行选项。
 */
type WidgetScriptRunOptions = Pick<WidgetLifecycleRunOptions, 'http' | 'useWorker' | 'timeoutMs' | 'onPatch' | 'onLogger' | 'onConsole'>;

/**
 * 小组件 part 沙箱执行选项。
 */
interface WidgetPartSandboxOptions extends WidgetLifecycleRunOptions {
  /** 需要运行的生命周期。 */
  lifecycleName?: WidgetScriptLifecycleName;
  /** 元素交互脚本。 */
  interactionCode?: string;
}

/**
 * 小组件托管 HTTP 客户端依赖。
 */
export interface WidgetHttpClientDependencies {
  /** 平台托管 request 调用，测试中可注入。 */
  request?: (request: RequestInput) => Promise<RequestResponse>;
}

/**
 * 小组件运行态执行结果。
 */
export interface WidgetRuntimeRunResult {
  /** 执行后的运行态状态。 */
  state: WidgetRuntimeState;
  /** 脚本通过 this.$sendMessage 声明的上行消息。 */
  sendMessage?: WidgetRuntimeSendMessage;
}

/**
 * 小组件 onExecute 执行结果。
 */
export interface WidgetRuntimeExecuteResult {
  /** 执行后的运行态状态。 */
  state: WidgetRuntimeState;
  /** 模型可见执行状态。 */
  execution: WidgetExecutionResult;
}

/**
 * 小组件运行态实例。
 */
export interface WidgetRuntimeInstance {
  /**
   * 运行元素声明的交互表达式。
   * @param interactionCode - 元素交互表达式
   * @returns 交互执行后的运行态结果
   */
  runInteraction: (interactionCode: string) => Promise<WidgetRuntimeRunResult>;
}

/**
 * 创建小组件托管 HTTP 客户端。
 * @param dependencies - 可注入依赖
 * @returns 小组件脚本可使用的 HTTP 客户端
 */
export function createWidgetHttpClient(dependencies: WidgetHttpClientDependencies = {}): WidgetHttpClient {
  const request = dependencies.request ?? ((input: RequestInput): Promise<RequestResponse> => getElectronAPI().request(input));

  return {
    get: async (url, options = {}): Promise<RequestResponse> => request({ ...options, method: 'GET', url }),
    post: async (url, options = {}): Promise<RequestResponse> => request({ ...options, method: 'POST', url }),
    put: async (url, options = {}): Promise<RequestResponse> => request({ ...options, method: 'PUT', url }),
    patch: async (url, options = {}): Promise<RequestResponse> => request({ ...options, method: 'PATCH', url }),
    delete: async (url, options = {}): Promise<RequestResponse> => request({ ...options, method: 'DELETE', url })
  };
}

/**
 * 判断值是否为普通对象记录。
 * @param value - 待判断值
 * @returns 是否为普通对象记录
 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return isPlainObject(value);
}

/**
 * 判断值是否为小组件上行文本片段。
 * @param value - 待判断值
 * @returns 是否为小组件上行文本片段
 */
function isWidgetSendMessageTextPart(value: unknown): value is WidgetSendMessageTextPart {
  return isPlainRecord(value) && value.type === 'text' && typeof value.text === 'string';
}

/**
 * 判断值是否为小组件上行消息。
 * @param value - 待判断值
 * @returns 是否为小组件上行消息
 */
function isWidgetRuntimeSendMessage(value: unknown): value is WidgetRuntimeSendMessage {
  if (!isPlainRecord(value) || typeof value.isError !== 'boolean') return false;
  if (typeof value.content === 'string') return true;
  return Array.isArray(value.content) && value.content.every(isWidgetSendMessageTextPart);
}

/**
 * 判断值是否为小组件脚本运行结果。
 * @param value - 待判断值
 * @returns 是否为小组件脚本运行结果
 */
function isWidgetScriptRunResult(value: unknown): value is WidgetScriptRunResult {
  if (!isPlainRecord(value) || !isPlainRecord(value.data) || typeof value.dataChanged !== 'boolean') return false;
  if (value.lifecycleExecuted !== undefined && typeof value.lifecycleExecuted !== 'boolean') return false;
  return value.sendMessage === undefined || isWidgetRuntimeSendMessage(value.sendMessage);
}

/**
 * 通过 WidgetHttpClient 执行 request。
 * @param http - HTTP 客户端
 * @param request - request 输入
 * @returns request 响应
 */
function runWidgetHttpRequest(http: WidgetHttpClient | undefined, request: RequestInput): Promise<RequestResponse> {
  if (!http) {
    return Promise.reject(new Error('当前环境未启用小组件 HTTP 客户端'));
  }

  switch (request.method.toLowerCase() as Lowercase<RequestMethod>) {
    case 'get':
      return http.get(request.url, { query: request.query });
    case 'post':
      return http.post(request.url, {
        query: request.query,
        body: request.body
      });
    case 'put':
      return http.put(request.url, {
        query: request.query,
        body: request.body
      });
    case 'patch':
      return http.patch(request.url, {
        query: request.query,
        body: request.body
      });
    case 'delete':
      return http.delete(request.url, {
        query: request.query,
        body: request.body
      });
    default:
      return Promise.reject(new Error('小组件 HTTP 方法无效'));
  }
}

/**
 * 判断当前是否运行在测试环境。
 * @returns 是否为测试环境
 */
function isTestEnvironment(): boolean {
  const maybeProcess = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;

  return maybeProcess?.env?.NODE_ENV === 'test';
}

/**
 * 判断类声明是否带有指定修饰符。
 * @param node - 类声明节点
 * @param kind - 修饰符类型
 * @returns 是否带有指定修饰符
 */
function hasClassModifier(node: ts.ClassDeclaration, kind: ts.SyntaxKind): boolean {
  return node.modifiers?.some((modifier: ts.ModifierLike): boolean => modifier.kind === kind) ?? false;
}

/**
 * 判断类成员是否带有指定修饰符。
 * @param member - 类成员节点
 * @param kind - 修饰符类型
 * @returns 是否带有指定修饰符
 */
function hasClassElementModifier(member: ts.ClassElement, kind: ts.SyntaxKind): boolean {
  const modifiers = ts.canHaveModifiers(member) ? ts.getModifiers(member) : undefined;

  return modifiers?.some((modifier: ts.ModifierLike): boolean => modifier.kind === kind) ?? false;
}

/**
 * 读取可静态表示的类成员名。
 * @param name - 类成员名节点
 * @returns 成员名；无法静态读取时返回 null
 */
function readClassElementName(name: ts.PropertyName | ts.PrivateIdentifier | undefined): string | null {
  if (!name || ts.isPrivateIdentifier(name)) {
    return null;
  }

  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }

  return null;
}

/**
 * 读取类成员名。
 * @param member - 类成员节点
 * @returns 成员名；无法静态读取时返回 null
 */
function readClassMemberName(member: ts.ClassElement): string | null {
  if (ts.isPropertyDeclaration(member) || ts.isMethodDeclaration(member) || ts.isGetAccessorDeclaration(member) || ts.isSetAccessorDeclaration(member)) {
    return readClassElementName(member.name);
  }

  return null;
}

/**
 * 判断类成员是否为 TypeScript 非公开成员。
 * @param member - 类成员节点
 * @returns 是否带有 private/protected 修饰符
 */
function isTypeScriptNonPublicClassMember(member: ts.ClassElement): boolean {
  return hasClassElementModifier(member, ts.SyntaxKind.PrivateKeyword) || hasClassElementModifier(member, ts.SyntaxKind.ProtectedKeyword);
}

/**
 * 判断类声明是否继承 Widget 基类。
 * @param node - 类声明节点
 * @returns 是否继承 Widget
 */
function isWidgetClassDeclaration(node: ts.ClassDeclaration): boolean {
  const extendsClause = node.heritageClauses?.find((clause: ts.HeritageClause): boolean => clause.token === ts.SyntaxKind.ExtendsKeyword);
  const [heritageType] = extendsClause?.types ?? [];

  return Boolean(heritageType && ts.isIdentifier(heritageType.expression) && heritageType.expression.text === 'Widget');
}

/**
 * 判断类声明是否为默认导出的 Widget 类。
 * @param node - 类声明节点
 * @returns 是否为默认导出的 Widget 类
 */
function isDefaultExportWidgetClassDeclaration(node: ts.ClassDeclaration): boolean {
  return (
    Boolean(node.name) &&
    hasClassModifier(node, ts.SyntaxKind.ExportKeyword) &&
    hasClassModifier(node, ts.SyntaxKind.DefaultKeyword) &&
    isWidgetClassDeclaration(node)
  );
}

/**
 * 判断类成员是否为构造器。
 * @param member - 类成员节点
 * @returns 是否为构造器
 */
function isConstructorMember(member: ts.ClassElement): boolean {
  return ts.isConstructorDeclaration(member);
}

/**
 * 收集 TS private/protected 成员名。
 * @param node - 默认导出的 Widget 类
 * @returns 非公开成员名列表
 */
function collectWidgetNonPublicMemberNames(node: ts.ClassDeclaration): string[] {
  const memberNames = new Set<string>();

  node.members.forEach((member: ts.ClassElement): void => {
    if (!isTypeScriptNonPublicClassMember(member)) {
      return;
    }

    const memberName = readClassMemberName(member);
    if (memberName) {
      memberNames.add(memberName);
    }
  });

  return Array.from(memberNames);
}

/**
 * 移除默认导出 Widget 类上的 export/default 修饰符。
 * @param node - 默认导出的 Widget 类
 * @returns 普通类声明
 */
function removeDefaultExportClassModifiers(node: ts.ClassDeclaration): ts.ClassDeclaration {
  const modifiers = node.modifiers?.filter(
    (modifier: ts.ModifierLike): boolean => modifier.kind !== ts.SyntaxKind.ExportKeyword && modifier.kind !== ts.SyntaxKind.DefaultKeyword
  );

  return ts.factory.updateClassDeclaration(node, modifiers, node.name, node.typeParameters, node.heritageClauses, node.members);
}

/**
 * 创建可由沙箱函数执行的 Widget 类脚本源码。
 * @param code - 原始 Widget 脚本源码
 * @returns 返回默认导出类的函数体源码
 */
function createWidgetClassScriptFunctionBody(code: string): string {
  const sourceFile = ts.createSourceFile('widget-script.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const widgetClassDeclarations = sourceFile.statements.filter(
    (statement: ts.Statement): statement is ts.ClassDeclaration => ts.isClassDeclaration(statement) && isDefaultExportWidgetClassDeclaration(statement)
  );

  if (widgetClassDeclarations.length !== 1) {
    throw new Error('小组件脚本必须使用 export default class Xxx extends Widget');
  }

  const [widgetClassDeclaration] = widgetClassDeclarations;
  const className = widgetClassDeclaration.name?.text;
  const nonPublicMemberNames = collectWidgetNonPublicMemberNames(widgetClassDeclaration);

  if (!className) {
    throw new Error('小组件脚本默认导出类必须具名');
  }

  if (widgetClassDeclaration.members.some(isConstructorMember)) {
    throw new Error('小组件脚本暂不支持 constructor');
  }

  const statements = sourceFile.statements.map(
    (statement: ts.Statement): ts.Statement => (statement === widgetClassDeclaration ? removeDefaultExportClassModifiers(widgetClassDeclaration) : statement)
  );
  const transformedSourceFile = ts.factory.updateSourceFile(sourceFile, statements);
  const printer = ts.createPrinter();

  return [
    printer.printFile(transformedSourceFile),
    `Object.defineProperty(${className}, ${JSON.stringify(WIDGET_NON_PUBLIC_MEMBER_NAMES_PROPERTY)}, { value: ${JSON.stringify(nonPublicMemberNames)} });`,
    `return ${className};`
  ].join('\n');
}

/**
 * 编译 Widget 类脚本。
 * @param code - 原始 Widget 脚本源码
 * @returns 可在沙箱内执行的 JS 函数体
 */
function compileWidgetClassScript(code: string): string {
  return compileSandboxSource(createWidgetClassScriptFunctionBody(code), 'widget-script.ts');
}

/**
 * 生成小组件协议适配脚本。
 * @param payload - 小组件运行载荷
 * @returns 可交给通用沙箱执行的脚本
 */
function createWidgetAdapterCode(payload: WidgetScriptRunPayload): string {
  const lifecycleName = payload.lifecycleName ? JSON.stringify(payload.lifecycleName) : 'undefined';
  const interactionCode =
    payload.interactionCode !== undefined ? JSON.stringify(compileSandboxSource(payload.interactionCode, 'widget-interaction.ts')) : 'undefined';

  return [
    'const __widgetInput = __clone(__initialWidgetInput)',
    'const __widgetOutput = __clone(__initialWidgetOutput)',
    'let __widgetData = __clone(__initialWidgetData)',
    'let __widgetClass',
    'const __widgetReservedBindingNames = new Set([',
    "  'arguments', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default',",
    "  'delete', 'do', 'else', 'enum', 'eval', 'export', 'extends', 'false', 'finally', 'for', 'function',",
    "  'if', 'implements', 'import', 'in', 'instanceof', 'interface', 'let', 'new', 'null', 'package',",
    "  'private', 'protected', 'public', 'return', 'static', 'super', 'switch', 'this', 'throw', 'true',",
    "  'try', 'typeof', 'undefined', 'var', 'void', 'while', 'with', 'yield',",
    "  'globalThis', 'window', 'self', 'document', 'localStorage', 'sessionStorage', 'indexedDB', 'fetch',",
    "  'XMLHttpRequest', 'WebSocket', 'EventSource', 'Worker', 'SharedWorker', 'navigator', 'location',",
    "  'history', 'crypto', 'process', 'require', 'module', 'exports', 'importScripts', 'Function',",
    "  'setTimeout', 'setInterval', 'requestAnimationFrame', 'alert', 'confirm', 'prompt', 'open',",
    "  'console', 'widgetThis'",
    '])',
    "const __widgetLifecycleNames = new Set(['onExecute', 'onMounted'])",
    `const __widgetNonPublicMemberNamesProperty = ${JSON.stringify(WIDGET_NON_PUBLIC_MEMBER_NAMES_PROPERTY)}`,
    '',
    'function __clone(value) {',
    '  if (value === undefined) return value',
    '  return JSON.parse(JSON.stringify(value))',
    '}',
    '',
    'function __createHostSafeValue(value, seen = new Map()) {',
    '  if (value === null || value === undefined) return value',
    '  const valueType = typeof value',
    "  if (valueType === 'string' || valueType === 'number' || valueType === 'boolean' || valueType === 'bigint') return value",
    "  if (valueType === 'symbol' || valueType === 'function') return String(value)",
    '  if (value instanceof Error) return value',
    '  const cachedValue = seen.get(value)',
    '  if (cachedValue) return cachedValue',
    '  if (Array.isArray(value)) {',
    '    const result = []',
    '    seen.set(value, result)',
    '    for (const item of value) result.push(__createHostSafeValue(item, seen))',
    '    return result',
    '  }',
    '  if (value instanceof Map) {',
    '    const result = new Map()',
    '    seen.set(value, result)',
    '    for (const [key, childValue] of value.entries()) {',
    '      result.set(__createHostSafeValue(key, seen), __createHostSafeValue(childValue, seen))',
    '    }',
    '    return result',
    '  }',
    '  if (value instanceof Set) {',
    '    const result = new Set()',
    '    seen.set(value, result)',
    '    for (const item of value.values()) result.add(__createHostSafeValue(item, seen))',
    '    return result',
    '  }',
    "  if (Object.prototype.toString.call(value) !== '[object Object]') return value",
    '  const result = {}',
    '  seen.set(value, result)',
    '  let entries = []',
    '  try {',
    '    entries = Object.entries(value)',
    '  } catch {',
    '    return String(value)',
    '  }',
    '  for (const [key, childValue] of entries) result[key] = __createHostSafeValue(childValue, seen)',
    '  return result',
    '}',
    '',
    'function __createHostSafeArgs(args) {',
    '  return Array.from(args, (arg) => __createHostSafeValue(arg))',
    '}',
    '',
    'function __isPlainRecord(value) {',
    "  if (Object.prototype.toString.call(value) !== '[object Object]') return false",
    '  const prototype = Object.getPrototypeOf(value)',
    '  return prototype === Object.prototype || prototype === null',
    '}',
    '',
    'function __mergePlainData(defaultData, currentData) {',
    '  const result = __isPlainRecord(defaultData) ? __clone(defaultData) : {}',
    '  if (!__isPlainRecord(currentData)) return result',
    '  for (const [key, value] of Object.entries(currentData)) {',
    '    const currentValue = result[key]',
    '    result[key] = __isPlainRecord(currentValue) && __isPlainRecord(value) ? __mergePlainData(currentValue, value) : __clone(value)',
    '  }',
    '  return result',
    '}',
    '',
    'function __readWidgetClassDefaultData(widgetInstance) {',
    '  const data = {}',
    '  for (const [key, value] of Object.entries(widgetInstance)) {',
    "    if (key.startsWith('$') || __widgetReservedBindingNames.has(key) || __widgetNonPublicMemberNames.has(key) || typeof value === 'function') continue",
    '    data[key] = __clone(value)',
    '  }',
    '  return data',
    '}',
    '',
    'function __createWidgetComponentInstance() {',
    "  if (typeof __widgetClass !== 'function') throw new Error('小组件脚本未导出 Widget 类')",
    '  return new __widgetClass()',
    '}',
    '',
    'function __serializeData(value) {',
    '  return JSON.stringify(value)',
    '}',
    '',
    'function __initializeWidgetData(executionState, widgetInstance) {',
    '  const previousData = __serializeData(__widgetData)',
    '  const declaredData = __readWidgetClassDefaultData(widgetInstance)',
    '  __widgetData = __mergePlainData(declaredData, __initialWidgetData)',
    '  if (__serializeData(__widgetData) !== previousData) executionState.dataChanged = true',
    '}',
    '',
    'function __normalizeSendMessageTextParts(value) {',
    '  if (!Array.isArray(value)) return null',
    '  const textParts = []',
    '  for (const item of value) {',
    "    if (!__isPlainRecord(item) || item.type !== 'text' || typeof item.text !== 'string') return null",
    "    textParts.push({ type: 'text', text: item.text })",
    '  }',
    '  return textParts',
    '}',
    '',
    'function __normalizeSendMessage(value) {',
    "  if (typeof value === 'string') return { content: value, isError: false }",
    '  if (!__isPlainRecord(value)) return null',
    '  const rawContent = value.content',
    "  const content = typeof rawContent === 'string' ? rawContent : __normalizeSendMessageTextParts(rawContent)",
    '  if (content === null) return null',
    '  return { content, isError: typeof value.isError === "boolean" ? value.isError : false }',
    '}',
    '',
    'function __createWidgetHttpClient(executionState) {',
    `  const request = async (method, url, input = {}) => {`,
    '    await __flushPatches(executionState)',
    `    return ${SANDBOX_HTTP_HOST_FUNCTION_NAME}({ ...__clone(input), method, url })`,
    '  }',
    '  return {',
    "    get: (url, input = {}) => request('GET', url, input),",
    "    post: (url, input = {}) => request('POST', url, input),",
    "    put: (url, input = {}) => request('PUT', url, input),",
    "    patch: (url, input = {}) => request('PATCH', url, input),",
    "    delete: (url, input = {}) => request('DELETE', url, input)",
    '  }',
    '}',
    '',
    'function __createWidgetLogger(executionState) {',
    '  const send = async (level, args) => {',
    '    await __flushPatches(executionState)',
    '    return __sandboxWidgetLogger(level, __createHostSafeArgs(args))',
    '  }',
    '  return {',
    "    info: (...args) => send('info', args),",
    "    warn: (...args) => send('warn', args),",
    "    error: (...args) => send('error', args)",
    '  }',
    '}',
    '',
    'function __createWidgetConsole() {',
    '  const send = (level, args) => __sandboxWidgetConsole(level, __createHostSafeArgs(args))',
    '  return {',
    "    log: (...args) => send('log', args),",
    "    info: (...args) => send('info', args),",
    "    warn: (...args) => send('warn', args),",
    "    error: (...args) => send('error', args),",
    "    debug: (...args) => send('debug', args)",
    '  }',
    '}',
    'const console = __createWidgetConsole()',
    '',
    'function __createExecutionState() {',
    '  return {',
    '    dataChanged: false,',
    '    sendMessage: undefined,',
    '    pendingMethodCalls: [],',
    '    pendingPatches: [],',
    '    pendingPatchFlushes: [],',
    '    pendingPatchFlushScheduled: false',
    '  }',
    '}',
    '',
    'function __isPatchPathSegment(value) {',
    "  return typeof value === 'string' || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)",
    '}',
    '',
    'function __isPatchablePath(path) {',
    "  return Array.isArray(path) && path.length > 0 && typeof path[0] === 'string' && path.every(__isPatchPathSegment)",
    '}',
    '',
    'function __normalizePatchPathSegment(target, property) {',
    "  if (typeof property === 'symbol') return undefined",
    "  if (Array.isArray(target) && typeof property === 'string' && /^(0|[1-9]\\d*)$/.test(property)) return Number(property)",
    "  return typeof property === 'number' ? property : String(property)",
    '}',
    '',
    'function __appendPatchPath(path, target, property) {',
    '  const segment = __normalizePatchPathSegment(target, property)',
    '  return segment === undefined ? undefined : [...path, segment]',
    '}',
    '',
    'function __createSetPatch(target, path, value) {',
    '  if (!path) return undefined',
    '  if (value !== undefined) return { op: "set", path, value }',
    '  return Array.isArray(target) && typeof path[path.length - 1] === "number" ? { op: "set", path, value: null } : { op: "delete", path }',
    '}',
    '',
    'async function __flushPatches(executionState) {',
    '  executionState.pendingPatchFlushScheduled = false',
    '  const patches = executionState.pendingPatches.splice(0)',
    '  if (!patches.length) return',
    `  await ${SANDBOX_WIDGET_PATCH_HOST_FUNCTION_NAME}(patches)`,
    '}',
    '',
    'function __schedulePatchFlush(executionState) {',
    '  if (executionState.pendingPatchFlushScheduled) return',
    '  executionState.pendingPatchFlushScheduled = true',
    '  const flushPromise = Promise.resolve().then(() => __flushPatches(executionState))',
    '  executionState.pendingPatchFlushes.push(flushPromise)',
    '}',
    '',
    'function __recordPatch(executionState, patch) {',
    '  if (!__isPatchablePath(patch.path)) return',
    '  executionState.pendingPatches.push(__clone(patch))',
    '  __schedulePatchFlush(executionState)',
    '}',
    '',
    'async function __flushScheduledPatchFlushes(executionState) {',
    '  while (executionState.pendingPatchFlushes.length > 0) {',
    '    const pendingFlushes = executionState.pendingPatchFlushes.splice(0)',
    '    await Promise.all(pendingFlushes)',
    '  }',
    '  await __flushPatches(executionState)',
    '}',
    '',
    'function __isObjectLike(value) {',
    "  return value !== null && typeof value === 'object'",
    '}',
    '',
    'function __createReadonlyProxy(value, proxyCache = new WeakMap()) {',
    '  if (!__isObjectLike(value)) return value',
    '  const cachedProxy = proxyCache.get(value)',
    '  if (cachedProxy) return cachedProxy',
    '  const proxy = new Proxy(value, {',
    '    get(target, property, receiver) {',
    '      return __createReadonlyProxy(Reflect.get(target, property, receiver), proxyCache)',
    '    },',
    '    set() { return true },',
    '    deleteProperty() { return true },',
    '    defineProperty() { return true },',
    '    setPrototypeOf() { return true }',
    '  })',
    '  proxyCache.set(value, proxy)',
    '  return proxy',
    '}',
    '',
    'function __createWidgetDataProxy(value, executionState, proxyCache, path) {',
    '  if (!__isObjectLike(value)) return value',
    '  const cachedProxy = proxyCache.get(value)',
    '  if (cachedProxy) return cachedProxy',
    '  const proxy = new Proxy(value, {',
    '    get(target, property, receiver) {',
    '      const childValue = Reflect.get(target, property, receiver)',
    '      const childPath = __appendPatchPath(path, target, property)',
    '      return childPath ? __createWidgetDataProxy(childValue, executionState, proxyCache, childPath) : childValue',
    '    },',
    '    set(target, property, nextValue, receiver) {',
    '      const previousValue = Reflect.get(target, property, receiver)',
    '      const clonedValue = __clone(nextValue)',
    '      const didSet = Reflect.set(target, property, clonedValue, receiver)',
    '      if (didSet && !Object.is(previousValue, nextValue)) {',
    '        executionState.dataChanged = true',
    '        const patchPath = __appendPatchPath(path, target, property)',
    '        const patch = __createSetPatch(target, patchPath, clonedValue)',
    '        if (patch) __recordPatch(executionState, patch)',
    '      }',
    '      return didSet',
    '    },',
    '    deleteProperty(target, property) {',
    '      const hadProperty = Object.prototype.hasOwnProperty.call(target, property)',
    '      const didDelete = Reflect.deleteProperty(target, property)',
    '      if (didDelete && hadProperty) {',
    '        executionState.dataChanged = true',
    '        const patchPath = __appendPatchPath(path, target, property)',
    '        if (patchPath) __recordPatch(executionState, { op: "delete", path: patchPath })',
    '      }',
    '      return didDelete',
    '    }',
    '  })',
    '  proxyCache.set(value, proxy)',
    '  return proxy',
    '}',
    '',
    'function __defineWidgetDataAccessor(target, key, executionState, proxyCache) {',
    '  Object.defineProperty(target, key, {',
    '    configurable: true,',
    '    enumerable: true,',
    '    get() {',
    '      return __createWidgetDataProxy(__widgetData[key], executionState, proxyCache, [key])',
    '    },',
    '    set(value) {',
    '      const previousValue = __widgetData[key]',
    '      const clonedValue = __clone(value)',
    '      __widgetData[key] = clonedValue',
    '      if (!Object.is(previousValue, value)) {',
    '        executionState.dataChanged = true',
    '        __recordPatch(executionState, __createSetPatch(__widgetData, [key], clonedValue))',
    '      }',
    '    }',
    '  })',
    '}',
    '',
    'function __createWidgetRootProxy(target, executionState, proxyCache) {',
    '  return new Proxy(target, {',
    '    get(targetObject, property, receiver) {',
    '      if (Reflect.has(targetObject, property)) return Reflect.get(targetObject, property, receiver)',
    "      if (typeof property === 'string' && Object.prototype.hasOwnProperty.call(__widgetData, property)) {",
    '        return __createWidgetDataProxy(__widgetData[property], executionState, proxyCache, [property])',
    '      }',
    '      return undefined',
    '    },',
    '    set(targetObject, property, value, receiver) {',
    '      if (Reflect.has(targetObject, property)) return Reflect.set(targetObject, property, value, receiver)',
    "      if (typeof property !== 'string') return Reflect.set(targetObject, property, value, receiver)",
    '      const previousValue = __widgetData[property]',
    '      const clonedValue = __clone(value)',
    '      __widgetData[property] = clonedValue',
    '      __defineWidgetDataAccessor(targetObject, property, executionState, proxyCache)',
    '      if (!Object.is(previousValue, value)) {',
    '        executionState.dataChanged = true',
    '        __recordPatch(executionState, __createSetPatch(__widgetData, [property], clonedValue))',
    '      }',
    '      return true',
    '    },',
    '    has(targetObject, property) {',
    "      return Reflect.has(targetObject, property) || (typeof property === 'string' && Object.prototype.hasOwnProperty.call(__widgetData, property))",
    '    },',
    '    deleteProperty(targetObject, property) {',
    "      if (property === '$input' || property === '$output' || property === '$http' || property === '$sendMessage' || property === '$logger') {",
    '        return Reflect.deleteProperty(targetObject, property)',
    '      }',
    "      if (typeof property === 'string' && Object.prototype.hasOwnProperty.call(__widgetData, property)) {",
    '        const didDeleteData = delete __widgetData[property]',
    '        if (Reflect.has(targetObject, property)) Reflect.deleteProperty(targetObject, property)',
    '        if (didDeleteData) {',
    '          executionState.dataChanged = true',
    '          __recordPatch(executionState, { op: "delete", path: [property] })',
    '        }',
    '        return didDeleteData',
    '      }',
    '      if (Reflect.has(targetObject, property)) return Reflect.deleteProperty(targetObject, property)',
    '      return true',
    '    }',
    '  })',
    '}',
    '',
    'function __createWidgetThisContext(widgetInstance, executionState) {',
    '  const proxyCache = new WeakMap()',
    '  const context = widgetInstance',
    '  Object.defineProperties(context, {',
    '    $input: { configurable: false, enumerable: false, get() { return __createReadonlyProxy(__widgetInput) } },',
    '    $output: { configurable: false, enumerable: false, get() { return __createReadonlyProxy(__widgetOutput) } },',
    '    $http: { configurable: true, enumerable: false, value: __createWidgetHttpClient(executionState) },',
    '    $logger: { configurable: true, enumerable: false, value: __createWidgetLogger(executionState) },',
    '    $sendMessage: {',
    '      configurable: true,',
    '      enumerable: false,',
    '      async value(message) {',
    '        const sendMessage = __normalizeSendMessage(message)',
    '        if (sendMessage) executionState.sendMessage = sendMessage',
    '        await __flushPatches(executionState)',
    '      }',
    '    }',
    '  })',
    '  for (const key of Object.keys(__widgetData)) {',
    "    if (key === '$input' || key === '$output' || key === '$http' || key === '$sendMessage' || key === '$logger') continue",
    '    __defineWidgetDataAccessor(context, key, executionState, proxyCache)',
    '  }',
    '  return __createWidgetRootProxy(context, executionState, proxyCache)',
    '}',
    '',
    'function __canUseAsBindingName(name) {',
    '  return /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(name) && !__widgetReservedBindingNames.has(name)',
    '}',
    '',
    'function __collectWidgetPrototypeDescriptors(widgetInstance) {',
    '  const descriptors = []',
    '  const visitedNames = new Set()',
    '  let prototype = Object.getPrototypeOf(widgetInstance)',
    '  while (prototype && prototype !== Widget.prototype) {',
    '    for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(prototype))) {',
    '      if (visitedNames.has(name)) continue',
    '      visitedNames.add(name)',
    '      descriptors.push([name, descriptor])',
    '    }',
    '    prototype = Object.getPrototypeOf(prototype)',
    '  }',
    '  return descriptors',
    '}',
    '',
    'function __defineWidgetComputedAccessors(widgetThis, widgetInstance) {',
    '  for (const [propertyName, descriptor] of __collectWidgetPrototypeDescriptors(widgetInstance)) {',
    "    if (propertyName === 'constructor' ||",
    '      Reflect.has(widgetThis, propertyName) ||',
    '      __widgetNonPublicMemberNames.has(propertyName) ||',
    "      typeof descriptor.get !== 'function') continue",
    '    Object.defineProperty(widgetThis, propertyName, {',
    '      configurable: true,',
    '      enumerable: false,',
    '      get() {',
    '        return Reflect.apply(descriptor.get, widgetThis, [])',
    '      }',
    '    })',
    '  }',
    '}',
    '',
    'function __readWidgetLifecycle(widgetInstance, lifecycleName) {',
    '  const matched = __collectWidgetPrototypeDescriptors(widgetInstance).find(([propertyName]) => propertyName === lifecycleName)',
    '  if (matched && __widgetNonPublicMemberNames.has(matched[0])) return undefined',
    '  const lifecycle = matched && matched[1].value',
    "  return typeof lifecycle === 'function' ? lifecycle : undefined",
    '}',
    '',
    'function __createMethodBindings(widgetThis, widgetInstance, executionState) {',
    '  const bindings = {}',
    '  __defineWidgetComputedAccessors(widgetThis, widgetInstance)',
    '  for (const [methodName, descriptor] of __collectWidgetPrototypeDescriptors(widgetInstance)) {',
    "    if (methodName === 'constructor' || __widgetLifecycleNames.has(methodName) || typeof descriptor.value !== 'function') continue",
    '    const isNonPublicMethod = __widgetNonPublicMemberNames.has(methodName)',
    '    const boundMethod = (...args) => {',
    '      try {',
    '        const result = Reflect.apply(descriptor.value, widgetThis, args)',
    '        const pendingCall = Promise.resolve(result).catch(() => undefined)',
    '        executionState.pendingMethodCalls.push(pendingCall)',
    '        return result',
    '      } catch (error) {',
    '        throw error',
    '      }',
    '    }',
    '    Object.defineProperty(widgetThis, methodName, { value: boundMethod, configurable: true, enumerable: false })',
    '    if (!isNonPublicMethod && __canUseAsBindingName(methodName)) bindings[methodName] = boundMethod',
    '  }',
    '  return bindings',
    '}',
    '',
    'async function __flushPendingMethodCalls(executionState) {',
    '  while (executionState.pendingMethodCalls.length > 0) {',
    '    const pendingMethodCalls = executionState.pendingMethodCalls.splice(0)',
    '    await Promise.all(pendingMethodCalls)',
    '  }',
    '}',
    '',
    'async function __runInteractionCode(interactionCode, widgetThis, methodBindings) {',
    '  const bindingNames = Object.keys(methodBindings)',
    "  const interactionBody = '\"use strict\";\\nreturn (async function() {\\n' + interactionCode + '\\n}).call(widgetThis);'",
    "  const fn = __sandbox.createFunction(['widgetThis', ...bindingNames, 'console'], interactionBody)",
    '  return await fn(widgetThis, ...bindingNames.map((name) => methodBindings[name]), console)',
    '}',
    '',
    'async function __runWidgetRuntime(lifecycleName, interactionCode) {',
    '  const executionState = __createExecutionState()',
    '  const widgetInstance = __createWidgetComponentInstance()',
    '  __initializeWidgetData(executionState, widgetInstance)',
    '  const widgetThis = __createWidgetThisContext(widgetInstance, executionState)',
    '  const methodBindings = __createMethodBindings(widgetThis, widgetInstance, executionState)',
    '  let lifecycleExecuted = false',
    '  let returnValue',
    '  if (lifecycleName) {',
    '    const lifecycle = __readWidgetLifecycle(widgetInstance, lifecycleName)',
    "    if (typeof lifecycle === 'function') {",
    '      lifecycleExecuted = true',
    '      returnValue = await Reflect.apply(lifecycle, widgetThis, [])',
    '    }',
    '  } else if (typeof interactionCode === "string" && interactionCode.trim()) {',
    '    returnValue = await __runInteractionCode(interactionCode, widgetThis, methodBindings)',
    '  }',
    '  await __flushPendingMethodCalls(executionState)',
    '  await __flushScheduledPatchFlushes(executionState)',
    '  return {',
    '    data: __clone(__widgetData),',
    '    dataChanged: executionState.dataChanged,',
    '    ...(lifecycleExecuted ? { lifecycleExecuted } : {}),',
    '    ...(returnValue !== undefined ? { returnValue: __clone(returnValue) } : {}),',
    '    ...(executionState.sendMessage ? { sendMessage: __clone(executionState.sendMessage) } : {})',
    '  }',
    '}',
    '',
    'class Widget {}',
    '',
    'function __readWidgetNonPublicMemberNames() {',
    '  const names = __widgetClass && __widgetClass[__widgetNonPublicMemberNamesProperty]',
    "  return new Set(Array.isArray(names) ? names.filter((name) => typeof name === 'string') : [])",
    '}',
    '',
    "const __runWidgetScript = __sandbox.createFunction(['Widget', 'console'], __widgetScriptCode)",
    '__widgetClass = __runWidgetScript(Widget, console)',
    "if (typeof __widgetClass !== 'function' || !(__widgetClass.prototype instanceof Widget)) {",
    "  throw new Error('小组件脚本必须默认导出继承 Widget 的类')",
    '}',
    'const __widgetNonPublicMemberNames = __readWidgetNonPublicMemberNames()',
    '',
    `return await __runWidgetRuntime(${lifecycleName}, ${interactionCode})`
  ].join('\n');
}

/**
 * 运行小组件脚本。
 * @param payload - 小组件运行载荷
 * @param options - 运行选项
 * @returns 小组件脚本运行结果
 */
async function runWidgetScriptSandbox(payload: WidgetScriptRunPayload, options: WidgetScriptRunOptions = {}): Promise<WidgetScriptRunResult> {
  const result = await runSandboxCode(
    {
      code: createWidgetAdapterCode(payload),
      arguments: {
        __initialWidgetInput: payload.input,
        __initialWidgetOutput: payload.output,
        __initialWidgetData: payload.data,
        __widgetScriptCode: compileWidgetClassScript(payload.scriptCode)
      }
    },
    {
      useWorker: options.useWorker ?? !isTestEnvironment(),
      timeoutMs: options.timeoutMs,
      hostFunctions: {
        ...createSandboxHttpHost({
          request: (request: RequestInput): Promise<RequestResponse> => runWidgetHttpRequest(options.http, request),
          functionName: SANDBOX_HTTP_HOST_FUNCTION_NAME,
          disabledMessage: '当前环境未启用小组件 HTTP 客户端',
          invalidRequestMessage: '小组件 HTTP 请求参数无效'
        }),
        [SANDBOX_WIDGET_PATCH_HOST_FUNCTION_NAME]: async (patches: unknown): Promise<void> => {
          if (!isWidgetRuntimePatchArray(patches)) {
            throw new Error('小组件运行态 patch 参数无效');
          }

          await options.onPatch?.(patches);
        },
        [SANDBOX_WIDGET_LOGGER_HOST_FUNCTION_NAME]: async (level: unknown, args: unknown): Promise<void> => {
          if (level !== 'info' && level !== 'warn' && level !== 'error') {
            throw new Error('小组件日志级别无效');
          }
          if (!Array.isArray(args)) {
            throw new Error('小组件日志参数无效');
          }

          await options.onLogger?.(level, args);
        },
        [SANDBOX_WIDGET_CONSOLE_HOST_FUNCTION_NAME]: async (level: unknown, args: unknown): Promise<void> => {
          if (level !== 'log' && level !== 'info' && level !== 'warn' && level !== 'error' && level !== 'debug') {
            throw new Error('小组件 console 级别无效');
          }
          if (!Array.isArray(args)) {
            throw new Error('小组件 console 参数无效');
          }

          await options.onConsole?.(level, args);
        }
      }
    }
  );

  if (!isWidgetScriptRunResult(result.value)) {
    throw new Error('小组件脚本返回结果无效');
  }

  return result.value;
}

/**
 * 判断小组件脚本是否启用。
 * @param state - 运行态状态
 * @returns 是否启用脚本
 */
function isWidgetScriptEnabled(state: WidgetRuntimeState): boolean {
  return state.value.execute?.enabled !== false;
}

/**
 * 把沙箱运行结果写回 Widget 运行态状态。
 * @param state - 原始运行态状态
 * @param result - 沙箱运行结果
 * @returns 写回数据后的运行态状态
 */
function applyWidgetSandboxResult(state: WidgetRuntimeState, result: WidgetScriptRunResult): WidgetRuntimeState {
  if (!result.dataChanged) return state;

  return {
    ...state,
    renderContext: {
      ...state.renderContext,
      data: result.data
    }
  };
}

/**
 * 标记运行态上下文已经执行过 onMounted 生命周期。
 * @param state - 原始运行态状态
 * @returns 带 onMounted 标记的运行态状态
 */
function markWidgetRuntimeMounted(state: WidgetRuntimeState): WidgetRuntimeState {
  if (state.renderContext.isMounted === true) return state;

  return {
    ...state,
    renderContext: {
      ...state.renderContext,
      isMounted: true
    }
  };
}

/**
 * 运行 Widget 沙箱脚本。
 * @param state - 运行态状态
 * @param options - 沙箱执行选项
 * @returns 沙箱运行结果
 */
function runPartSandbox(state: WidgetRuntimeState, options: WidgetPartSandboxOptions = {}): Promise<WidgetScriptRunResult> {
  return runWidgetScriptSandbox(
    {
      scriptCode: state.value.execute?.code ?? EMPTY_WIDGET_CLASS_SCRIPT,
      ...(options.interactionCode !== undefined ? { interactionCode: options.interactionCode } : {}),
      ...(options.lifecycleName ? { lifecycleName: options.lifecycleName } : {}),
      input: state.renderContext.input,
      output: state.renderContext.output,
      data: state.renderContext.data
    },
    {
      http: options.http,
      useWorker: options.useWorker,
      timeoutMs: options.timeoutMs,
      onPatch: options.onPatch,
      onLogger: options.onLogger,
      onConsole: options.onConsole
    }
  );
}

/**
 * 执行小组件 onExecute 生命周期。
 * @param state - 运行态状态
 * @param options - 生命周期执行选项
 * @returns 小组件 onExecute 执行结果
 */
export async function executeWidgetRuntime(state: WidgetRuntimeState, options: WidgetLifecycleRunOptions = {}): Promise<WidgetRuntimeExecuteResult> {
  const stateWithEmptyOutput: WidgetRuntimeState = {
    ...state,
    renderContext: {
      ...state.renderContext,
      output: undefined
    }
  };

  if (!isWidgetScriptEnabled(state)) {
    return {
      state: stateWithEmptyOutput,
      execution: { status: 'success', output: undefined }
    };
  }

  const nextState = cloneDeep(stateWithEmptyOutput);

  try {
    const sandboxResult = await runPartSandbox(nextState, { ...options, lifecycleName: 'onExecute' });
    const output = sandboxResult.returnValue;
    const executedState = applyWidgetSandboxResult(
      {
        ...nextState,
        renderContext: {
          ...nextState.renderContext,
          output
        }
      },
      sandboxResult
    );

    return {
      state: executedState,
      execution: { status: 'success', output }
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    return {
      state: stateWithEmptyOutput,
      execution: {
        status: 'failure',
        error: {
          code: 'EXECUTION_FAILED',
          message
        }
      }
    };
  }
}

/**
 * 执行小组件 onMounted 生命周期，并收集上行消息。
 * @param state - 运行态状态
 * @param options - 生命周期执行选项。
 * @returns 小组件运行态结果。
 */
export async function mountWidgetRuntime(state: WidgetRuntimeState, options: WidgetLifecycleRunOptions = {}): Promise<WidgetRuntimeRunResult> {
  if (!isWidgetScriptEnabled(state)) return { state };

  const nextState = cloneDeep(state);
  const sandboxResult = await runPartSandbox(nextState, { ...options, lifecycleName: 'onMounted' });
  if (!sandboxResult.dataChanged && sandboxResult.lifecycleExecuted !== true && !sandboxResult.sendMessage) return { state };

  const changedState = applyWidgetSandboxResult(nextState, sandboxResult);
  const mountedState = sandboxResult.lifecycleExecuted === true ? markWidgetRuntimeMounted(changedState) : changedState;

  return {
    state: mountedState,
    ...(sandboxResult.sendMessage ? { sendMessage: sandboxResult.sendMessage } : {})
  };
}

/**
 * 执行小组件 onMounted 生命周期，并返回下一版运行数据。
 * @param state - 运行态状态
 * @param options - 生命周期执行选项。
 * @returns 运行后的状态。
 */
export async function initWidgetMountState(state: WidgetRuntimeState, options: WidgetLifecycleRunOptions = {}): Promise<WidgetRuntimeState> {
  return (await mountWidgetRuntime(state, options)).state;
}

/**
 * 运行元素声明的交互表达式。
 * @param state - 运行态状态
 * @param interactionCode - 元素交互表达式
 * @param options - 生命周期执行选项
 * @returns 交互执行结果
 */
async function runWidgetInteraction(
  state: WidgetRuntimeState,
  interactionCode: string,
  options: WidgetLifecycleRunOptions = {}
): Promise<WidgetRuntimeRunResult> {
  if (!isWidgetScriptEnabled(state)) return { state };
  if (!interactionCode.trim()) return { state };

  const nextState = cloneDeep(state);
  const sandboxResult = await runPartSandbox(nextState, { ...options, interactionCode });
  const interactedState = applyWidgetSandboxResult(nextState, sandboxResult);

  return {
    state: interactedState,
    ...(sandboxResult.sendMessage ? { sendMessage: sandboxResult.sendMessage } : {})
  };
}

/**
 * 创建小组件运行态实例。
 * @param state - 运行态状态
 * @param options - 生命周期执行选项
 * @returns 小组件运行态实例
 */
export function createWidgetRuntimeInstance(state: WidgetRuntimeState, options: WidgetLifecycleRunOptions = {}): WidgetRuntimeInstance {
  return {
    runInteraction: (interactionCode: string): Promise<WidgetRuntimeRunResult> => runWidgetInteraction(state, interactionCode, options)
  };
}
