/**
 * @file types.ts
 * @description BJsonGraph 类型定义。
 */

import type { DocumentStructureSummary } from 'types/ai';
import type { EditorController } from '@/components/BMarkdown/adapters/types';
import type { EditorState } from '@/components/BMarkdown/types';

/** JSON 节点类型。 */
export type JsonNodeType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';

/**
 * JSON 节点信息。
 */
export interface JsonNodeInfo {
  /** JSON Pointer 路径。 */
  path: string;
  /** 节点类型。 */
  type: JsonNodeType;
  /** 整个节点起始偏移。 */
  startOffset: number;
  /** 整个节点结束偏移。 */
  endOffset: number;
  /** key 起始偏移。 */
  keyStartOffset?: number;
  /** key 结束偏移。 */
  keyEndOffset?: number;
  /** value 起始偏移。 */
  valueStartOffset: number;
  /** value 结束偏移。 */
  valueEndOffset: number;
  /** 对象节点的 key。 */
  key?: string;
  /** 叶子值。 */
  value?: unknown;
  /** 子节点路径。 */
  children: string[];
}

/**
 * JSON 图折叠状态。
 */
export interface JsonGraphState {
  /** 自动折叠路径。 */
  autoCollapsedPaths: Set<string>;
  /** 用户手动折叠路径。 */
  userCollapsedPaths: Set<string>;
  /** 用户手动展开路径。 */
  userExpandedPaths: Set<string>;
}

/**
 * JSON 结构化上下文暴露接口。
 */
export interface JsonStructuredContext {
  /** 获取当前路径。 */
  getCurrentPath: () => string | null;
  /** 获取当前节点类型。 */
  getCurrentNodeType: () => string | null;
  /** 按路径读取值。 */
  getValueAtPath: (path: string) => unknown;
  /** 获取结构摘要。 */
  getStructureSummary: () => DocumentStructureSummary;
}

/**
 * BJsonGraph 组件对外实例。
 */
export interface BJsonGraphPublicInstance extends EditorController, JsonStructuredContext {}

/**
 * BJsonGraph 组件属性。
 */
export interface BJsonGraphState extends EditorState {
  /** 文件内容。 */
  content: string;
}
