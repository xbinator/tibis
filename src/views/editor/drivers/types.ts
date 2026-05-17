/**
 * @file types.ts
 * @description EditorDriver 类型定义。
 */

import type { EditorFile } from '../types';
import type { AIToolContext } from 'types/ai';
import type { Component } from 'vue';
import type { EditorController } from '@/components/BMarkdown/types';

/**
 * 工具栏能力配置。
 */
export interface EditorToolbarConfig {
  /** 是否显示视图切换。 */
  showViewModeToggle: boolean;
  /** 是否显示结构视图切换。 */
  showStructuredViewToggle: boolean;
  /** 是否显示查找。 */
  showSearch: boolean;
}

/**
 * 创建工具上下文的输入。
 */
export interface CreateToolContextInput {
  /** 当前文件状态。 */
  fileState: EditorFile;
  /** 编辑器实例。 */
  editorInstance: EditorController | Record<string, unknown> | null;
  /** 当前是否激活。 */
  isActive: boolean;
}

/**
 * 编辑器驱动。
 */
export interface EditorDriver {
  /** 驱动标识。 */
  id: string;
  /** 匹配逻辑。 */
  match: (file: EditorFile) => boolean;
  /** 渲染组件。 */
  component: Component;
  /** 创建工具上下文。 */
  createToolContext: (input: CreateToolContextInput) => AIToolContext;
  /** 工具栏能力。 */
  toolbar: EditorToolbarConfig;
}
