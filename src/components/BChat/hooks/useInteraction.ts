/**
 * @file useInteraction.ts
 * @description 交互容器 inject hook，提供类型安全的交互 API
 */
import type { InteractionAPI } from '../components/InteractionContainer/types';
import { inject } from 'vue';

/**
 * 获取交互 API
 * @returns 交互 API
 * @throws 如果在 InteractionContainer 外部使用则抛出错误
 */
export function useInteraction(): InteractionAPI {
  const api = inject<InteractionAPI>('interaction');

  if (!api) {
    throw new Error('useInteraction must be used within InteractionContainer');
  }

  return api;
}
