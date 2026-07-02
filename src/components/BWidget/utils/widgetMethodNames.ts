/**
 * @file widgetMethodNames.ts
 * @description 从 Widget JS 脚本代码中读取 methods 方法名。
 */
import ts from 'typescript';

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
 * 判断调用表达式是否为 Widget 配置调用。
 * @param expression - 调用目标表达式
 * @returns 是否为 Widget 配置调用
 */
function isWidgetConfigCallExpression(expression: ts.Expression): boolean {
  return ts.isIdentifier(expression) && expression.text === 'Widget';
}

/**
 * 收集 methods 对象中的静态方法名。
 * @param methodsObject - methods 对象字面量
 * @param methodNames - 方法名集合
 */
function collectWidgetMethodsObjectNames(methodsObject: ts.ObjectLiteralExpression, methodNames: Set<string>): void {
  methodsObject.properties.forEach((property: ts.ObjectLiteralElementLike): void => {
    if (ts.isSpreadAssignment(property)) {
      return;
    }

    if (ts.isShorthandPropertyAssignment(property)) {
      methodNames.add(property.name.text);
      return;
    }

    const propertyName = readPropertyName(property.name);

    if (propertyName) {
      methodNames.add(propertyName);
    }
  });
}

/**
 * 收集 Widget 配置对象中的 methods 方法名。
 * @param configObject - Widget 配置对象
 * @param methodNames - 方法名集合
 */
function collectWidgetConfigMethodNames(configObject: ts.ObjectLiteralExpression, methodNames: Set<string>): void {
  configObject.properties.forEach((property: ts.ObjectLiteralElementLike): void => {
    const propertyName = ts.isPropertyAssignment(property) || ts.isMethodDeclaration(property) ? readPropertyName(property.name) : null;

    if (propertyName === 'methods' && ts.isPropertyAssignment(property) && ts.isObjectLiteralExpression(property.initializer)) {
      collectWidgetMethodsObjectNames(property.initializer, methodNames);
    }
  });
}

/**
 * 从JS 脚本代码读取 Widget methods 中声明的方法名。
 * @param code - JS 脚本源码
 * @returns 静态方法名列表
 */
export function readWidgetMethodNames(code: string): string[] {
  if (code.trim().length === 0) {
    return [];
  }

  const sourceFile = ts.createSourceFile('widget-methods.ts', code, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
  const methodNames = new Set<string>();

  /**
   * 访问 AST 节点并收集 Widget({ methods })。
   * @param node - AST 节点
   */
  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && isWidgetConfigCallExpression(node.expression)) {
      const [configExpression] = node.arguments;

      if (configExpression && ts.isObjectLiteralExpression(configExpression)) {
        collectWidgetConfigMethodNames(configExpression, methodNames);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return Array.from(methodNames);
}
