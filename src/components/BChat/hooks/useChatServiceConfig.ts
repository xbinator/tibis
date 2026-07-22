/**
 * @file useChatServiceConfig.ts
 * @description BChat chat 服务配置解析 hook。
 */
import type { ServiceConfig } from '../utils/types';
import { getModelToolSupport } from '@/ai/tools/policy';
import type { SelectedModel } from '@/stores/ai/serviceModel';

/**
 * Chat 服务配置 hook 返回值。
 */
interface UseChatServiceConfigReturn {
  /** 解析当前 UI 模型及其工具支持能力。 */
  resolveServiceConfig: () => Promise<ServiceConfig | undefined>;
}

/**
 * BChat chat 服务配置解析 hook。
 * @param resolveSelectedModel - 加载会话元数据后解析当前 UI 模型
 * @returns chat 服务配置操作
 */
export function useChatServiceConfig(resolveSelectedModel: () => Promise<SelectedModel | undefined>): UseChatServiceConfigReturn {
  /**
   * 解析当前 UI 模型配置，并补充工具支持能力。
   * @returns chat 服务配置，不存在时返回 undefined
   */
  async function resolveServiceConfig(): Promise<ServiceConfig | undefined> {
    const model = await resolveSelectedModel();
    if (!model) return undefined;

    const toolSupport = await getModelToolSupport(model.providerId, model.modelId);
    return { providerId: model.providerId, modelId: model.modelId, toolSupport };
  }

  return {
    resolveServiceConfig
  };
}
