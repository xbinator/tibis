/**
 * @file useInteractionState.ts
 * @description 交互容器状态管理 hook，提供 Toast 的显示逻辑
 */
import type { ToastOptions, ToastItem, InteractionAPI, ToastContent } from '../components/InteractionContainer/types';
import { isVNode, ref } from 'vue';

/**
 * 比较两个 Toast 内容是否相等
 * @param a - 内容 A
 * @param b - 内容 B
 * @returns 是否相等
 */
function isSameContent(a: ToastContent, b: ToastContent): boolean {
  // 如果都是 VNode，不认为是同一个（VNode 每次创建都是新对象）
  if (isVNode(a) || isVNode(b)) return false;
  return a === b;
}

/**
 * 交互容器状态管理
 * @param options - 配置选项
 * @returns 交互 API 和状态
 */
export function useInteractionState(options?: { maxToastCount?: number; defaultDuration?: number }) {
  const maxToastCount = options?.maxToastCount ?? 3;
  const defaultDuration = options?.defaultDuration ?? 3000;

  /** Toast 队列 */
  const toastQueue = ref<ToastItem[]>([]);

  /**
   * 重置 Toast 的自动关闭定时器
   * @param toast - Toast 项
   */
  function resetToastTimer(toast: ToastItem): void {
    // 更新创建时间，相当于重置定时器
    toast.createdAt = Date.now();
  }

  /**
   * 显示 Toast 提示
   * @param toastOptions - Toast 选项
   */
  function showToast(toastOptions: ToastOptions): void {
    // 检查是否已存在相同 content 的 toast（VNode 不参与重复检测）
    const existingToast = toastQueue.value.find((t) => isSameContent(t.content, toastOptions.content));
    if (existingToast) {
      // 已存在，触发抖动动画
      existingToast.shake = true;
      // 重置定时器（重新计时）
      resetToastTimer(existingToast);
      // 300ms 后移除抖动标记
      setTimeout(() => {
        existingToast.shake = false;
      }, 300);
      return;
    }

    const toast: ToastItem = {
      id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type: toastOptions.type,
      content: toastOptions.content,
      duration: toastOptions.duration ?? defaultDuration,
      createdAt: Date.now()
    };

    toastQueue.value.push(toast);

    // 超出最大数量时，移除最早的
    if (toastQueue.value.length > maxToastCount) {
      toastQueue.value.shift();
    }
  }

  /**
   * 移除 Toast
   * @param id - Toast ID
   */
  function removeToast(id: string): void {
    const index = toastQueue.value.findIndex((t) => t.id === id);
    if (index > -1) {
      toastQueue.value.splice(index, 1);
    }
  }

  /** 交互 API */
  const api: InteractionAPI = {
    showToast
  };

  return {
    api,
    toastQueue,
    removeToast
  };
}
