/**
 * @file types.ts
 * @description ChatRuntime 跨进程工具 registry 的共享类型定义。
 */

/** 跨进程工具来源类型。 */
export type SharedToolSource = 'builtin' | 'custom' | 'mcp';

/** 跨进程工具风险等级。 */
export type SharedToolRiskLevel = 'read' | 'write' | 'dangerous';

/** 跨进程工具参数 Schema。 */
export interface SharedToolParameterSchema {
  /** 模式类型，当前工具定义统一使用 object。 */
  type: 'object';
  /** JSON Schema 属性定义。 */
  properties: Record<string, unknown>;
  /** 必需属性名称。 */
  required?: string[];
  /** 是否允许额外属性。 */
  additionalProperties?: boolean;
}

/** 跨进程工具定义。 */
export interface SharedToolDefinition {
  /** 工具名称。 */
  name: string;
  /** 工具描述，兼容动态描述函数。 */
  description: string | (() => string);
  /** 工具来源。 */
  source: SharedToolSource;
  /** 风险等级。 */
  riskLevel: SharedToolRiskLevel;
  /** 参数 Schema。 */
  parameters: SharedToolParameterSchema;
  /** 此工具是否需要当前编辑器文档上下文。 */
  requiresActiveDocument?: boolean;
  /** UI 和策略决策使用的权限类别。 */
  permissionCategory?: 'document' | 'settings' | 'system';
  /** 此写入工具是否可以自动批准并记住。 */
  safeAutoApprove?: boolean;
}

/** 工具运行时归属。 */
export type ToolRuntimeOwner = 'main' | 'renderer' | 'sdk';

/** 主进程工具分组。 */
export type ToolRuntimeGroup = 'read' | 'file' | 'settings' | 'resource' | 'webview';

/** 工具暴露策略。 */
export type ToolExposure = 'default-readonly' | 'default-writable' | 'conditional-readonly' | 'conditional-writable';

/** 工具 registry 条目。 */
export interface ToolRegistryEntry {
  /** 工具运行时归属。 */
  runtime: ToolRuntimeOwner;
  /** 主进程工具分组。 */
  group: ToolRuntimeGroup;
  /** 工具暴露策略。 */
  exposure: ToolExposure;
  /** AI 工具定义。 */
  definition: SharedToolDefinition;
}

/** 内部 JSON Schema 对象类型。 */
export type ToolJsonSchema = Record<string, unknown>;
