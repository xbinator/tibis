/**
 * @file types.ts
 * @description BModel/Select 组件类型定义。
 *
 * `ModelItem` / `ModelGroup` 的实际定义已下沉到 `useProviderStore`，
 * 此处仅 re-export 以保持既有 import 路径可用，避免循环依赖。
 */
import type { SelectedModel } from '@/stores/ai/serviceModel';

export type { ModelItem, ModelGroup } from '@/stores/ai/provider';

/**
 * 解析后的模型标识。
 */
export interface ParsedModel {
  /** 提供方 ID。 */
  providerId: string;
  /** 模型 ID。 */
  modelId: string;
}

/**
 * BModel/Select 组件属性。
 */
export interface BModelSelectProps {
  /** 当前选中的模型。 */
  model?: SelectedModel;
  /** 是否禁用。 */
  disabled?: boolean;
}

/**
 * BModel/Select 组件暴露的方法。
 */
export interface BModelSelectExpose {
  /** 程序化打开对话框。 */
  open: () => void;
}

export type { SelectedModel };
