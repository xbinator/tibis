/**
 * @file types.ts
 * @description BJsonViewer 组件相关类型定义。
 */

import type { Edge, Node } from '@vue-flow/core';

/**
 * JSON 基础值类型。
 */
export type JsonPrimitive = string | number | boolean | null;

/**
 * JSON 完整值类型。
 */
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

/**
 * JSON 节点类型。
 */
export type JsonNodeKind = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';

/**
 * JSON 查看器入参。
 */
export interface BJsonViewerProps {
  /** JSON 字符串，优先级高于 value。 */
  content?: string;
  /** 已解析 JSON 值。 */
  value?: unknown;
}

/**
 * 卡片行数据。
 */
export interface JsonRecordRow {
  /** 行唯一标识。 */
  id: string;
  /** 字段名或数组索引。 */
  key: string;
  /** 字段值摘要。 */
  value: string;
  /** 字段值类型。 */
  kind: JsonNodeKind;
  /** 是否会连向右侧子节点。 */
  hasLink: boolean;
}

/**
 * 节点上的连线起始点。
 */
export interface JsonNodeHandle {
  /** Handle 唯一标识，与 Edge 的 sourceHandle 对应。 */
  id: string;
  /** Handle 在节点内的纵向偏移（px）。 */
  top: number;
}

/**
 * Vue Flow 节点数据。
 */
export interface JsonFlowNodeData {
  /** JSON Pointer 路径。 */
  path: string;
  /** 节点类型。 */
  kind: JsonNodeKind;
  /** 节点展示模式。 */
  variant: 'record' | 'value';
  /** 节点宽度（px），用于内联样式及布局计算。 */
  width: number;
  /** 值节点文本。 */
  valueText: string;
  /** 对象或数组卡片行。 */
  rows: JsonRecordRow[];
  /** 连线起始点列表，每条连线对应独立 Handle。 */
  handles: JsonNodeHandle[];
}

/**
 * 内部可视节点。
 */
export interface JsonVisualNode {
  /** Vue Flow 节点 ID。 */
  id: string;
  /** JSON Pointer 路径。 */
  path: string;
  /** JSON 节点类型。 */
  kind: JsonNodeKind;
  /** 节点展示模式。 */
  variant: 'record' | 'value';
  /** 节点深度。 */
  depth: number;
  /** 节点宽度（px），根据内容动态计算。 */
  width: number;
  /** 值节点文本。 */
  valueText: string;
  /** 卡片行。 */
  rows: JsonRecordRow[];
  /** 连线起始点列表，每条连线对应独立 Handle。 */
  handles: JsonNodeHandle[];
  /** 子节点连线描述。 */
  links: Array<{
    /** 源节点行 Handle ID。 */
    sourceHandle: string;
    /** 源节点中的行索引。 */
    sourceRowIndex: number;
    /** 目标可视节点。 */
    target: JsonVisualNode;
    /** 连线标签。 */
    label: string;
  }>;
}

/**
 * 布局后的可视节点。
 */
export interface PositionedVisualNode {
  /** 原始可视节点。 */
  visualNode: JsonVisualNode;
  /** 横向坐标。 */
  x: number;
  /** 纵向坐标。 */
  y: number;
}

/**
 * 图数据生成结果。
 */
export interface JsonGraphResult {
  /** Vue Flow 节点列表。 */
  nodes: Node<JsonFlowNodeData>[];
  /** Vue Flow 连线列表。 */
  edges: Edge[];
}

/**
 * JSON 解析结果。
 */
export interface JsonParseResult {
  /** 解析后的 JSON 值。 */
  value: JsonValue | undefined;
  /** 解析错误信息。 */
  error: string;
}
