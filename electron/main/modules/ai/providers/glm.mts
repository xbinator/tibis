/**
 * @file glm.mts
 * @description GLM / 智谱 AI 服务商实现
 */
import type { AIProvider } from '../types.mjs';
import type { LanguageModel } from 'ai';
import type { AIServiceError, AICreateOptions } from 'types/ai';
import { createOpenAICompatibleChatModel, normalizeOpenAICompatibleError } from '../helper/openai-compatible.mjs';

/** GLM / 智谱默认 OpenAI 兼容接口地址。 */
const DEFAULT_GLM_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4';

/**
 * GLM / 智谱服务商。
 * @description 实现 GLM 模型的创建和错误处理
 */
export class GLMProvider implements AIProvider {
  /** 服务商类型标识 */
  readonly type = 'glm' as const;

  /**
   * 创建 GLM 语言模型实例。
   * @param options - 创建选项（包含 API Key、Base URL 等）
   * @param modelId - 模型 ID
   * @returns 语言模型实例
   */
  create(options: AICreateOptions, modelId: string): LanguageModel {
    return createOpenAICompatibleChatModel({
      options,
      modelId,
      providerName: 'glm',
      defaultBaseUrl: DEFAULT_GLM_BASE_URL
    });
  }

  /**
   * 标准化 GLM / 智谱错误。
   * @param error - 原始错误
   * @param fallbackMessage - 默认错误消息
   * @returns 标准化的 AIServiceError
   */
  normalizeError(error: unknown, fallbackMessage = '服务调用失败'): AIServiceError {
    return normalizeOpenAICompatibleError(error, 'GLM / 智谱', fallbackMessage);
  }
}
