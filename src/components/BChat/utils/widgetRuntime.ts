/**
 * @file widgetRuntime.ts
 * @description BChat 小组件消息片段的轻量脚本运行工具。
 */
import type { ChatMessageWidgetPart } from 'types/chat';
import { cloneDeep, get, set } from 'lodash-es';
import ts from 'typescript';

/**
 * 小组件脚本生命周期执行选项。
 */
interface WidgetLifecycleRunOptions {
  /** 当前时间来源，测试中可注入固定时间。 */
  now?: () => Date;
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
  input: Record<string, unknown>;
  /** Widget 会话状态。 */
  state: Record<string, unknown>;
  /** 生命周期函数体内已经解析出的局部常量。 */
  variables: Map<string, unknown>;
}

/**
 * 判断节点是否为 defineConfig 调用。
 * @param node - 待检查节点
 * @returns 是否为 defineConfig 调用
 */
function isDefineConfigCall(node: ts.Node): node is ts.CallExpression {
  return ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'defineConfig';
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
 * 从 defineConfig 配置对象读取指定生命周期函数体。
 * @param code - 小组件交互脚本。
 * @param lifecycleName - 生命周期名称。
 * @returns 生命周期函数节点，不存在时返回 undefined。
 */
function findWidgetLifecycleFunction(code: string, lifecycleName: WidgetLifecycleName): WidgetFunctionNodeWithBody | undefined {
  const sourceFile = ts.createSourceFile('widget-runtime.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let lifecycleFunction: WidgetFunctionNodeWithBody | undefined;

  /**
   * 访问脚本节点并提取 defineConfig 中的生命周期函数。
   * @param node - 当前节点
   */
  function visit(node: ts.Node): void {
    if (lifecycleFunction) return;

    if (isDefineConfigCall(node) && ts.isObjectLiteralExpression(node.arguments[0])) {
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
 * 求值受支持的表达式。
 * @param expression - 待求值表达式
 * @param context - 求值上下文
 * @returns 表达式值，不支持时返回 undefined
 */
function evaluateExpression(expression: ts.Expression, context: WidgetExpressionEvalContext): unknown {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) return expression.text;
  if (ts.isNumericLiteral(expression)) return Number(expression.text);
  if (expression.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (expression.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (expression.kind === ts.SyntaxKind.NullKeyword) return null;

  if (ts.isIdentifier(expression)) {
    return context.variables.get(expression.text);
  }

  const contextPath = readThisContextPath(expression);
  if (contextPath) {
    const source = contextPath.root === 'input' ? context.input : context.state;
    return contextPath.path.length ? get(source, contextPath.path) : source;
  }

  if (ts.isArrayLiteralExpression(expression)) {
    return expression.elements.map((item: ts.Expression): unknown => evaluateExpression(item, context));
  }

  if (ts.isObjectLiteralExpression(expression)) {
    const value: Record<string, unknown> = {};

    for (const property of expression.properties) {
      if (ts.isPropertyAssignment(property)) {
        const propertyName = readPropertyName(property.name);
        if (!propertyName) continue;
        value[propertyName] = evaluateExpression(property.initializer, context);
      } else if (ts.isShorthandPropertyAssignment(property)) {
        value[property.name.text] = context.variables.get(property.name.text);
      }
    }

    return value;
  }

  return undefined;
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
 * 执行受支持的生命周期语句。
 * @param lifecycleFunction - 生命周期函数节点
 * @param part - 小组件消息片段
 */
function applyLifecycleSetStateCalls(lifecycleFunction: WidgetFunctionNodeWithBody | undefined, part: ChatMessageWidgetPart): void {
  if (!lifecycleFunction) return;

  const context: WidgetExpressionEvalContext = {
    input: part.renderContext.input,
    state: part.renderContext.state,
    variables: new Map<string, unknown>()
  };

  for (const statement of lifecycleFunction.body.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
        context.variables.set(declaration.name.text, evaluateExpression(declaration.initializer, context));
      }
      continue;
    }

    if (!ts.isExpressionStatement(statement) || !isSetStateCall(statement.expression)) continue;

    const [pathExpression, valueExpression] = statement.expression.arguments;
    if (!pathExpression || !valueExpression || !ts.isStringLiteral(pathExpression)) continue;

    const value = evaluateExpression(valueExpression, context);
    set(part.renderContext.state, pathExpression.text, value);
  }
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
 * 初始化 created 小组件的 mounted 状态，并返回可写回消息的下一版 part。
 * @param part - 小组件消息片段。
 * @param options - 生命周期执行选项。
 * @returns 运行后的消息片段；非 created 状态原样返回。
 */
export async function initWidgetMountState(part: ChatMessageWidgetPart, options: WidgetLifecycleRunOptions = {}): Promise<ChatMessageWidgetPart> {
  if (part.status !== 'created' || part.lifecycle.mountedAt) {
    return part;
  }

  const nextPart = cloneDeep(part);
  const mountedAt = (options.now ?? (() => new Date()))().toISOString();

  try {
    const mountedFunction = findWidgetLifecycleFunction(nextPart.value.execute?.code ?? 'defineConfig({})', 'mounted');
    applyLifecycleSetStateCalls(mountedFunction, nextPart);

    return {
      ...nextPart,
      status: 'mounted',
      lifecycle: {
        ...nextPart.lifecycle,
        mountedAt
      }
    };
  } catch {
    return createFailedWidgetPart(part);
  }
}

/**
 * 初始化 mounted 小组件的 unmounted 收尾状态，并返回可写回消息的下一版 part。
 * @param part - 小组件消息片段。
 * @param options - 生命周期执行选项。
 * @returns 收尾后的消息片段；已收尾或不可收尾状态原样返回。
 */
export function finishWidgetUnmountState(part: ChatMessageWidgetPart, options: WidgetLifecycleRunOptions = {}): ChatMessageWidgetPart {
  if (part.status !== 'mounted' || part.lifecycle.unmountedAt) {
    return part;
  }

  const nextPart = cloneDeep(part);
  const unmountedAt = (options.now ?? (() => new Date()))().toISOString();

  try {
    const unmountedFunction = findWidgetLifecycleFunction(nextPart.value.execute?.code ?? 'defineConfig({})', 'unmounted');
    applyLifecycleSetStateCalls(unmountedFunction, nextPart);

    return {
      ...nextPart,
      status: 'finished',
      lifecycle: {
        ...nextPart.lifecycle,
        unmountedAt
      }
    };
  } catch {
    return createFailedWidgetPart(part);
  }
}
