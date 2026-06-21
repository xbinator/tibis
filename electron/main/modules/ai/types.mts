/**
 * @file types.mts
 * @description AI 服务商接口定义
 */
import type { ProviderOptions } from '@ai-sdk/provider-utils';
import type { LanguageModel } from 'ai';
import type { AIServiceError, AIProviderType, AICreateOptions, AIRequestOptions } from 'types/ai';

/**
 * AI 服务商接口
 * @description 定义所有 AI 服务商必须实现的方法
 */
export interface AIProvider {
  /** 服务商类型标识 */
  readonly type: AIProviderType;

  /**
   * 创建语言模型实例
   * @param options - 创建选项（包含 API Key、Base URL 等）
   * @param modelId - 模型 ID
   * @returns 语言模型实例
   */
  create(options: AICreateOptions, modelId: string): LanguageModel;

  /**
   * 创建供应商专属请求参数。
   * @param request - 当前 AI 请求
   * @returns AI SDK providerOptions；无供应商专属参数时返回 undefined
   */
  createProviderOptions?(request: AIRequestOptions): ProviderOptions | undefined;

  /**
   * 标准化错误对象
   * @param error - 原始错误
   * @param fallbackMessage - 默认错误消息
   * @returns 标准化的 AIServiceError 对象
   */
  normalizeError(error: unknown, fallbackMessage?: string): AIServiceError;
}
