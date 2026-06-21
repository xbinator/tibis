/**
 * @file openai-compatible.mts
 * @description OpenAI 兼容服务商的共享创建和错误处理工具
 */
import type { LanguageModel } from 'ai';
import type { AIServiceError, AICreateOptions } from 'types/ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { AI_ERROR_CODE, createAIServiceError } from '../errors/codes.mjs';
import { mapCommonError } from '../errors/common.mjs';
import { extractErrorDetails } from '../errors/utils.mjs';

/**
 * OpenAI 兼容模型创建配置。
 */
interface OpenAICompatibleModelConfig {
  /** 创建选项（包含 API Key、Base URL 等）。 */
  options: AICreateOptions;
  /** 模型 ID。 */
  modelId: string;
  /** providerOptions 使用的服务商名称。 */
  providerName: string;
  /** 默认 OpenAI 兼容接口地址。 */
  defaultBaseUrl: string;
}

/**
 * 创建 OpenAI 兼容的语言模型实例。
 * @param config - 模型创建配置
 * @returns 语言模型实例
 */
export function createOpenAICompatibleChatModel(config: OpenAICompatibleModelConfig): LanguageModel {
  const { options, modelId, providerName, defaultBaseUrl } = config;
  const { apiKey, baseUrl } = options;
  const provider = createOpenAICompatible<string, string, string, string>({
    apiKey,
    baseURL: baseUrl ?? defaultBaseUrl,
    name: providerName
  });

  return provider.chatModel(modelId) as LanguageModel;
}

/**
 * 标准化 OpenAI 兼容服务商错误。
 * @param error - 原始错误
 * @param providerLabel - 服务商显示名称
 * @param fallbackMessage - 默认错误消息
 * @returns 标准化的 AIServiceError
 */
export function normalizeOpenAICompatibleError(error: unknown, providerLabel: string, fallbackMessage = '服务调用失败'): AIServiceError {
  // 先尝试映射通用错误
  const commonError = mapCommonError(error, fallbackMessage);
  if (commonError) {
    return commonError;
  }

  const details = extractErrorDetails(error, fallbackMessage);

  const { statusCode, errorCode, normalizedMessage } = details;

  // 处理模型未找到错误
  if (errorCode === 'model_not_found' || /model not found|no such model|does not exist/i.test(normalizedMessage)) {
    return createAIServiceError(AI_ERROR_CODE.MODEL_NOT_FOUND, `模型不存在或当前${providerLabel}配置无法访问该模型`);
  }

  // 处理模型配置无效错误
  if (statusCode === 400 && (normalizedMessage.includes('model') || normalizedMessage.includes('endpoint'))) {
    return createAIServiceError(AI_ERROR_CODE.MODEL_NOT_FOUND, '模型配置无效，请检查模型 ID 或 Endpoint ID 是否正确');
  }

  // 处理请求参数错误
  if (statusCode === 400) {
    return createAIServiceError(AI_ERROR_CODE.INVALID_REQUEST, normalizedMessage || `${providerLabel}请求参数不合法`);
  }

  return createAIServiceError(AI_ERROR_CODE.REQUEST_FAILED, normalizedMessage || fallbackMessage);
}
