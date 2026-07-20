/**
 * @file useElementMethods.ts
 * @description BWidget 元素 Setter 动作方法候选 hook。
 */
import type { BSmartMethodOption } from '../../BSmart/types';
import type { ComputedRef } from 'vue';
import { computed } from 'vue';
import ts from 'typescript';
import { readWidgetExecuteMethod } from '../utils/widgetExecuteMethod';
import { useWidgetContext } from './useWidgetContext';

/** Widget 生命周期方法名。 */
const WIDGET_LIFECYCLE_METHOD_NAMES = new Set<string>(['onExecute', 'onMounted']);
/** 不作为按钮动作展示的保留方法名前缀。 */
const WIDGET_RESERVED_METHOD_PREFIX_PATTERN = /^[$_]/;

/**
 * 元素方法 hook 返回值。
 */
export interface UseElementMethodsReturn {
  /** 当前 Widget 脚本里的公开方法候选 */
  methodOptions: ComputedRef<BSmartMethodOption[]>;
}

/**
 * 判断类声明是否带有指定修饰符。
 * @param node - 类声明
 * @param kind - 修饰符类型
 * @returns 是否带有指定修饰符
 */
function hasClassModifier(node: ts.ClassDeclaration, kind: ts.SyntaxKind): boolean {
  return node.modifiers?.some((modifier: ts.ModifierLike): boolean => modifier.kind === kind) ?? false;
}

/**
 * 判断类成员是否带有指定修饰符。
 * @param member - 类成员
 * @param kind - 修饰符类型
 * @returns 是否带有指定修饰符
 */
function hasClassElementModifier(member: ts.ClassElement, kind: ts.SyntaxKind): boolean {
  const modifiers = ts.canHaveModifiers(member) ? ts.getModifiers(member) : undefined;

  return modifiers?.some((modifier: ts.ModifierLike): boolean => modifier.kind === kind) ?? false;
}

/**
 * 判断类声明是否继承 Widget。
 * @param node - 类声明
 * @returns 是否继承 Widget
 */
function isWidgetClassDeclaration(node: ts.ClassDeclaration): boolean {
  const extendsClause = node.heritageClauses?.find((clause: ts.HeritageClause): boolean => clause.token === ts.SyntaxKind.ExtendsKeyword);
  const [heritageType] = extendsClause?.types ?? [];

  return Boolean(heritageType && ts.isIdentifier(heritageType.expression) && heritageType.expression.text === 'Widget');
}

/**
 * 判断类声明是否为默认导出的 Widget 类。
 * @param node - 类声明
 * @returns 是否为默认导出的 Widget 类
 */
function isDefaultExportWidgetClassDeclaration(node: ts.ClassDeclaration): boolean {
  return hasClassModifier(node, ts.SyntaxKind.ExportKeyword) && hasClassModifier(node, ts.SyntaxKind.DefaultKeyword) && isWidgetClassDeclaration(node);
}

/**
 * 读取静态类成员名。
 * @param name - 类成员名节点
 * @returns 成员名，无法静态读取时返回 null
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
 * 判断方法是否为可暴露给动作配置的公开方法。
 * @param member - 类方法
 * @param methodName - 方法名
 * @returns 是否可暴露
 */
function isPublicActionMethod(member: ts.MethodDeclaration, methodName: string): boolean {
  if (WIDGET_LIFECYCLE_METHOD_NAMES.has(methodName)) {
    return false;
  }

  if (WIDGET_RESERVED_METHOD_PREFIX_PATTERN.test(methodName)) {
    return false;
  }

  return !(
    hasClassElementModifier(member, ts.SyntaxKind.PrivateKeyword) ||
    hasClassElementModifier(member, ts.SyntaxKind.ProtectedKeyword) ||
    hasClassElementModifier(member, ts.SyntaxKind.StaticKeyword)
  );
}

/**
 * 读取方法参数名。
 * @param parameter - 参数声明
 * @param index - 参数下标
 * @returns 参数名
 */
function readParameterName(parameter: ts.ParameterDeclaration, index: number): string {
  return ts.isIdentifier(parameter.name) ? parameter.name.text : `arg${index + 1}`;
}

/**
 * 从方法声明创建方法选项。
 * @param member - 方法声明
 * @returns 方法选项，无法读取时返回 null
 */
function createMethodOption(member: ts.MethodDeclaration): BSmartMethodOption | null {
  const methodName = readClassElementName(member.name);

  if (!methodName || !isPublicActionMethod(member, methodName)) {
    return null;
  }

  return {
    label: methodName,
    parameters: member.parameters.map((parameter: ts.ParameterDeclaration, index: number): string => readParameterName(parameter, index)),
    value: methodName
  };
}

/**
 * 提取 Widget 脚本默认导出类中的公开方法选项。
 * @param code - Widget 脚本源码
 * @returns 公开方法选项列表
 */
export function collectWidgetPublicMethodOptions(code: string): BSmartMethodOption[] {
  const sourceFile = ts.createSourceFile('widget-method.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const widgetClass = sourceFile.statements.find(
    (statement: ts.Statement): statement is ts.ClassDeclaration => ts.isClassDeclaration(statement) && isDefaultExportWidgetClassDeclaration(statement)
  );

  if (!widgetClass) {
    return [];
  }

  return widgetClass.members.flatMap((member: ts.ClassElement): BSmartMethodOption[] => {
    if (!ts.isMethodDeclaration(member)) {
      return [];
    }

    const option = createMethodOption(member);

    return option ? [option] : [];
  });
}

/**
 * 创建元素 Setter 可用动作方法候选。
 * @returns 方法候选响应式对象
 */
export function useElementMethods(): UseElementMethodsReturn {
  const widgetContext = useWidgetContext();
  const methodOptions = computed<BSmartMethodOption[]>((): BSmartMethodOption[] =>
    collectWidgetPublicMethodOptions(readWidgetExecuteMethod(widgetContext.widgetData.value?.execute).code)
  );

  return {
    methodOptions
  };
}
