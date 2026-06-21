/**
 * @file openai-compatible.test.ts
 * @description OpenAI 兼容服务商 helper 工具测试。
 */
import type { LanguageModel } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 模拟 @ai-sdk/openai-compatible 的 createOpenAICompatible 工厂。
 * @description 用 vi.hoisted 提前声明 mock 引用，避免 vi.mock 提升顺序问题。
 */
const { mockChatModel, mockCreateOpenAICompatible } = vi.hoisted(() => {
  const chatModel = vi.fn((): LanguageModel => ({ modelId: 'mock-model' } as unknown as LanguageModel));
  const factory = vi.fn(() => ({
    chatModel
  }));
  return { mockChatModel: chatModel, mockCreateOpenAICompatible: factory };
});

vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: mockCreateOpenAICompatible
}));

// 必须在 mock 之后导入被测模块
const { createOpenAICompatibleChatModel, normalizeOpenAICompatibleError } = await import(
  '../../../../../../electron/main/modules/ai/helper/openai-compatible.mjs'
);

/** 测试用默认 Base URL。 */
const DEFAULT_BASE_URL = 'https://api.example.com/v1';

/**
 * 构造带 statusCode 与可定制 message 的类 API 错误对象。
 * @param statusCode - HTTP 状态码
 * @param message - 错误消息（同时写入 Error.message 和 responseBody.error.message，匹配 extractErrorDetails 的解析逻辑）
 * @param errorBody - 响应体 error 字段的附加信息（如 code、type）
 * @returns 错误对象
 */
function createApiError(statusCode: number, message: string, errorBody: Record<string, unknown> = {}): Error & { statusCode: number; responseBody: unknown } {
  const error = new Error(message) as Error & { statusCode: number; responseBody: unknown };
  error.statusCode = statusCode;
  error.responseBody = { error: { message, ...errorBody } };
  return error;
}

describe('createOpenAICompatibleChatModel', (): void => {
  beforeEach((): void => {
    mockCreateOpenAICompatible.mockClear();
    mockChatModel.mockClear();
    mockChatModel.mockImplementation((): LanguageModel => ({ modelId: 'mock-model' } as unknown as LanguageModel));
  });

  it('passes apiKey, baseURL override and provider name to the factory', (): void => {
    const model = createOpenAICompatibleChatModel({
      options: {
        providerType: 'mimo',
        providerId: 'custom',
        providerName: 'Custom',
        apiKey: 'sk-test',
        baseUrl: 'https://override.example.com/v2'
      },
      modelId: 'custom-model',
      providerName: 'custom',
      defaultBaseUrl: DEFAULT_BASE_URL
    });

    expect(mockCreateOpenAICompatible).toHaveBeenCalledWith({
      apiKey: 'sk-test',
      baseURL: 'https://override.example.com/v2',
      name: 'custom'
    });
    expect(mockChatModel).toHaveBeenCalledWith('custom-model');
    expect(model).toEqual({ modelId: 'mock-model' });
  });

  it('falls back to defaultBaseUrl when options.baseUrl is omitted', (): void => {
    createOpenAICompatibleChatModel({
      options: {
        providerType: 'mimo',
        providerId: 'custom',
        providerName: 'Custom',
        apiKey: 'sk-test'
      },
      modelId: 'custom-model',
      providerName: 'custom',
      defaultBaseUrl: DEFAULT_BASE_URL
    });

    expect(mockCreateOpenAICompatible).toHaveBeenCalledWith({
      apiKey: 'sk-test',
      baseURL: DEFAULT_BASE_URL,
      name: 'custom'
    });
  });

  it('uses providerName (not providerType) as the SDK name field', (): void => {
    createOpenAICompatibleChatModel({
      options: {
        providerType: 'mimo',
        providerId: 'mimo',
        providerName: 'MiMo'
      },
      modelId: 'mimo-v1',
      providerName: 'mimo',
      defaultBaseUrl: DEFAULT_BASE_URL
    });

    expect(mockCreateOpenAICompatible).toHaveBeenCalledWith(expect.objectContaining({ name: 'mimo' }));
  });
});

describe('normalizeOpenAICompatibleError', (): void => {
  it('returns the mapped common error when mapCommonError matches first (rate limit)', (): void => {
    const error = normalizeOpenAICompatibleError(createApiError(429, 'rate limited', { code: 'rate_limit' }), 'fallback', 'fallback');

    expect(error).toEqual({
      code: 'RATE_LIMITED',
      message: '请求过于频繁或额度已耗尽，请稍后重试'
    });
  });

  it('returns MODEL_NOT_FOUND when errorCode is model_not_found', (): void => {
    const error = normalizeOpenAICompatibleError(createApiError(404, 'not found', { code: 'model_not_found' }), 'MiMo / 小米');

    expect(error).toEqual({
      code: 'MODEL_NOT_FOUND',
      message: '模型不存在或当前MiMo / 小米配置无法访问该模型'
    });
  });

  it('returns MODEL_NOT_FOUND when message matches "no such model"', (): void => {
    const error = normalizeOpenAICompatibleError(new Error('No such model: gpt-9'), 'Volcengine/火山引擎');

    expect(error?.code).toBe('MODEL_NOT_FOUND');
  });

  it('returns MODEL_NOT_FOUND for status 400 when message contains "endpoint"', (): void => {
    const error = normalizeOpenAICompatibleError(createApiError(400, 'invalid endpoint id'), 'Volcengine/火山引擎');

    expect(error).toEqual({
      code: 'MODEL_NOT_FOUND',
      message: '模型配置无效，请检查模型 ID 或 Endpoint ID 是否正确'
    });
  });

  it('returns INVALID_REQUEST for status 400 with generic message', (): void => {
    const error = normalizeOpenAICompatibleError(createApiError(400, 'temperature out of range'), 'GLM / 智谱');

    expect(error).toEqual({
      code: 'INVALID_REQUEST',
      message: 'temperature out of range'
    });
  });

  it('falls back to provider label when 400 message is empty', (): void => {
    const error = normalizeOpenAICompatibleError(createApiError(400, ''), 'GLM / 智谱');

    expect(error).toEqual({
      code: 'INVALID_REQUEST',
      message: 'GLM / 智谱请求参数不合法'
    });
  });

  it('returns REQUEST_FAILED for unmatched errors, using normalized message', (): void => {
    const error = normalizeOpenAICompatibleError(createApiError(418, "I'm a teapot"), 'Moonshot/Kimi');

    expect(error).toEqual({
      code: 'REQUEST_FAILED',
      message: "i'm a teapot"
    });
  });

  it('falls through to mapCommonError for 500 (SERVICE_UNAVAILABLE) when extractErrorDetails yields no match', (): void => {
    // 非 Error 实例也没有 message 字段，mapCommonError 在 500 上命中 SERVICE_UNAVAILABLE 分支
    const error = normalizeOpenAICompatibleError({ statusCode: 500 }, 'Custom', '服务调用失败');

    expect(error).toEqual({
      code: 'SERVICE_UNAVAILABLE',
      message: 'AI 服务暂时不可用，请稍后重试'
    });
  });

  it('preserves already-normalized AIServiceError from mapCommonError', (): void => {
    const normalized = {
      code: 'RATE_LIMITED',
      message: '请求过于频繁或额度已耗尽，请稍后重试'
    } as const;
    // 借助 429 触发 mapCommonError 分支
    const error = normalizeOpenAICompatibleError(createApiError(429, 'rate limited', { code: 'rate_limit' }), 'fallback', normalized.message);

    expect(error).toEqual(normalized);
  });
});
