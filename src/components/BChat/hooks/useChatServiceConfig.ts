/**
 * @file useChatServiceConfig.ts
 * @description BChat chat 服务配置解析 hook。
 */
import type { ServiceConfig } from '../utils/types';
import { getModelToolSupport } from '@/ai/tools/policy';
import { useServiceModelStore } from '@/stores/ai/serviceModel';

/**
 * BChat chat 服务配置解析 hook。
 * @returns chat 服务配置操作
 */
export function useChatServiceConfig(): { resolveServiceConfig: () => Promise<ServiceConfig | undefined> } {
  const serviceModelStore = useServiceModelStore();

  /**
   * 解析当前 chat 场景可用模型配置，并补充工具支持能力。
   * @returns chat 服务配置，不存在时返回 undefined
   */
  async function resolveServiceConfig(): Promise<ServiceConfig | undefined> {
    let config = await serviceModelStore.getAvailableServiceConfig('chat');
    if (!config?.providerId || !config?.modelId) {
      config = await serviceModelStore.getAvailableServiceConfig('chat');
    }
    if (!config?.providerId || !config?.modelId) {
      return undefined;
    }

    const toolSupport = await getModelToolSupport(config.providerId, config.modelId);
    return { providerId: config.providerId, modelId: config.modelId, toolSupport };
  }

  return {
    resolveServiceConfig
  };
}
