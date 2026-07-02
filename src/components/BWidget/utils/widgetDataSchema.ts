/**
 * @file widgetDataSchema.ts
 * @description 从 Widget JS 脚本代码中构建运行数据 schema。
 */
import type { WidgetSchemaObject, WidgetSchemaProperty } from '../types';
import ts from 'typescript';

/** 空数据 schema。 */
const EMPTY_WIDGET_DATA_SCHEMA: WidgetSchemaObject = {
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
/** Widget this 上下文中的节点访问函数。 */
type WidgetDataSchemaVisitor = (node: ts.Node, hasWidgetThisContext: boolean) => void;

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
 * 数据字段只复用类型结构，不继承 input 字段说明，避免把推导值误展示成显式 label。
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
 * 判断节点是否为 this 表达式。
 * @param node - TypeScript 节点
 * @returns 是否为 this 表达式
 */
function isThisExpression(node: ts.Node): boolean {
  return node.kind === ts.SyntaxKind.ThisKeyword;
}

/**
 * 读取表达式表示的静态访问路径。
 * @param expression - 表达式节点
 * @returns 静态访问路径片段
 */
function readExpressionPathSegments(expression: ts.Expression): string[] | null {
  if (isThisExpression(expression)) {
    return ['this'];
  }

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

  if (segments[0] === 'this' && segments[1] === '$input') {
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
 * @param segments - 数据路径片段
 * @param property - 字段定义
 */
function writeDataSchemaProperty(properties: Record<string, WidgetSchemaProperty>, segments: string[], property: WidgetSchemaProperty): void {
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
  writeDataSchemaProperty(objectProperty.properties, restSegments, property);
  properties[segment] = objectProperty;
}

/**
 * 判断调用表达式是否为 Widget 配置调用。
 * @param expression - 调用目标表达式
 * @returns 是否为 Widget 配置调用
 */
function isWidgetConfigCallExpression(expression: ts.Expression): boolean {
  return ts.isIdentifier(expression) && expression.text === 'Widget';
}

/**
 * 读取 Widget this 上的数据写入路径。
 * @param expression - 赋值左侧表达式
 * @returns data 字段路径；非 data 写入时返回 null
 */
function readWidgetThisDataPathSegments(expression: ts.Expression): string[] | null {
  const segments = readExpressionPathSegments(expression);

  if (!segments || segments[0] !== 'this') {
    return null;
  }

  const dataSegments = segments.slice(1);
  const [rootSegment] = dataSegments;

  if (!rootSegment || rootSegment.startsWith('$')) {
    return null;
  }

  return dataSegments;
}

/**
 * 判断 Widget data 路径是否可在运行时直接写入。
 * @param properties - 已初始化的数据 schema 根属性
 * @param segments - data 字段路径
 * @returns 当前路径是否具备可写入的中间对象
 */
function canWriteWidgetDataPath(properties: Record<string, WidgetSchemaProperty>, segments: string[]): boolean {
  if (segments.length <= 1) {
    return true;
  }

  let currentProperties = properties;

  for (const segment of segments.slice(0, -1)) {
    const currentProperty = currentProperties[segment];

    if (currentProperty?.type !== 'object') {
      return false;
    }

    currentProperties = currentProperty.properties ?? {};
  }

  return true;
}

/**
 * 将 Widget({ data }) 对象字面量写入根数据 schema。
 * @param properties - 根属性集合
 * @param dataExpression - data 属性表达式
 * @param inputSchema - input schema，用于复用 input 字段类型
 * @param readInputAlias - input 路径别名读取函数
 */
function writeWidgetConfigDataProperties(
  properties: Record<string, WidgetSchemaProperty>,
  dataExpression: ts.Expression,
  inputSchema: WidgetSchemaObject | undefined,
  readInputAlias: InputAliasReader
): void {
  const dataProperty = inferSchemaPropertyFromExpression(dataExpression, inputSchema, readInputAlias);
  if (dataProperty.type !== 'object' || !dataProperty.properties) {
    return;
  }

  Object.entries(dataProperty.properties).forEach(([key, property]: [string, WidgetSchemaProperty]): void => {
    properties[key] = mergeSchemaProperty(properties[key], property);
  });
}

/**
 * 从 Widget 配置对象中收集 data 字段声明。
 * @param configObject - Widget 配置对象
 * @param properties - 根属性集合
 * @param inputSchema - input schema，用于复用 input 字段类型
 * @param readInputAlias - input 路径别名读取函数
 */
function collectWidgetConfigDataProperties(
  configObject: ts.ObjectLiteralExpression,
  properties: Record<string, WidgetSchemaProperty>,
  inputSchema: WidgetSchemaObject | undefined,
  readInputAlias: InputAliasReader
): void {
  configObject.properties.forEach((property: ts.ObjectLiteralElementLike): void => {
    const propertyName = ts.isPropertyAssignment(property) || ts.isMethodDeclaration(property) ? readPropertyName(property.name) : null;

    if (propertyName === 'data' && ts.isPropertyAssignment(property)) {
      writeWidgetConfigDataProperties(properties, property.initializer, inputSchema, readInputAlias);
    }
  });
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
 * 读取属性中承载的函数节点。
 * @param property - 对象字面量属性
 * @returns 函数节点，不存在时返回 undefined
 */
function readObjectPropertyFunction(property: ts.ObjectLiteralElementLike): FunctionLikeNodeWithBody | undefined {
  if (ts.isMethodDeclaration(property)) {
    return property;
  }

  if (ts.isPropertyAssignment(property) && (ts.isArrowFunction(property.initializer) || ts.isFunctionExpression(property.initializer))) {
    return property.initializer;
  }

  return undefined;
}

/**
 * 使用 Widget this 上下文访问函数体。
 * @param node - 函数类节点
 * @param scopes - input 别名作用域栈
 * @param visit - AST 访问函数
 */
function visitWidgetFunctionBody(node: FunctionLikeNodeWithBody, scopes: InputAliasScope[], visit: WidgetDataSchemaVisitor): void {
  withInputAliasScope(scopes, (): void => {
    node.parameters.forEach((parameter: ts.ParameterDeclaration): void => registerBindingShadow(scopes, parameter.name));
    const functionBody = readFunctionLikeBody(node);

    if (functionBody) {
      visit(functionBody, true);
    }
  });
}

/**
 * 访问 Widget methods 对象。
 * @param methodsObject - methods 对象字面量
 * @param scopes - input 别名作用域栈
 * @param visit - AST 访问函数
 */
function visitWidgetMethodsObject(methodsObject: ts.ObjectLiteralExpression, scopes: InputAliasScope[], visit: WidgetDataSchemaVisitor): void {
  methodsObject.properties.forEach((property: ts.ObjectLiteralElementLike): void => {
    const methodNode = readObjectPropertyFunction(property);

    if (methodNode) {
      visitWidgetFunctionBody(methodNode, scopes, visit);
    }
  });
}

/**
 * 访问 Widget 配置对象中的生命周期和事件方法。
 * @param configObject - Widget 配置对象
 * @param scopes - input 别名作用域栈
 * @param visit - AST 访问函数
 */
function visitWidgetConfigObject(configObject: ts.ObjectLiteralExpression, scopes: InputAliasScope[], visit: WidgetDataSchemaVisitor): void {
  configObject.properties.forEach((property: ts.ObjectLiteralElementLike): void => {
    const propertyName = ts.isPropertyAssignment(property) || ts.isMethodDeclaration(property) ? readPropertyName(property.name) : null;
    const functionNode = readObjectPropertyFunction(property);

    if ((propertyName === 'mounted' || propertyName === 'unmounted') && functionNode) {
      visitWidgetFunctionBody(functionNode, scopes, visit);
      return;
    }

    if (propertyName === 'methods' && ts.isPropertyAssignment(property) && ts.isObjectLiteralExpression(property.initializer)) {
      visitWidgetMethodsObject(property.initializer, scopes, visit);
    }
  });
}

/**
 * 深拷贝数据 schema。
 * @param schema - 数据 schema
 * @returns 数据 schema 副本
 */
function cloneDeepDataSchema(schema: WidgetSchemaObject): WidgetSchemaObject {
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
 * 从JS 脚本代码构建 Widget 数据 schema。
 * @param code - JS 脚本源码
 * @param inputSchema - input schema，用于复用 this.$input 字段类型
 * @returns 从 Widget({ data }) 和 this 数据赋值推导出的数据 schema
 */
export function buildWidgetDataSchema(code: string, inputSchema?: WidgetSchemaObject): WidgetSchemaObject {
  if (code.trim().length === 0) {
    return cloneDeepDataSchema(EMPTY_WIDGET_DATA_SCHEMA);
  }

  const sourceFile = ts.createSourceFile('widget-execute.ts', code, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
  const inputAliasScopes: InputAliasScope[] = [];
  const properties: Record<string, WidgetSchemaProperty> = {};
  const readCurrentInputAlias = (name: string): string[] | undefined => readScopedInputAlias(inputAliasScopes, name);

  /**
   * 访问 AST 节点并收集 Widget data 声明和 this 数据赋值。
   * @param node - AST 节点
   */
  function visit(node: ts.Node, hasWidgetThisContext = false): void {
    if (ts.isSourceFile(node)) {
      withInputAliasScope(inputAliasScopes, (): void => {
        node.statements.forEach((statement: ts.Statement): void => visit(statement, hasWidgetThisContext));
      });
      return;
    }

    if (ts.isBlock(node) || ts.isModuleBlock(node)) {
      withInputAliasScope(inputAliasScopes, (): void => {
        node.statements.forEach((statement: ts.Statement): void => visit(statement, hasWidgetThisContext));
      });
      return;
    }

    if (ts.isCallExpression(node) && isWidgetConfigCallExpression(node.expression)) {
      const [configExpression] = node.arguments;

      if (configExpression && ts.isObjectLiteralExpression(configExpression)) {
        collectWidgetConfigDataProperties(configExpression, properties, inputSchema, readCurrentInputAlias);
        visitWidgetConfigObject(configExpression, inputAliasScopes, visit);
      }

      return;
    }

    if (ts.isFunctionLike(node)) {
      withInputAliasScope(inputAliasScopes, (): void => {
        node.parameters.forEach((parameter: ts.ParameterDeclaration): void => registerBindingShadow(inputAliasScopes, parameter.name));
        const functionBody = readFunctionLikeBody(node);
        const nextWidgetThisContext = ts.isArrowFunction(node) ? hasWidgetThisContext : false;

        if (functionBody) {
          visit(functionBody, nextWidgetThisContext);
        }
      });
      return;
    }

    if (hasWidgetThisContext && ts.isVariableDeclaration(node)) {
      registerVariableInputAlias(node, inputSchema, inputAliasScopes);
    }

    if (hasWidgetThisContext && ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const dataPath = readWidgetThisDataPathSegments(node.left);

      if (dataPath && canWriteWidgetDataPath(properties, dataPath)) {
        writeDataSchemaProperty(properties, dataPath, inferSchemaPropertyFromExpression(node.right, inputSchema, readCurrentInputAlias));
      }
    }

    ts.forEachChild(node, (child: ts.Node): void => visit(child, hasWidgetThisContext));
  }

  visit(sourceFile, false);

  return {
    type: 'object',
    properties,
    required: []
  };
}
