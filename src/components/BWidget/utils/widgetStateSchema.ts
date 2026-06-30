/**
 * @file widgetStateSchema.ts
 * @description 从 Widget 执行方法代码中构建运行状态 schema。
 */
import type { WidgetSchemaObject, WidgetSchemaProperty } from '../types';
import ts from 'typescript';

/** 空状态 schema。 */
const EMPTY_WIDGET_STATE_SCHEMA: WidgetSchemaObject = {
  type: 'object',
  properties: {},
  required: []
};

/** input 路径别名值；null 表示当前作用域内被同名变量遮蔽。 */
type InputAliasValue = string[] | null;

/** input 路径别名作用域。 */
type InputAliasScope = Map<string, InputAliasValue>;

/** input 路径别名读取函数。 */
type InputAliasReader = (name: string) => string[] | undefined;

/**
 * 可能携带函数体的函数类声明。
 */
type FunctionLikeNodeWithBody =
  | ts.ArrowFunction
  | ts.ConstructorDeclaration
  | ts.FunctionDeclaration
  | ts.FunctionExpression
  | ts.GetAccessorDeclaration
  | ts.MethodDeclaration
  | ts.SetAccessorDeclaration;

/**
 * 创建空对象字段。
 * @returns 对象字段
 */
function createObjectSchemaProperty(): WidgetSchemaProperty {
  return {
    type: 'object',
    properties: {},
    required: []
  };
}

/**
 * 深拷贝 schema 属性，避免推导结果反向修改输入 schema。
 * 状态字段只复用类型结构，不继承 input 字段说明，避免把推导值误展示成显式 label。
 * @param property - schema 属性
 * @returns schema 属性副本
 */
function cloneWidgetSchemaProperty(property: WidgetSchemaProperty): WidgetSchemaProperty {
  return {
    type: property.type,
    ...(property.properties
      ? {
          properties: Object.fromEntries(
            Object.entries(property.properties).map(([key, childProperty]: [string, WidgetSchemaProperty]): [string, WidgetSchemaProperty] => [
              key,
              cloneWidgetSchemaProperty(childProperty)
            ])
          )
        }
      : {}),
    ...(property.required ? { required: [...property.required] } : {}),
    ...(property.items ? { items: cloneWidgetSchemaProperty(property.items) } : {})
  };
}

/**
 * 从对象 schema 中读取指定路径的字段定义。
 * @param schema - 对象 schema
 * @param segments - 字段路径片段
 * @returns 匹配字段定义
 */
function readSchemaPropertyAtPath(schema: WidgetSchemaObject | undefined, segments: string[]): WidgetSchemaProperty | undefined {
  let properties = schema?.properties;
  let currentProperty: WidgetSchemaProperty | undefined;

  for (const segment of segments) {
    currentProperty = properties?.[segment];
    properties = currentProperty?.type === 'object' ? currentProperty.properties : undefined;
  }

  return currentProperty;
}

/**
 * 读取函数类节点的函数体。
 * @param node - 函数类节点
 * @returns 函数体节点，不存在时返回 undefined
 */
function readFunctionLikeBody(node: ts.SignatureDeclaration): ts.ConciseBody | undefined {
  if (
    ts.isArrowFunction(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  ) {
    return (node as FunctionLikeNodeWithBody).body;
  }

  return undefined;
}

/**
 * 读取静态字符串表达式。
 * @param expression - 表达式节点
 * @returns 静态字符串
 */
function readStaticStringExpression(expression: ts.Expression): string | null {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text;
  }

  return null;
}

/**
 * 读取属性名文本。
 * @param name - 属性名节点
 * @returns 属性名文本
 */
function readPropertyName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }

  return null;
}

/**
 * 读取表达式表示的静态访问路径。
 * @param expression - 表达式节点
 * @returns 静态访问路径片段
 */
function readExpressionPathSegments(expression: ts.Expression): string[] | null {
  if (ts.isIdentifier(expression)) {
    return [expression.text];
  }

  if (ts.isPropertyAccessExpression(expression)) {
    const parentSegments = readExpressionPathSegments(expression.expression);

    return parentSegments ? [...parentSegments, expression.name.text] : null;
  }

  if (ts.isElementAccessExpression(expression)) {
    const parentSegments = readExpressionPathSegments(expression.expression);
    const argument = expression.argumentExpression ? readStaticStringExpression(expression.argumentExpression) : null;

    return parentSegments && argument ? [...parentSegments, argument] : null;
  }

  return null;
}

/**
 * 读取表达式对应的 input schema 路径。
 * @param expression - 表达式节点
 * @param readInputAlias - input 路径别名读取函数
 * @returns input schema 路径片段
 */
function readInputSchemaPathSegments(expression: ts.Expression, readInputAlias: InputAliasReader): string[] | null {
  if (ts.isIdentifier(expression)) {
    return readInputAlias(expression.text) ?? null;
  }

  const segments = readExpressionPathSegments(expression);
  if (!segments) {
    return null;
  }

  if (segments[0] === 'input') {
    return segments.slice(1);
  }

  if (segments[0] === 'ctx' && segments[1] === 'input') {
    return segments.slice(2);
  }

  const aliasPath = readInputAlias(segments[0]);
  return aliasPath ? [...aliasPath, ...segments.slice(1)] : null;
}

/**
 * 从表达式推断 schema 字段定义。
 * @param expression - 表达式节点
 * @param inputSchema - input schema
 * @param readInputAlias - input 路径别名读取函数
 * @returns schema 字段定义
 */
function inferSchemaPropertyFromExpression(
  expression: ts.Expression,
  inputSchema: WidgetSchemaObject | undefined,
  readInputAlias: InputAliasReader
): WidgetSchemaProperty {
  const inputPath = readInputSchemaPathSegments(expression, readInputAlias);
  const inputProperty = inputPath ? readSchemaPropertyAtPath(inputSchema, inputPath) : undefined;

  if (inputProperty) {
    return cloneWidgetSchemaProperty(inputProperty);
  }

  if (ts.isObjectLiteralExpression(expression)) {
    const childProperties: Record<string, WidgetSchemaProperty> = {};
    const property: WidgetSchemaProperty = {
      type: 'object',
      properties: childProperties,
      required: []
    };

    for (const item of expression.properties) {
      if (ts.isPropertyAssignment(item)) {
        const propertyName = readPropertyName(item.name);

        if (propertyName) {
          childProperties[propertyName] = inferSchemaPropertyFromExpression(item.initializer, inputSchema, readInputAlias);
        }
      }

      if (ts.isShorthandPropertyAssignment(item)) {
        childProperties[item.name.text] = inferSchemaPropertyFromExpression(item.name, inputSchema, readInputAlias);
      }
    }

    return property;
  }

  if (ts.isArrayLiteralExpression(expression)) {
    const firstElement = expression.elements[0];

    return {
      type: 'array',
      ...(firstElement ? { items: inferSchemaPropertyFromExpression(firstElement, inputSchema, readInputAlias) } : {})
    };
  }

  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression) || ts.isTemplateExpression(expression)) {
    return { type: 'string' };
  }

  if (ts.isNumericLiteral(expression)) {
    return { type: 'number' };
  }

  if (expression.kind === ts.SyntaxKind.TrueKeyword || expression.kind === ts.SyntaxKind.FalseKeyword) {
    return { type: 'boolean' };
  }

  if (ts.isPrefixUnaryExpression(expression) && ts.isNumericLiteral(expression.operand)) {
    return { type: 'number' };
  }

  return { type: 'string' };
}

/**
 * 合并两个 schema 字段定义。
 * @param current - 当前字段
 * @param next - 新字段
 * @returns 合并后的字段
 */
function mergeSchemaProperty(current: WidgetSchemaProperty | undefined, next: WidgetSchemaProperty): WidgetSchemaProperty {
  if (!current) {
    return cloneWidgetSchemaProperty(next);
  }

  if (current.type === 'object' && next.type === 'object') {
    return {
      ...cloneWidgetSchemaProperty(current),
      properties: {
        ...(current.properties ?? {}),
        ...Object.fromEntries(
          Object.entries(next.properties ?? {}).map(([key, childProperty]: [string, WidgetSchemaProperty]): [string, WidgetSchemaProperty] => [
            key,
            mergeSchemaProperty(current.properties?.[key], childProperty)
          ])
        )
      },
      required: []
    };
  }

  return cloneWidgetSchemaProperty(next);
}

/**
 * 将字段定义写入对象 schema 的指定路径。
 * @param properties - 根属性集合
 * @param segments - 状态路径片段
 * @param property - 字段定义
 */
function writeStateSchemaProperty(properties: Record<string, WidgetSchemaProperty>, segments: string[], property: WidgetSchemaProperty): void {
  if (segments.length === 0) {
    return;
  }

  const [segment, ...restSegments] = segments;

  if (restSegments.length === 0) {
    properties[segment] = mergeSchemaProperty(properties[segment], property);
    return;
  }

  const currentProperty = properties[segment];
  const objectProperty = currentProperty?.type === 'object' ? cloneWidgetSchemaProperty(currentProperty) : createObjectSchemaProperty();

  objectProperty.properties = objectProperty.properties ?? {};
  writeStateSchemaProperty(objectProperty.properties, restSegments, property);
  properties[segment] = objectProperty;
}

/**
 * 判断调用表达式是否为 setState 调用。
 * @param expression - 调用目标表达式
 * @returns 是否为 setState 调用
 */
function isSetStateCallExpression(expression: ts.Expression): boolean {
  if (ts.isIdentifier(expression)) {
    return expression.text === 'setState';
  }

  return (
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === 'ctx' &&
    expression.name.text === 'setState'
  );
}

/**
 * 从绑定名称中收集声明的标识符。
 * @param name - 绑定名称
 * @returns 声明的标识符列表
 */
function collectBindingIdentifiers(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) {
    return [name.text];
  }

  return name.elements.flatMap((element: ts.ArrayBindingElement | ts.BindingElement): string[] => {
    if (ts.isOmittedExpression(element)) {
      return [];
    }

    return collectBindingIdentifiers(element.name);
  });
}

/**
 * 在作用域栈中读取 input 路径别名。
 * @param scopes - 作用域栈
 * @param name - 标识符名称
 * @returns input 路径；无可用别名时返回 undefined
 */
function readScopedInputAlias(scopes: InputAliasScope[], name: string): string[] | undefined {
  for (let index = scopes.length - 1; index >= 0; index -= 1) {
    const scope = scopes[index];

    if (scope.has(name)) {
      return scope.get(name) ?? undefined;
    }
  }

  return undefined;
}

/**
 * 在当前作用域注册普通绑定，遮蔽外层 input 别名。
 * @param scopes - 作用域栈
 * @param name - 绑定名称
 */
function registerBindingShadow(scopes: InputAliasScope[], name: ts.BindingName): void {
  const currentScope = scopes.at(-1);
  if (!currentScope) {
    return;
  }

  collectBindingIdentifiers(name).forEach((identifier: string): void => {
    currentScope.set(identifier, null);
  });
}

/**
 * 在当前作用域注册变量声明中的 input 路径别名。
 * @param declaration - 变量声明
 * @param inputSchema - input schema
 * @param scopes - 作用域栈
 */
function registerVariableInputAlias(declaration: ts.VariableDeclaration, inputSchema: WidgetSchemaObject | undefined, scopes: InputAliasScope[]): void {
  const currentScope = scopes.at(-1);
  if (!currentScope) {
    return;
  }

  registerBindingShadow(scopes, declaration.name);

  if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
    return;
  }

  const inputPath = readInputSchemaPathSegments(declaration.initializer, (name: string): string[] | undefined => readScopedInputAlias(scopes, name));

  if (inputPath && (inputPath.length === 0 || readSchemaPropertyAtPath(inputSchema, inputPath))) {
    currentScope.set(declaration.name.text, inputPath);
  }
}

/**
 * 使用新的 input 别名作用域执行回调。
 * @param scopes - 作用域栈
 * @param callback - 作用域内执行的回调
 */
function withInputAliasScope(scopes: InputAliasScope[], callback: () => void): void {
  scopes.push(new Map<string, InputAliasValue>());

  try {
    callback();
  } finally {
    scopes.pop();
  }
}

/**
 * 深拷贝状态 schema。
 * @param schema - 状态 schema
 * @returns 状态 schema 副本
 */
function cloneDeepStateSchema(schema: WidgetSchemaObject): WidgetSchemaObject {
  return {
    type: 'object',
    properties: Object.fromEntries(
      Object.entries(schema.properties).map(([key, property]: [string, WidgetSchemaProperty]): [string, WidgetSchemaProperty] => [
        key,
        cloneWidgetSchemaProperty(property)
      ])
    ),
    required: [...(schema.required ?? [])]
  };
}

/**
 * 从执行方法代码构建 Widget 状态 schema。
 * @param code - execute 方法源码
 * @param inputSchema - input schema，用于复用 input 字段类型
 * @returns 从 setState 调用推导出的状态 schema
 */
export function buildWidgetStateSchema(code: string, inputSchema?: WidgetSchemaObject): WidgetSchemaObject {
  if (code.trim().length === 0) {
    return cloneDeepStateSchema(EMPTY_WIDGET_STATE_SCHEMA);
  }

  const sourceFile = ts.createSourceFile('widget-execute.ts', code, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
  const inputAliasScopes: InputAliasScope[] = [];
  const properties: Record<string, WidgetSchemaProperty> = {};
  const readCurrentInputAlias = (name: string): string[] | undefined => readScopedInputAlias(inputAliasScopes, name);

  /**
   * 访问 AST 节点并收集 setState 调用。
   * @param node - AST 节点
   */
  function visit(node: ts.Node): void {
    if (ts.isSourceFile(node)) {
      withInputAliasScope(inputAliasScopes, (): void => {
        node.statements.forEach((statement: ts.Statement): void => visit(statement));
      });
      return;
    }

    if (ts.isBlock(node) || ts.isModuleBlock(node)) {
      withInputAliasScope(inputAliasScopes, (): void => {
        node.statements.forEach((statement: ts.Statement): void => visit(statement));
      });
      return;
    }

    if (ts.isFunctionLike(node)) {
      withInputAliasScope(inputAliasScopes, (): void => {
        node.parameters.forEach((parameter: ts.ParameterDeclaration): void => registerBindingShadow(inputAliasScopes, parameter.name));
        const functionBody = readFunctionLikeBody(node);

        if (functionBody) {
          visit(functionBody);
        }
      });
      return;
    }

    if (ts.isVariableDeclaration(node)) {
      registerVariableInputAlias(node, inputSchema, inputAliasScopes);
    }

    if (ts.isCallExpression(node) && isSetStateCallExpression(node.expression)) {
      const [pathExpression, valueExpression] = node.arguments;
      const statePath = pathExpression ? readStaticStringExpression(pathExpression) : null;

      if (statePath && valueExpression) {
        writeStateSchemaProperty(
          properties,
          statePath.split('.').filter((segment: string): boolean => segment.length > 0),
          inferSchemaPropertyFromExpression(valueExpression, inputSchema, readCurrentInputAlias)
        );
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return {
    type: 'object',
    properties,
    required: []
  };
}
