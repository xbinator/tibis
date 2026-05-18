/**
 * @file types.ts
 * @description BModelSelect 组件类型定义。
 */
import type { SelectedModel } from '@/stores/ai/serviceModel';

/**
 * 渲染到对话框中的单个模型项。
 */
export interface ModelItem {
  /** 组合后的选择器值（providerId:modelId）。 */
  value: string;
  /** 模型 ID。 */
  modelId: string;
  /** 模型显示名称。 */
  modelName: string;
}

/**
 * 按提供方分组后的模型集合。
 */
export interface ModelGroup {
  /** 提供方 ID。 */
  providerId: string;
  /** 提供方显示名称。 */
  providerName: string;
  /** 当前提供方下可选模型。 */
  models: ModelItem[];
}

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
 * BModelSelect 组件属性。
 */
export interface BModelSelectProps {
  /** 当前选中的模型。 */
  model?: SelectedModel;
  /** 是否禁用。 */
  disabled?: boolean;
}

/**
 * BModelSelect 组件暴露的方法。
 */
export interface BModelSelectExpose {
  /** 程序化打开对话框。 */
  open: () => void;
}

export type { SelectedModel };
