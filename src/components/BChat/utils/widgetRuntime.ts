/**
 * @file widgetRuntime.ts
 * @description BChat 小组件消息片段的轻量脚本运行工具。
 */
import type { ChatMessageWidgetPart } from 'types/chat';
import type { RequestInput, RequestResponse } from 'types/request';
import type { WidgetHttpClient, WidgetRuntimeSendMessage } from 'types/widget';
import { cloneDeep, get, isPlainObject, set } from 'lodash-es';
import ts from 'typescript';
import { getElectronAPI } from '@/shared/platform/electron-api';
import { normalizeWidgetSendMessage } from '@/shared/widget/protocol';

/**
 * 小组件脚本生命周期执行选项。
 */
interface WidgetLifecycleRunOptions {
  /** 当前时间来源，测试中可注入固定时间。 */
  now?: () => Date;
  /** 小组件托管 HTTP 客户端。 */
  http?: WidgetHttpClient;
  /** 是否允许当前语句列表触发用户辅助函数调用。 */
  allowUserMethodCalls?: boolean;
  /** 当前 Widget JS 脚本，用于从 Widget.methods 中读取用户辅助函数。 */
  widgetScriptCode?: string;
}

/**
 * 小组件语句执行选项。
 */
interface WidgetStatementRunOptions extends WidgetLifecycleRunOptions {
  /** 语句执行前注入的局部变量。 */
  initialVariables?: Map<string, unknown>;
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

/** 带函数体的小组件配置函数节点。 */
type WidgetFunctionNodeWithBody = (ts.MethodDeclaration | ts.FunctionExpression | ts.ArrowFunction) & { body: ts.Block };

/** 小组件脚本生命周期名称。 */
type WidgetLifecycleName = 'mounted' | 'unmounted';

/**
 * 受限表达式求值上下文。
 */
interface WidgetExpressionEvalContext {
  /** Widget 启动入参。 */
  input: ChatMessageWidgetPart['renderContext']['input'];
  /** Widget 会话状态。 */
  state: ChatMessageWidgetPart['renderContext']['state'];
  /** 生命周期函数体内已经解析出的局部常量。 */
  variables: Map<string, unknown>;
  /** 托管 HTTP 客户端。 */
  http?: WidgetHttpClient;
}

/**
 * 生命周期函数受限执行结果。
 */
interface WidgetLifecycleExecutionResult {
  /** 生命周期函数中最后一次 this.$sendMessage 的载荷。 */
  sendMessage?: WidgetRuntimeSendMessage;
  /** 本次执行是否写入过状态。 */
  stateChanged?: boolean;
}

/** 小组件 HTTP 方法名。 */
type WidgetHttpMethodName = keyof WidgetHttpClient;

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
 * 判断节点是否为 Widget 配置调用。
 * @param node - 待检查节点
 * @returns 是否为 Widget 配置调用
 */
function isWidgetConfigCall(node: ts.Node): node is ts.CallExpression {
  return ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Widget';
}

/**
 * 读取对象属性名称。
 * @param name - 属性名称节点
 * @returns 属性名称文本，无法静态读取时返回 undefined
 */
function readPropertyName(name: ts.PropertyName | undefined): string | undefined {
  if (!name) return undefined;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return undefined;
}

/**
 * 判断函数节点是否带普通 block 函数体。
 * @param node - 待检查节点
 * @returns 是否带 block 函数体
 */
function hasBlockBody(node: ts.MethodDeclaration | ts.FunctionExpression | ts.ArrowFunction): node is WidgetFunctionNodeWithBody {
  return node.body !== undefined && ts.isBlock(node.body);
}

/**
 * 从 Widget 配置对象读取指定生命周期函数体。
 * @param code - 小组件JS 脚本。
 * @param lifecycleName - 生命周期名称。
 * @returns 生命周期函数节点，不存在时返回 undefined。
 */
function findWidgetLifecycleFunction(code: string, lifecycleName: WidgetLifecycleName): WidgetFunctionNodeWithBody | undefined {
  const sourceFile = ts.createSourceFile('widget-runtime.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let lifecycleFunction: WidgetFunctionNodeWithBody | undefined;

  /**
   * 访问脚本节点并提取 Widget 配置中的生命周期函数。
   * @param node - 当前节点
   */
  function visit(node: ts.Node): void {
    if (lifecycleFunction) return;

    if (isWidgetConfigCall(node) && ts.isObjectLiteralExpression(node.arguments[0])) {
      const configObject = node.arguments[0];
      for (const property of configObject.properties) {
        const propertyName = readPropertyName(property.name);
        if (propertyName !== lifecycleName) continue;

        if (ts.isMethodDeclaration(property) && hasBlockBody(property)) {
          lifecycleFunction = property;
          return;
        }

        if (
          ts.isPropertyAssignment(property) &&
          (ts.isFunctionExpression(property.initializer) || ts.isArrowFunction(property.initializer)) &&
          hasBlockBody(property.initializer)
        ) {
          lifecycleFunction = property.initializer;
          return;
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return lifecycleFunction;
}

/**
 * 从 Widget methods 中读取指定用户辅助函数。
 * @param code - 小组件JS 脚本
 * @param methodName - 用户辅助函数名
 * @returns 用户辅助函数节点，不存在时返回 undefined
 */
function findWidgetMethodFunction(code: string, methodName: string): WidgetFunctionNodeWithBody | undefined {
  const sourceFile = ts.createSourceFile('widget-runtime.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let methodFunction: WidgetFunctionNodeWithBody | undefined;

  /**
   * 访问脚本节点并提取 Widget methods 中的指定用户辅助函数。
   * @param node - 当前节点
   */
  function visit(node: ts.Node): void {
    if (methodFunction) return;

    if (isWidgetConfigCall(node) && ts.isObjectLiteralExpression(node.arguments[0])) {
      const methodsProperty = node.arguments[0].properties.find((property) => readPropertyName(property.name) === 'methods');
      if (!methodsProperty || !ts.isPropertyAssignment(methodsProperty) || !ts.isObjectLiteralExpression(methodsProperty.initializer)) return;

      for (const property of methodsProperty.initializer.properties) {
        if (readPropertyName(property.name) !== methodName) continue;

        if (ts.isMethodDeclaration(property) && hasBlockBody(property)) {
          methodFunction = property;
          return;
        }

        if (
          ts.isPropertyAssignment(property) &&
          (ts.isFunctionExpression(property.initializer) || ts.isArrowFunction(property.initializer)) &&
          hasBlockBody(property.initializer)
        ) {
          methodFunction = property.initializer;
          return;
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return methodFunction;
}

/**
 * 读取属性访问链上的静态属性名。
 * @param expression - 属性访问表达式
 * @returns 根对象与路径，不匹配 this.$input/this.$state 时返回 null
 */
function readThisContextPath(expression: ts.Expression): { root: 'input' | 'state'; path: string[] } | null {
  if (ts.isPropertyAccessExpression(expression)) {
    const parentPath = readThisContextPath(expression.expression);
    if (parentPath) {
      return {
        root: parentPath.root,
        path: [...parentPath.path, expression.name.text]
      };
    }

    if (expression.expression.kind !== ts.SyntaxKind.ThisKeyword) return null;
    if (expression.name.text === '$input') return { root: 'input', path: [] };
    if (expression.name.text === '$state') return { root: 'state', path: [] };
    return null;
  }

  if (ts.isElementAccessExpression(expression) && ts.isStringLiteral(expression.argumentExpression)) {
    const parentPath = readThisContextPath(expression.expression);
    if (!parentPath) return null;

    return {
      root: parentPath.root,
      path: [...parentPath.path, expression.argumentExpression.text]
    };
  }

  return null;
}

/**
 * 读取局部变量属性访问路径。
 * @param expression - 属性访问表达式
 * @returns 变量名与属性路径
 */
function readVariablePath(expression: ts.Expression): { name: string; path: string[] } | null {
  if (ts.isIdentifier(expression)) {
    return { name: expression.text, path: [] };
  }

  if (ts.isPropertyAccessExpression(expression)) {
    const parentPath = readVariablePath(expression.expression);
    if (!parentPath) return null;

    return {
      name: parentPath.name,
      path: [...parentPath.path, expression.name.text]
    };
  }

  if (ts.isElementAccessExpression(expression) && ts.isStringLiteral(expression.argumentExpression)) {
    const parentPath = readVariablePath(expression.expression);
    if (!parentPath) return null;

    return {
      name: parentPath.name,
      path: [...parentPath.path, expression.argumentExpression.text]
    };
  }

  return null;
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
 * 去除 await 包裹。
 * @param expression - 表达式
 * @returns 去除 await 后的表达式
 */
function unwrapAwaitExpression(expression: ts.Expression): ts.Expression {
  return ts.isAwaitExpression(expression) ? expression.expression : expression;
}

/**
 * 读取交互代码中的用户辅助函数调用表达式。
 * @param expression - 表达式
 * @returns 用户辅助函数调用表达式，不匹配时返回 null
 */
function readUserHelperCallExpression(expression: ts.Expression): ts.CallExpression | null {
  return ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) ? expression : null;
}

/**
 * 判断表达式是否为 this.$http.method(...) 调用。
 * @param expression - 待检查表达式
 * @returns 是否为 HTTP 调用
 */
function isHttpCall(expression: ts.Expression): expression is ts.CallExpression {
  if (!ts.isCallExpression(expression) || !ts.isPropertyAccessExpression(expression.expression)) return false;
  const methodName = expression.expression.name.text;
  if (!['get', 'post', 'put', 'patch', 'delete'].includes(methodName)) return false;

  const target = expression.expression.expression;
  return ts.isPropertyAccessExpression(target) && target.expression.kind === ts.SyntaxKind.ThisKeyword && target.name.text === '$http';
}

/**
 * 求值受支持的表达式。
 * @param expression - 待求值表达式
 * @param context - 求值上下文
 * @returns 表达式值，不支持时返回 undefined
 */
async function evaluateExpression(expression: ts.Expression, context: WidgetExpressionEvalContext): Promise<unknown> {
  const unwrappedExpression = unwrapAwaitExpression(expression);
  if (unwrappedExpression !== expression) {
    return evaluateExpression(unwrappedExpression, context);
  }

  if (isHttpCall(expression)) {
    if (!context.http || !ts.isPropertyAccessExpression(expression.expression)) {
      throw new Error('当前环境未启用小组件 HTTP 客户端');
    }

    const methodName = expression.expression.name.text as WidgetHttpMethodName;
    const [urlExpression, optionsExpression] = expression.arguments;
    const url = urlExpression ? await evaluateExpression(urlExpression, context) : undefined;
    if (typeof url !== 'string') {
      throw new Error('小组件 HTTP URL 必须是字符串');
    }

    const options = optionsExpression ? await evaluateExpression(optionsExpression, context) : undefined;
    const method = context.http[methodName] as (url: string, request?: Record<string, unknown>) => Promise<unknown>;
    return method(url, isPlainRecord(options) ? options : undefined);
  }

  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) return expression.text;
  if (ts.isNumericLiteral(expression)) return Number(expression.text);
  if (expression.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (expression.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (expression.kind === ts.SyntaxKind.NullKeyword) return null;

  const contextPath = readThisContextPath(expression);
  if (contextPath) {
    const source = contextPath.root === 'input' ? context.input : context.state;
    return contextPath.path.length ? get(source, contextPath.path) : source;
  }

  const variablePath = readVariablePath(expression);
  if (variablePath) {
    const source = context.variables.get(variablePath.name);
    return variablePath.path.length ? get(source, variablePath.path) : source;
  }

  if (ts.isArrayLiteralExpression(expression)) {
    return Promise.all(expression.elements.map((item: ts.Expression): Promise<unknown> => evaluateExpression(item, context)));
  }

  if (ts.isObjectLiteralExpression(expression)) {
    const value: Record<string, unknown> = {};
    const propertyEntries = await Promise.all(
      expression.properties.map(async (property): Promise<[string, unknown] | null> => {
        if (ts.isPropertyAssignment(property)) {
          const propertyName = readPropertyName(property.name);
          if (!propertyName) return null;
          return [propertyName, await evaluateExpression(property.initializer, context)];
        }

        if (ts.isShorthandPropertyAssignment(property)) {
          return [property.name.text, context.variables.get(property.name.text)];
        }

        return null;
      })
    );

    for (const entry of propertyEntries) {
      if (!entry) continue;
      const [propertyName, propertyValue] = entry;
      value[propertyName] = propertyValue;
    }

    return value;
  }

  return undefined;
}

/**
 * 根据用户辅助函数形参创建局部变量。
 * @param helperFunction - 用户辅助函数节点
 * @param callExpression - 交互表达式中的调用节点
 * @param context - 当前求值上下文
 * @returns 注入到用户辅助函数作用域的局部变量
 */
async function createUserHelperInitialVariables(
  helperFunction: WidgetFunctionNodeWithBody,
  callExpression: ts.CallExpression,
  context: WidgetExpressionEvalContext
): Promise<Map<string, unknown>> {
  const variables = new Map<string, unknown>();

  for (let index = 0; index < helperFunction.parameters.length; index += 1) {
    const parameter = helperFunction.parameters[index];
    if (!ts.isIdentifier(parameter.name)) continue;

    if (parameter.dotDotDotToken) {
      const restValues: unknown[] = [];
      for (const argument of callExpression.arguments.slice(index)) {
        // 参数按源码顺序求值，避免依赖前序副作用时顺序错乱。
        // eslint-disable-next-line no-await-in-loop
        restValues.push(await evaluateExpression(argument, context));
      }
      variables.set(parameter.name.text, restValues);
      break;
    }

    const argument = callExpression.arguments[index];
    if (!argument) continue;

    // 参数按源码顺序求值，避免依赖前序副作用时顺序错乱。
    // eslint-disable-next-line no-await-in-loop
    variables.set(parameter.name.text, await evaluateExpression(argument, context));
  }

  return variables;
}

/**
 * 判断表达式是否为 this.$setState(...) 调用。
 * @param expression - 待检查表达式
 * @returns 是否为 setState 调用
 */
function isSetStateCall(expression: ts.Expression): expression is ts.CallExpression {
  return (
    ts.isCallExpression(expression) &&
    ts.isPropertyAccessExpression(expression.expression) &&
    expression.expression.expression.kind === ts.SyntaxKind.ThisKeyword &&
    expression.expression.name.text === '$setState'
  );
}

/**
 * 判断表达式是否为 this.$sendMessage(...) 调用。
 * @param expression - 待检查表达式
 * @returns 是否为 sendMessage 调用
 */
function isSendMessageCall(expression: ts.Expression): expression is ts.CallExpression {
  return (
    ts.isCallExpression(expression) &&
    ts.isPropertyAccessExpression(expression.expression) &&
    expression.expression.expression.kind === ts.SyntaxKind.ThisKeyword &&
    expression.expression.name.text === '$sendMessage'
  );
}

/**
 * 执行受支持的小组件脚本语句。
 * @param statements - 待执行语句列表
 * @param part - 小组件消息片段
 * @param options - 生命周期执行选项
 * @returns 脚本语句执行结果
 */
async function runWidgetStatements(
  statements: readonly ts.Statement[],
  part: ChatMessageWidgetPart,
  options: WidgetStatementRunOptions = {}
): Promise<WidgetLifecycleExecutionResult> {
  const result: WidgetLifecycleExecutionResult = {};
  const context: WidgetExpressionEvalContext = {
    input: part.renderContext.input,
    state: part.renderContext.state,
    variables: new Map<string, unknown>(options.initialVariables),
    http: options.http
  };

  for (const statement of statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;

        // 局部变量按源码顺序解析，后续变量可以依赖前面声明的变量。
        // eslint-disable-next-line no-await-in-loop
        const value = await evaluateExpression(declaration.initializer, context);
        context.variables.set(declaration.name.text, value);
      }
      continue;
    }

    if (!ts.isExpressionStatement(statement)) continue;
    const expression = unwrapAwaitExpression(statement.expression);

    if (isHttpCall(expression)) {
      // 独立 HTTP 调用也需要按源码顺序等待，避免后续状态过早写入。
      // eslint-disable-next-line no-await-in-loop
      await evaluateExpression(expression, context);
      continue;
    }

    const userHelperCall = options.allowUserMethodCalls ? readUserHelperCallExpression(expression) : null;
    if (userHelperCall && ts.isIdentifier(userHelperCall.expression)) {
      const userMethodName = userHelperCall.expression.text;
      const methodFunction = findWidgetMethodFunction(options.widgetScriptCode ?? 'Widget({})', userMethodName);
      if (!methodFunction) continue;

      // 参数绑定必须先于辅助函数执行，且保持源码顺序。
      // eslint-disable-next-line no-await-in-loop
      const initialVariables = await createUserHelperInitialVariables(methodFunction, userHelperCall, context);
      // 用户辅助函数只允许由元素交互代码触发，不允许辅助函数内部继续递归调用。
      // eslint-disable-next-line no-await-in-loop
      const helperResult = await runWidgetStatements(methodFunction.body.statements, part, { ...options, allowUserMethodCalls: false, initialVariables });
      if (helperResult.stateChanged) {
        result.stateChanged = true;
      }
      if (helperResult.sendMessage) {
        result.sendMessage = helperResult.sendMessage;
      }
      continue;
    }

    if (isSetStateCall(expression)) {
      const [pathExpression, valueExpression] = expression.arguments;
      if (!pathExpression || !valueExpression || !ts.isStringLiteral(pathExpression)) continue;

      // 状态写入必须按源码顺序执行，避免后续语句读到旧状态。
      // eslint-disable-next-line no-await-in-loop
      const value = await evaluateExpression(valueExpression, context);
      set(part.renderContext.state, pathExpression.text, value);
      result.stateChanged = true;
      continue;
    }

    if (!isSendMessageCall(expression)) continue;

    const [payloadExpression] = expression.arguments;
    if (!payloadExpression) continue;

    // 上行消息保留源码顺序，最后一次 sendMessage 作为最终提交内容。
    // eslint-disable-next-line no-await-in-loop
    const payload = await evaluateExpression(payloadExpression, context);
    const sendMessage = normalizeWidgetSendMessage(payload);
    if (sendMessage) {
      result.sendMessage = sendMessage;
    }
  }

  return result;
}

/**
 * 执行受支持的生命周期语句。
 * @param lifecycleFunction - 生命周期函数节点
 * @param part - 小组件消息片段
 * @param options - 生命周期执行选项
 * @returns 生命周期函数执行结果
 */
async function runLifecycleStatements(
  lifecycleFunction: WidgetFunctionNodeWithBody | undefined,
  part: ChatMessageWidgetPart,
  options: WidgetLifecycleRunOptions = {}
): Promise<WidgetLifecycleExecutionResult> {
  if (!lifecycleFunction) return {};

  return runWidgetStatements(lifecycleFunction.body.statements, part, options);
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
 * 创建小组件完成态结果。
 * @param part - 小组件消息片段
 * @param sendMessage - 可选上行消息
 * @param options - 生命周期执行选项
 * @returns 小组件运行态收尾结果
 */
function createWidgetFinishedResult(
  part: ChatMessageWidgetPart,
  sendMessage?: WidgetRuntimeSendMessage,
  options: WidgetLifecycleRunOptions = {}
): WidgetRuntimeFinishResult {
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
    ...(sendMessage ? { sendMessage } : {})
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
    // 执行 mounted 生命周期
    const mountedFunction = findWidgetLifecycleFunction(nextPart.value.execute?.code ?? 'Widget({})', 'mounted');
    await runLifecycleStatements(mountedFunction, nextPart, options);

    return { ...nextPart, status: 'mounted', lifecycle: { ...nextPart.lifecycle, mountedAt } };
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
    const unmountedFunction = findWidgetLifecycleFunction(nextPart.value.execute?.code ?? 'Widget({})', 'unmounted');
    const lifecycleResult = await runLifecycleStatements(unmountedFunction, nextPart, options);

    return createWidgetFinishedResult(nextPart, lifecycleResult.sendMessage, options);
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

  const sourceFile = ts.createSourceFile('widget-interaction.ts', interactionCode, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (!sourceFile.statements.length) return { part };

  try {
    const nextPart = cloneDeep(part);
    const interactionResult = await runWidgetStatements(sourceFile.statements, nextPart, {
      ...options,
      allowUserMethodCalls: true,
      widgetScriptCode: nextPart.value.execute?.code ?? 'Widget({})'
    });

    if (interactionResult.sendMessage) {
      const finishResult = await finishWidgetRuntime(nextPart, options);

      return {
        part: finishResult.part,
        sendMessage: interactionResult.sendMessage
      };
    }

    if (!interactionResult.stateChanged) return { part };

    return { part: { ...nextPart, status: 'mounted' } };
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
