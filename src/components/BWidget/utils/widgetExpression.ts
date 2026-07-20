/**
 * @file widgetExpression.ts
 * @description 使用 TypeScript AST 白名单安全解析 BWidget 模板表达式。
 */
import ts from 'typescript';

/**
 * Widget 表达式读取或计算结果。
 */
export interface WidgetExpressionReadResult {
  /** 是否成功读取或计算 */
  resolved: boolean;
  /** 读取或计算结果 */
  value: unknown;
}

/**
 * Widget 表达式数据读取宿主。
 */
export interface WidgetExpressionHost {
  /**
   * 读取根标识符。
   * @param name - 标识符名称
   * @returns 标识符读取结果
   */
  readIdentifier(name: string): WidgetExpressionReadResult;
  /**
   * 读取目标值的属性。
   * @param target - 属性所属目标值
   * @param key - 属性名称或数组下标
   * @returns 属性读取结果
   */
  readProperty(target: unknown, key: string | number): WidgetExpressionReadResult;
}

/**
 * 包含 TypeScript 内部解析诊断的源码文件。
 */
interface WidgetExpressionSourceFile extends ts.SourceFile {
  /** 语法解析阶段产生的诊断 */
  readonly parseDiagnostics?: readonly ts.Diagnostic[];
}

/**
 * 可安全参与 JavaScript 原始值强制转换的表达式值。
 */
type WidgetExpressionPrimitive = string | number | boolean | null | undefined;

/** 表达式最大 UTF-16 长度。 */
const WIDGET_EXPRESSION_MAX_LENGTH = 2048;
/** 表达式 AST 最大求值深度。 */
const WIDGET_EXPRESSION_MAX_DEPTH = 64;

/**
 * 创建未解析结果。
 * @returns 未解析结果
 */
function createUnresolvedResult(): WidgetExpressionReadResult {
  return {
    resolved: false,
    value: undefined
  };
}

/**
 * 创建已解析结果。
 * @param value - 表达式值
 * @returns 已解析结果
 */
function createResolvedResult(value: unknown): WidgetExpressionReadResult {
  return {
    resolved: true,
    value
  };
}

/**
 * 将表达式文本解析为单一 TypeScript 表达式节点。
 * @param expression - 表达式文本
 * @returns 表达式节点，语法非法或包含额外语句时返回 null
 */
function parseExpressionNode(expression: string): ts.Expression | null {
  const sourceFile = ts.createSourceFile(
    'widget-expression.ts',
    `(${expression});`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  ) as WidgetExpressionSourceFile;

  if (sourceFile.parseDiagnostics?.length || sourceFile.statements.length !== 1) {
    return null;
  }

  const [statement] = sourceFile.statements;
  if (!ts.isExpressionStatement(statement) || !ts.isParenthesizedExpression(statement.expression)) {
    return null;
  }

  return statement.expression.expression;
}

/**
 * 调用宿主读取标识符，并将宿主异常收敛为未解析。
 * @param name - 标识符名称
 * @param host - 表达式宿主
 * @returns 标识符读取结果
 */
function readHostIdentifier(name: string, host: WidgetExpressionHost): WidgetExpressionReadResult {
  try {
    return host.readIdentifier(name);
  } catch {
    return createUnresolvedResult();
  }
}

/**
 * 调用宿主读取属性，并将宿主异常收敛为未解析。
 * @param target - 属性目标值
 * @param key - 属性名称或下标
 * @param host - 表达式宿主
 * @returns 属性读取结果
 */
function readHostProperty(target: unknown, key: string | number, host: WidgetExpressionHost): WidgetExpressionReadResult {
  try {
    return host.readProperty(target, key);
  } catch {
    return createUnresolvedResult();
  }
}

/**
 * 判断属性访问节点是否属于可选链。
 * @param node - 属性或下标访问节点
 * @returns 是否为可选链节点
 */
function isOptionalAccess(node: ts.PropertyAccessExpression | ts.ElementAccessExpression): boolean {
  return ts.isPropertyAccessChain(node) || ts.isElementAccessChain(node);
}

/* eslint-disable no-use-before-define -- AST 节点处理器通过统一分派函数互相递归。 */

/**
 * 求值属性访问节点。
 * @param node - 属性访问节点
 * @param host - 表达式宿主
 * @param depth - 当前 AST 深度
 * @returns 属性访问结果
 */
function evaluatePropertyAccess(node: ts.PropertyAccessExpression, host: WidgetExpressionHost, depth: number): WidgetExpressionReadResult {
  const targetResult = evaluateExpressionNode(node.expression, host, depth + 1);

  if (!targetResult.resolved) {
    return createUnresolvedResult();
  }

  if (targetResult.value === null || targetResult.value === undefined) {
    return isOptionalAccess(node) ? createResolvedResult(undefined) : createUnresolvedResult();
  }

  return readHostProperty(targetResult.value, node.name.text, host);
}

/**
 * 求值下标访问节点。
 * @param node - 下标访问节点
 * @param host - 表达式宿主
 * @param depth - 当前 AST 深度
 * @returns 下标访问结果
 */
function evaluateElementAccess(node: ts.ElementAccessExpression, host: WidgetExpressionHost, depth: number): WidgetExpressionReadResult {
  const targetResult = evaluateExpressionNode(node.expression, host, depth + 1);

  if (!targetResult.resolved) {
    return createUnresolvedResult();
  }

  if (targetResult.value === null || targetResult.value === undefined) {
    return isOptionalAccess(node) ? createResolvedResult(undefined) : createUnresolvedResult();
  }

  const keyResult = evaluateExpressionNode(node.argumentExpression, host, depth + 1);
  if (!keyResult.resolved || (typeof keyResult.value !== 'string' && typeof keyResult.value !== 'number')) {
    return createUnresolvedResult();
  }

  return readHostProperty(targetResult.value, keyResult.value, host);
}

/**
 * 判断表达式值是否为允许参与算术和顺序比较的原始值。
 * @param value - 待检查值
 * @returns 是否为受支持原始值
 */
function isExpressionPrimitive(value: unknown): value is WidgetExpressionPrimitive {
  return value === null || value === undefined || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/**
 * 求值受支持的一元运算节点。
 * @param node - 一元运算节点
 * @param host - 表达式宿主
 * @param depth - 当前 AST 深度
 * @returns 一元运算结果
 */
function evaluatePrefix(node: ts.PrefixUnaryExpression, host: WidgetExpressionHost, depth: number): WidgetExpressionReadResult {
  const operandResult = evaluateExpressionNode(node.operand, host, depth + 1);
  if (!operandResult.resolved) {
    return createUnresolvedResult();
  }

  if (node.operator === ts.SyntaxKind.ExclamationToken) {
    return createResolvedResult(!operandResult.value);
  }

  if (!isExpressionPrimitive(operandResult.value)) {
    return createUnresolvedResult();
  }

  if (node.operator === ts.SyntaxKind.PlusToken) {
    return createResolvedResult(Number(operandResult.value));
  }

  if (node.operator === ts.SyntaxKind.MinusToken) {
    return createResolvedResult(-Number(operandResult.value));
  }

  return createUnresolvedResult();
}

/**
 * 按 JavaScript 原始值语义执行算术运算。
 * @param operator - 二元运算符
 * @param leftValue - 左操作数
 * @param rightValue - 右操作数
 * @returns 算术运算结果
 */
function evaluateArithmetic(operator: ts.SyntaxKind, leftValue: unknown, rightValue: unknown): WidgetExpressionReadResult {
  if (!isExpressionPrimitive(leftValue) || !isExpressionPrimitive(rightValue)) {
    return createUnresolvedResult();
  }

  if (operator === ts.SyntaxKind.PlusToken) {
    if (typeof leftValue === 'string' || typeof rightValue === 'string') {
      return createResolvedResult(String(leftValue) + String(rightValue));
    }

    return createResolvedResult(Number(leftValue) + Number(rightValue));
  }

  const leftNumber = Number(leftValue);
  const rightNumber = Number(rightValue);

  if (operator === ts.SyntaxKind.MinusToken) {
    return createResolvedResult(leftNumber - rightNumber);
  }

  if (operator === ts.SyntaxKind.AsteriskToken) {
    return createResolvedResult(leftNumber * rightNumber);
  }

  if (operator === ts.SyntaxKind.SlashToken) {
    return createResolvedResult(leftNumber / rightNumber);
  }

  if (operator === ts.SyntaxKind.PercentToken) {
    return createResolvedResult(leftNumber % rightNumber);
  }

  return createUnresolvedResult();
}

/**
 * 按 JavaScript 原始值语义执行顺序比较。
 * @param operator - 比较运算符
 * @param leftValue - 左操作数
 * @param rightValue - 右操作数
 * @returns 比较结果
 */
function evaluateOrdering(operator: ts.SyntaxKind, leftValue: unknown, rightValue: unknown): WidgetExpressionReadResult {
  if (!isExpressionPrimitive(leftValue) || !isExpressionPrimitive(rightValue)) {
    return createUnresolvedResult();
  }

  const compareStrings = typeof leftValue === 'string' && typeof rightValue === 'string';
  const normalizedLeft = compareStrings ? leftValue : Number(leftValue);
  const normalizedRight = compareStrings ? rightValue : Number(rightValue);

  if (operator === ts.SyntaxKind.GreaterThanToken) {
    return createResolvedResult(normalizedLeft > normalizedRight);
  }

  if (operator === ts.SyntaxKind.GreaterThanEqualsToken) {
    return createResolvedResult(normalizedLeft >= normalizedRight);
  }

  if (operator === ts.SyntaxKind.LessThanToken) {
    return createResolvedResult(normalizedLeft < normalizedRight);
  }

  if (operator === ts.SyntaxKind.LessThanEqualsToken) {
    return createResolvedResult(normalizedLeft <= normalizedRight);
  }

  return createUnresolvedResult();
}

/**
 * 对受支持原始值执行 JavaScript 宽松相等比较。
 * @param leftValue - 左操作数
 * @param rightValue - 右操作数
 * @returns 是否宽松相等
 */
function compareLooseValues(leftValue: WidgetExpressionPrimitive, rightValue: WidgetExpressionPrimitive): boolean {
  // 仅对无自定义强制转换能力的原始值使用 JavaScript 宽松比较，避免触发对象代码。
  // eslint-disable-next-line eqeqeq
  return leftValue == rightValue;
}

/**
 * 求值无需短路的受支持二元运算节点。
 * @param node - 二元运算节点
 * @param host - 表达式宿主
 * @param depth - 当前 AST 深度
 * @returns 二元运算结果
 */
function evaluateEagerBinary(node: ts.BinaryExpression, host: WidgetExpressionHost, depth: number): WidgetExpressionReadResult {
  const leftResult = evaluateExpressionNode(node.left, host, depth + 1);
  if (!leftResult.resolved) {
    return createUnresolvedResult();
  }

  const rightResult = evaluateExpressionNode(node.right, host, depth + 1);
  if (!rightResult.resolved) {
    return createUnresolvedResult();
  }

  const operator = node.operatorToken.kind;
  if (
    operator === ts.SyntaxKind.PlusToken ||
    operator === ts.SyntaxKind.MinusToken ||
    operator === ts.SyntaxKind.AsteriskToken ||
    operator === ts.SyntaxKind.SlashToken ||
    operator === ts.SyntaxKind.PercentToken
  ) {
    return evaluateArithmetic(operator, leftResult.value, rightResult.value);
  }

  if (operator === ts.SyntaxKind.EqualsEqualsEqualsToken) {
    return createResolvedResult(leftResult.value === rightResult.value);
  }

  if (operator === ts.SyntaxKind.ExclamationEqualsEqualsToken) {
    return createResolvedResult(leftResult.value !== rightResult.value);
  }

  if (operator === ts.SyntaxKind.EqualsEqualsToken || operator === ts.SyntaxKind.ExclamationEqualsToken) {
    if (!isExpressionPrimitive(leftResult.value) || !isExpressionPrimitive(rightResult.value)) {
      return createUnresolvedResult();
    }

    const isEqual = compareLooseValues(leftResult.value, rightResult.value);

    return createResolvedResult(operator === ts.SyntaxKind.EqualsEqualsToken ? isEqual : !isEqual);
  }

  return evaluateOrdering(operator, leftResult.value, rightResult.value);
}

/**
 * 判断二元运算符是否属于无需短路的受支持白名单。
 * @param operator - 二元运算符
 * @returns 是否允许求值
 */
function isEagerOperator(operator: ts.SyntaxKind): boolean {
  return (
    operator === ts.SyntaxKind.PlusToken ||
    operator === ts.SyntaxKind.MinusToken ||
    operator === ts.SyntaxKind.AsteriskToken ||
    operator === ts.SyntaxKind.SlashToken ||
    operator === ts.SyntaxKind.PercentToken ||
    operator === ts.SyntaxKind.EqualsEqualsEqualsToken ||
    operator === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
    operator === ts.SyntaxKind.EqualsEqualsToken ||
    operator === ts.SyntaxKind.ExclamationEqualsToken ||
    operator === ts.SyntaxKind.GreaterThanToken ||
    operator === ts.SyntaxKind.GreaterThanEqualsToken ||
    operator === ts.SyntaxKind.LessThanToken ||
    operator === ts.SyntaxKind.LessThanEqualsToken
  );
}

/**
 * 求值二元运算节点，并保持逻辑和空值运算的短路语义。
 * @param node - 二元运算节点
 * @param host - 表达式宿主
 * @param depth - 当前 AST 深度
 * @returns 二元运算结果
 */
function evaluateBinary(node: ts.BinaryExpression, host: WidgetExpressionHost, depth: number): WidgetExpressionReadResult {
  const operator = node.operatorToken.kind;

  if (
    !isEagerOperator(operator) &&
    operator !== ts.SyntaxKind.AmpersandAmpersandToken &&
    operator !== ts.SyntaxKind.BarBarToken &&
    operator !== ts.SyntaxKind.QuestionQuestionToken
  ) {
    return createUnresolvedResult();
  }

  if (isEagerOperator(operator)) {
    return evaluateEagerBinary(node, host, depth);
  }

  const leftResult = evaluateExpressionNode(node.left, host, depth + 1);
  if (!leftResult.resolved) {
    return createUnresolvedResult();
  }

  if (operator === ts.SyntaxKind.AmpersandAmpersandToken && !leftResult.value) {
    return leftResult;
  }

  if (operator === ts.SyntaxKind.BarBarToken && leftResult.value) {
    return leftResult;
  }

  if (operator === ts.SyntaxKind.QuestionQuestionToken && leftResult.value !== null && leftResult.value !== undefined) {
    return leftResult;
  }

  return evaluateExpressionNode(node.right, host, depth + 1);
}

/**
 * 求值三元条件表达式，并且只访问选中的分支。
 * @param node - 条件表达式节点
 * @param host - 表达式宿主
 * @param depth - 当前 AST 深度
 * @returns 条件表达式结果
 */
function evaluateConditional(node: ts.ConditionalExpression, host: WidgetExpressionHost, depth: number): WidgetExpressionReadResult {
  const conditionResult = evaluateExpressionNode(node.condition, host, depth + 1);
  if (!conditionResult.resolved) {
    return createUnresolvedResult();
  }

  const selectedExpression = conditionResult.value ? node.whenTrue : node.whenFalse;

  return evaluateExpressionNode(selectedExpression, host, depth + 1);
}

/**
 * 递归求值白名单内的表达式节点。
 * @param node - 当前表达式节点
 * @param host - 表达式宿主
 * @param depth - 当前 AST 深度
 * @returns 节点求值结果
 */
function evaluateExpressionNode(node: ts.Expression, host: WidgetExpressionHost, depth: number): WidgetExpressionReadResult {
  if (depth > WIDGET_EXPRESSION_MAX_DEPTH) {
    return createUnresolvedResult();
  }

  if (ts.isParenthesizedExpression(node)) {
    return evaluateExpressionNode(node.expression, host, depth + 1);
  }

  if (ts.isIdentifier(node)) {
    return readHostIdentifier(node.text, host);
  }

  if (ts.isStringLiteral(node)) {
    return createResolvedResult(node.text);
  }

  if (ts.isNumericLiteral(node)) {
    return createResolvedResult(Number(node.text));
  }

  if (node.kind === ts.SyntaxKind.TrueKeyword) {
    return createResolvedResult(true);
  }

  if (node.kind === ts.SyntaxKind.FalseKeyword) {
    return createResolvedResult(false);
  }

  if (node.kind === ts.SyntaxKind.NullKeyword) {
    return createResolvedResult(null);
  }

  if (ts.isPropertyAccessExpression(node)) {
    return evaluatePropertyAccess(node, host, depth);
  }

  if (ts.isElementAccessExpression(node)) {
    return evaluateElementAccess(node, host, depth);
  }

  if (ts.isPrefixUnaryExpression(node)) {
    return evaluatePrefix(node, host, depth);
  }

  if (ts.isBinaryExpression(node)) {
    return evaluateBinary(node, host, depth);
  }

  if (ts.isConditionalExpression(node)) {
    return evaluateConditional(node, host, depth);
  }

  return createUnresolvedResult();
}

/* eslint-enable no-use-before-define */

/**
 * 安全求值单个 Widget 模板表达式。
 * @param expression - 去掉双花括号后的表达式文本
 * @param host - 受限的数据读取宿主
 * @returns 表达式求值结果
 */
export function evaluateWidgetExpression(expression: string, host: WidgetExpressionHost): WidgetExpressionReadResult {
  if (!expression.trim() || expression.length > WIDGET_EXPRESSION_MAX_LENGTH) {
    return createUnresolvedResult();
  }

  const expressionNode = parseExpressionNode(expression);
  if (!expressionNode) {
    return createUnresolvedResult();
  }

  const result = evaluateExpressionNode(expressionNode, host, 0);

  return result.resolved && result.value !== undefined ? result : createUnresolvedResult();
}
