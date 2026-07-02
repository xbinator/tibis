/**
 * @file widgetRuntime.ts
 * @description BChat 小组件消息片段运行态工具。
 */
import type { ChatMessageWidgetPart } from 'types/chat';
import type { RequestInput, RequestMethod, RequestResponse } from 'types/request';
import type { WidgetHttpClient, WidgetRuntimeSendMessage, WidgetSendMessageTextPart } from 'types/widget';
import { cloneDeep, isPlainObject } from 'lodash-es';
import { getElectronAPI } from '@/shared/platform/electron-api';
import { compileSandboxSource, createSandboxHttpHost, runSandboxCode, SANDBOX_HTTP_HOST_FUNCTION_NAME } from '@/utils/sandbox';

/**
 * 小组件脚本生命周期执行选项。
 */
interface WidgetLifecycleRunOptions {
  /** 当前时间来源，测试中可注入固定时间。 */
  now?: () => Date;
  /** 小组件托管 HTTP 客户端。 */
  http?: WidgetHttpClient;
  /** 是否使用 Worker 执行脚本。 */
  useWorker?: boolean;
  /** Worker 执行超时。 */
  timeoutMs?: number;
}

/** 小组件脚本生命周期名称。 */
type WidgetScriptLifecycleName = 'mounted' | 'unmounted';

/**
 * 小组件脚本运行载荷。
 */
interface WidgetScriptRunPayload {
  /** 用户编写的 Widget({ ... }) 脚本。 */
  scriptCode: string;
  /** 元素声明的交互脚本。 */
  interactionCode?: string;
  /** 需要执行的生命周期。 */
  lifecycleName?: WidgetScriptLifecycleName;
  /** 小组件启动入参。 */
  input: Record<string, unknown>;
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
  /** 脚本声明的上行消息。 */
  sendMessage?: WidgetRuntimeSendMessage;
}

/**
 * 小组件脚本运行选项。
 */
type WidgetScriptRunOptions = Pick<WidgetLifecycleRunOptions, 'http' | 'useWorker' | 'timeoutMs'>;

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
 * 小组件运行态收尾结果。
 */
export interface WidgetRuntimeFinishResult {
  /** 收尾后的消息片段。 */
  part: ChatMessageWidgetPart;
  /** 脚本通过 this.$sendMessage 声明的上行消息。 */
  sendMessage?: WidgetRuntimeSendMessage;
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
  runInteraction: (interactionCode: string) => Promise<WidgetRuntimeFinishResult>;
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
 * 生成小组件协议适配脚本。
 * @param payload - 小组件运行载荷
 * @returns 可交给通用沙箱执行的脚本
 */
function createWidgetAdapterCode(payload: WidgetScriptRunPayload): string {
  const lifecycleName = payload.lifecycleName ? JSON.stringify(payload.lifecycleName) : 'undefined';
  const interactionCode =
    payload.interactionCode !== undefined ? JSON.stringify(compileSandboxSource(payload.interactionCode, 'widget-interaction.ts')) : 'undefined';

  return [
    'const __widgetInput = __initialWidgetInput',
    'let __widgetData = __clone(__initialWidgetData)',
    'let __widgetConfig',
    'const __widgetReservedBindingNames = new Set([',
    "  'arguments', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default',",
    "  'delete', 'do', 'else', 'enum', 'eval', 'export', 'extends', 'false', 'finally', 'for', 'function',",
    "  'if', 'implements', 'import', 'in', 'instanceof', 'interface', 'let', 'new', 'null', 'package',",
    "  'private', 'protected', 'public', 'return', 'static', 'super', 'switch', 'this', 'throw', 'true',",
    "  'try', 'typeof', 'undefined', 'var', 'void', 'while', 'with', 'yield'",
    '])',
    '',
    'function __clone(value) {',
    '  if (value === undefined) return value',
    '  return JSON.parse(JSON.stringify(value))',
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
    'function __serializeData(value) {',
    '  return JSON.stringify(value)',
    '}',
    '',
    'function __initializeWidgetData(executionState) {',
    '  const previousData = __serializeData(__widgetData)',
    '  const declaredData = __widgetConfig && __widgetConfig.data',
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
    'function __createWidgetHttpClient() {',
    `  const request = (method, url, input = {}) => ${SANDBOX_HTTP_HOST_FUNCTION_NAME}({ ...__clone(input), method, url })`,
    '  return {',
    "    get: (url, input = {}) => request('GET', url, input),",
    "    post: (url, input = {}) => request('POST', url, input),",
    "    put: (url, input = {}) => request('PUT', url, input),",
    "    patch: (url, input = {}) => request('PATCH', url, input),",
    "    delete: (url, input = {}) => request('DELETE', url, input)",
    '  }',
    '}',
    '',
    'function __createExecutionState() {',
    '  return { dataChanged: false, sendMessage: undefined, pendingMethodCalls: [] }',
    '}',
    '',
    'function __isObjectLike(value) {',
    "  return value !== null && typeof value === 'object'",
    '}',
    '',
    'function __createWidgetDataProxy(value, executionState, proxyCache) {',
    '  if (!__isObjectLike(value)) return value',
    '  const cachedProxy = proxyCache.get(value)',
    '  if (cachedProxy) return cachedProxy',
    '  const proxy = new Proxy(value, {',
    '    get(target, property, receiver) {',
    '      const childValue = Reflect.get(target, property, receiver)',
    '      return __createWidgetDataProxy(childValue, executionState, proxyCache)',
    '    },',
    '    set(target, property, nextValue, receiver) {',
    '      const previousValue = Reflect.get(target, property, receiver)',
    '      const didSet = Reflect.set(target, property, __clone(nextValue), receiver)',
    '      if (didSet && !Object.is(previousValue, nextValue)) executionState.dataChanged = true',
    '      return didSet',
    '    },',
    '    deleteProperty(target, property) {',
    '      const hadProperty = Object.prototype.hasOwnProperty.call(target, property)',
    '      const didDelete = Reflect.deleteProperty(target, property)',
    '      if (didDelete && hadProperty) executionState.dataChanged = true',
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
    '      return __createWidgetDataProxy(__widgetData[key], executionState, proxyCache)',
    '    },',
    '    set(value) {',
    '      __widgetData[key] = __clone(value)',
    '      executionState.dataChanged = true',
    '    }',
    '  })',
    '}',
    '',
    'function __createWidgetRootProxy(target, executionState, proxyCache) {',
    '  return new Proxy(target, {',
    '    get(targetObject, property, receiver) {',
    '      if (Reflect.has(targetObject, property)) return Reflect.get(targetObject, property, receiver)',
    "      if (typeof property === 'string' && Object.prototype.hasOwnProperty.call(__widgetData, property)) {",
    '        return __createWidgetDataProxy(__widgetData[property], executionState, proxyCache)',
    '      }',
    '      return undefined',
    '    },',
    '    set(targetObject, property, value, receiver) {',
    '      if (Reflect.has(targetObject, property)) return Reflect.set(targetObject, property, value, receiver)',
    "      if (typeof property !== 'string') return Reflect.set(targetObject, property, value, receiver)",
    '      __widgetData[property] = __clone(value)',
    '      __defineWidgetDataAccessor(targetObject, property, executionState, proxyCache)',
    '      executionState.dataChanged = true',
    '      return true',
    '    },',
    '    has(targetObject, property) {',
    "      return Reflect.has(targetObject, property) || (typeof property === 'string' && Object.prototype.hasOwnProperty.call(__widgetData, property))",
    '    },',
    '    deleteProperty(targetObject, property) {',
    "      if (property === '$input' || property === '$http' || property === '$sendMessage') return Reflect.deleteProperty(targetObject, property)",
    "      if (typeof property === 'string' && Object.prototype.hasOwnProperty.call(__widgetData, property)) {",
    '        const didDeleteData = delete __widgetData[property]',
    '        if (Reflect.has(targetObject, property)) Reflect.deleteProperty(targetObject, property)',
    '        if (didDeleteData) executionState.dataChanged = true',
    '        return didDeleteData',
    '      }',
    '      if (Reflect.has(targetObject, property)) return Reflect.deleteProperty(targetObject, property)',
    '      return true',
    '    }',
    '  })',
    '}',
    '',
    'function __createWidgetThisContext(executionState) {',
    '  const proxyCache = new WeakMap()',
    '  const context = {',
    '    get $input() { return __clone(__widgetInput) },',
    '    $http: __createWidgetHttpClient(),',
    '    async $sendMessage(message) {',
    '      const sendMessage = __normalizeSendMessage(message)',
    '      if (sendMessage) executionState.sendMessage = sendMessage',
    '    }',
    '  }',
    '  for (const key of Object.keys(__widgetData)) {',
    "    if (key === '$input' || key === '$http' || key === '$sendMessage') continue",
    '    __defineWidgetDataAccessor(context, key, executionState, proxyCache)',
    '  }',
    '  return __createWidgetRootProxy(context, executionState, proxyCache)',
    '}',
    '',
    'function __canUseAsBindingName(name) {',
    '  return /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(name) && !__widgetReservedBindingNames.has(name)',
    '}',
    '',
    'function __createMethodBindings(widgetThis, executionState) {',
    '  const methods = __widgetConfig && __widgetConfig.methods',
    '  if (!__isPlainRecord(methods)) return {}',
    '  const bindings = {}',
    '  for (const [methodName, method] of Object.entries(methods)) {',
    "    if (typeof method !== 'function') continue",
    '    const boundMethod = (...args) => {',
    '      try {',
    '        const result = Reflect.apply(method, widgetThis, args)',
    '        const pendingCall = Promise.resolve(result).catch(() => undefined)',
    '        executionState.pendingMethodCalls.push(pendingCall)',
    '        return result',
    '      } catch (error) {',
    '        throw error',
    '      }',
    '    }',
    '    Object.defineProperty(widgetThis, methodName, { value: boundMethod, configurable: true, enumerable: false })',
    '    if (__canUseAsBindingName(methodName)) bindings[methodName] = boundMethod',
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
    'async function __runInteractionCode(interactionCode, widgetThis, executionState) {',
    '  const methodBindings = __createMethodBindings(widgetThis, executionState)',
    '  const bindingNames = Object.keys(methodBindings)',
    "  const interactionBody = '\"use strict\";\\nreturn (async function() {\\n' + interactionCode + '\\n}).call(widgetThis);'",
    "  const fn = __sandbox.createFunction(['widgetThis', ...bindingNames], interactionBody)",
    '  await fn(widgetThis, ...bindingNames.map((name) => methodBindings[name]))',
    '}',
    '',
    'async function __runWidgetRuntime(lifecycleName, interactionCode) {',
    '  const executionState = __createExecutionState()',
    '  __initializeWidgetData(executionState)',
    '  const widgetThis = __createWidgetThisContext(executionState)',
    '  __createMethodBindings(widgetThis, executionState)',
    '  if (lifecycleName) {',
    '    const lifecycle = __widgetConfig && __widgetConfig[lifecycleName]',
    "    if (typeof lifecycle === 'function') await Reflect.apply(lifecycle, widgetThis, [])",
    '  } else if (typeof interactionCode === "string" && interactionCode.trim()) {',
    '    await __runInteractionCode(interactionCode, widgetThis, executionState)',
    '  }',
    '  await __flushPendingMethodCalls(executionState)',
    '  return {',
    '    data: __clone(__widgetData),',
    '    dataChanged: executionState.dataChanged,',
    '    ...(executionState.sendMessage ? { sendMessage: __clone(executionState.sendMessage) } : {})',
    '  }',
    '}',
    '',
    'const Widget = (value) => {',
    '  if (__isPlainRecord(value)) __widgetConfig = value',
    '  return value',
    '}',
    'const defineConfig = () => undefined',
    '',
    "const __runWidgetScript = __sandbox.createFunction(['Widget', 'defineConfig'], __widgetScriptCode)",
    '__runWidgetScript(Widget, defineConfig)',
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
        __initialWidgetData: payload.data,
        __widgetScriptCode: compileSandboxSource(payload.scriptCode, 'widget-script.ts')
      }
    },
    {
      useWorker: options.useWorker ?? !isTestEnvironment(),
      timeoutMs: options.timeoutMs,
      hostFunctions: createSandboxHttpHost({
        request: (request: RequestInput): Promise<RequestResponse> => runWidgetHttpRequest(options.http, request),
        functionName: SANDBOX_HTTP_HOST_FUNCTION_NAME,
        disabledMessage: '当前环境未启用小组件 HTTP 客户端',
        invalidRequestMessage: '小组件 HTTP 请求参数无效'
      })
    }
  );

  if (!isWidgetScriptRunResult(result.value)) {
    throw new Error('小组件脚本返回结果无效');
  }

  return result.value;
}

/**
 * 将脚本运行错误写回为失败状态。
 * @param part - 原始小组件消息片段。
 * @returns 失败状态的小组件消息片段。
 */
function createFailedWidgetPart(part: ChatMessageWidgetPart): ChatMessageWidgetPart {
  return {
    ...cloneDeep(part),
    status: 'failure'
  };
}

/**
 * 判断小组件脚本是否启用。
 * @param part - 小组件消息片段
 * @returns 是否启用脚本
 */
function isWidgetScriptEnabled(part: ChatMessageWidgetPart): boolean {
  return part.value.execute?.enabled !== false;
}

/**
 * 把沙箱运行结果写回 Widget part。
 * @param part - 原始小组件消息片段
 * @param result - 沙箱运行结果
 * @returns 写回数据后的消息片段
 */
function applyWidgetSandboxResult(part: ChatMessageWidgetPart, result: WidgetScriptRunResult): ChatMessageWidgetPart {
  if (!result.dataChanged) return part;

  return {
    ...part,
    renderContext: {
      ...part.renderContext,
      data: result.data
    }
  };
}

/**
 * 运行 Widget 沙箱脚本。
 * @param part - 小组件消息片段
 * @param options - 沙箱执行选项
 * @returns 沙箱运行结果
 */
function runPartSandbox(part: ChatMessageWidgetPart, options: WidgetPartSandboxOptions = {}): Promise<WidgetScriptRunResult> {
  return runWidgetScriptSandbox(
    {
      scriptCode: part.value.execute?.code ?? 'Widget({})',
      ...(options.interactionCode !== undefined ? { interactionCode: options.interactionCode } : {}),
      ...(options.lifecycleName ? { lifecycleName: options.lifecycleName } : {}),
      input: part.renderContext.input,
      data: part.renderContext.data
    },
    {
      http: options.http,
      useWorker: options.useWorker,
      timeoutMs: options.timeoutMs
    }
  );
}

/**
 * 小组件完成态创建选项。
 */
interface WidgetFinishedResultOptions {
  /** 脚本通过 this.$sendMessage 声明的上行消息。 */
  sendMessage?: WidgetRuntimeSendMessage;
  /** 当前时间来源，测试中可注入固定时间。 */
  now?: () => Date;
}

/**
 * 创建小组件完成态结果。
 * @param part - 小组件消息片段
 * @param options - 完成态创建选项
 * @returns 小组件运行态收尾结果
 */
function createWidgetFinishedResult(part: ChatMessageWidgetPart, options: WidgetFinishedResultOptions = {}): WidgetRuntimeFinishResult {
  const unmountedAt = (options.now ?? (() => new Date()))().toISOString();

  return {
    part: {
      ...part,
      status: 'finished',
      lifecycle: {
        ...part.lifecycle,
        unmountedAt
      }
    },
    ...(options.sendMessage ? { sendMessage: options.sendMessage } : {})
  };
}

/**
 * 初始化 created 小组件的 mounted 状态，并返回可写回消息的下一版 part。
 * @param part - 小组件消息片段。
 * @param options - 生命周期执行选项。
 * @returns 运行后的消息片段；非 created 状态原样返回。
 */
export async function initWidgetMountState(part: ChatMessageWidgetPart, options: WidgetLifecycleRunOptions = {}): Promise<ChatMessageWidgetPart> {
  if (part.status !== 'created' || part.lifecycle.mountedAt) return part;
  if (!isWidgetScriptEnabled(part)) return part;

  const nextPart = cloneDeep(part);
  const mountedAt = (options.now ?? (() => new Date()))().toISOString();

  try {
    const sandboxResult = await runPartSandbox(nextPart, { ...options, lifecycleName: 'mounted' });
    const mountedPart = applyWidgetSandboxResult(nextPart, sandboxResult);

    return { ...mountedPart, status: 'mounted', lifecycle: { ...mountedPart.lifecycle, mountedAt } };
  } catch {
    return createFailedWidgetPart(part);
  }
}

/**
 * 完成 mounted 小组件运行态，并收集 unmounted 中的上行消息。
 * @param part - 小组件消息片段。
 * @param options - 生命周期执行选项。
 * @returns 小组件运行态收尾结果。
 */
export async function finishWidgetRuntime(part: ChatMessageWidgetPart, options: WidgetLifecycleRunOptions = {}): Promise<WidgetRuntimeFinishResult> {
  if (part.status !== 'mounted' || part.lifecycle.unmountedAt) {
    return { part };
  }
  if (!isWidgetScriptEnabled(part)) return { part };

  const nextPart = cloneDeep(part);

  try {
    const sandboxResult = await runPartSandbox(nextPart, { ...options, lifecycleName: 'unmounted' });
    const finishedPart = applyWidgetSandboxResult(nextPart, sandboxResult);

    return createWidgetFinishedResult(finishedPart, {
      sendMessage: sandboxResult.sendMessage,
      now: options.now
    });
  } catch {
    return { part: createFailedWidgetPart(part) };
  }
}

/**
 * 运行元素声明的交互表达式。
 * @param part - 小组件消息片段
 * @param interactionCode - 元素交互表达式
 * @param options - 生命周期执行选项
 * @returns 交互执行结果
 */
async function runWidgetInteraction(
  part: ChatMessageWidgetPart,
  interactionCode: string,
  options: WidgetLifecycleRunOptions = {}
): Promise<WidgetRuntimeFinishResult> {
  if (part.status !== 'mounted' || !isWidgetScriptEnabled(part)) return { part };
  if (!interactionCode.trim()) return { part };

  try {
    const nextPart = cloneDeep(part);
    const sandboxResult = await runPartSandbox(nextPart, { ...options, interactionCode });
    const interactedPart = applyWidgetSandboxResult(nextPart, sandboxResult);

    if (sandboxResult.sendMessage) {
      const finishResult = await finishWidgetRuntime(interactedPart, options);

      return {
        part: finishResult.part,
        sendMessage: sandboxResult.sendMessage
      };
    }

    if (!sandboxResult.dataChanged) return { part };

    return { part: { ...interactedPart, status: 'mounted' } };
  } catch {
    return { part: createFailedWidgetPart(part) };
  }
}

/**
 * 创建小组件运行态实例。
 * @param part - 小组件消息片段
 * @param options - 生命周期执行选项
 * @returns 小组件运行态实例
 */
export function createWidgetRuntimeInstance(part: ChatMessageWidgetPart, options: WidgetLifecycleRunOptions = {}): WidgetRuntimeInstance {
  return {
    runInteraction: (interactionCode: string): Promise<WidgetRuntimeFinishResult> => runWidgetInteraction(part, interactionCode, options)
  };
}

/**
 * 初始化 mounted 小组件的 unmounted 收尾状态，并返回可写回消息的下一版 part。
 * @param part - 小组件消息片段。
 * @param options - 生命周期执行选项。
 * @returns 收尾后的消息片段；已收尾或不可收尾状态原样返回。
 */
export async function finishWidgetUnmountState(part: ChatMessageWidgetPart, options: WidgetLifecycleRunOptions = {}): Promise<ChatMessageWidgetPart> {
  return (await finishWidgetRuntime(part, options)).part;
}
