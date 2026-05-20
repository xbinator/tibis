/**
 * @file types.ts
 * @description 交互容器的类型定义
 */
import type { VNode } from 'vue';

/**
 * Toast 提示类型
 */
export type ToastType = 'error' | 'warning' | 'info' | 'success';

/**
 * Toast 提示内容类型
 */
export type ToastContent = string | VNode;

/**
 * Toast 提示选项
 */
export interface ToastOptions {
  /** 提示类型 */
  type: ToastType;
  /** 提示内容（支持字符串或 VNode） */
  content: ToastContent;
  /** 持续时间（毫秒），默认 3000ms */
  duration?: number;
  /** 唯一标识，用于判断是否重复（可选） */
  id?: string;
}

/**
 * Toast 提示项
 */
export interface ToastItem {
  /** 唯一标识 */
  id: string;
  /** 提示类型 */
  type: ToastType;
  /** 提示内容（支持字符串或 VNode） */
  content: ToastContent;
  /** 持续时间（毫秒） */
  duration: number;
  /** 创建时间戳 */
  createdAt: number;
  /** 是否需要抖动动画 */
  shake?: boolean;
}

/**
 * 交互 API
 */
export interface InteractionAPI {
  /** 显示 Toast 提示 */
  showToast: (options: ToastOptions) => void;
}
