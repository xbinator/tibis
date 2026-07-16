/**
 * @file google.mts
 * @description Google AI 服务商实现
 */
import type { AIProvider } from '../types.mjs';
import type { LanguageModel } from 'ai';
import type { AIServiceError, AICreateOptions } from 'types/ai';
import { createGoogle } from '@ai-sdk/google';
import { AI_ERROR_CODE, createAIServiceError } from '../errors/codes.mjs';
import { mapCommonError } from '../errors/common.mjs';
import { extractErrorDetails } from '../errors/utils.mjs';

/**
 * Google AI 服务商
 * @description 实现 Google Gemini 模型的创建和错误处理
 */
export class GoogleProvider implements AIProvider {
  /** 服务商类型标识 */
  readonly type = 'google' as const;

  /**
   * 创建 Google AI 语言模型实例
   * @param options - 创建选项（包含 API Key、Base URL 等）
   * @param modelId - 模型 ID
   * @returns 语言模型实例
   */
  create(options: AICreateOptions, modelId: string) {
    const { apiKey, baseUrl: baseURL, providerName } = options;

    const google = createGoogle({ apiKey, baseURL, name: providerName });
    return google(modelId) as LanguageModel;
  }

  /**
   * 标准化 Google AI 错误
   * @param error - 原始错误
   * @param fallbackMessage - 默认错误消息
   * @returns 标准化的 AIServiceError
   */
  normalizeError(error: unknown, fallbackMessage = '服务调用失败'): AIServiceError {
    // 先尝试映射通用错误
    const commonError = mapCommonError(error, fallbackMessage);
    if (commonError) {
      return commonError;
    }

    const details = extractErrorDetails(error, fallbackMessage);

    const { statusCode, normalizedMessage, providerStatus } = details;

    // 处理模型未找到错误
    if (providerStatus === 'not_found' || /model not found|publisher model/i.test(normalizedMessage)) {
      return createAIServiceError(AI_ERROR_CODE.MODEL_NOT_FOUND, '模型不存在或当前 Google AI 配置无法访问该模型');
    }

    // 处理 API Key 无效错误
    if (statusCode === 400 && normalizedMessage.includes('api key')) {
      return createAIServiceError(AI_ERROR_CODE.UNAUTHORIZED, 'Google AI API Key 无效');
    }

    // 处理请求参数错误
    if (statusCode === 400) {
      return createAIServiceError(AI_ERROR_CODE.INVALID_REQUEST, normalizedMessage || 'Google AI 请求参数不合法');
    }

    return createAIServiceError(AI_ERROR_CODE.REQUEST_FAILED, details.message || fallbackMessage);
  }
}
