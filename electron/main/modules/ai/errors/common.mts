/**
 * @file common.mts
 * @description 通用错误映射函数，将原始错误转换为标准化的 AIServiceError
 */
import type { AIServiceError } from 'types/ai';
import { AI_ERROR_CODE, createAIServiceError, isAIServiceError } from './codes.mjs';
import { extractErrorDetails } from './utils.mjs';

/** 频率限制相关的 HTTP 状态码 */
const RATE_LIMIT_STATUS_CODES = [429, 529];

/** 频率限制相关的错误类型 */
const RATE_LIMIT_ERROR_TYPES = ['rate_limit_error', 'overloaded_error'];

/** 频率限制与额度耗尽相关的关键词 */
const RATE_LIMIT_KEYWORDS = [
  'rate limit',
  'too many requests',
  'quota',
  'resource exhausted',
  'insufficient balance',
  'insufficient credit',
  'balance not enough'
];

/** 服务不可用相关的 HTTP 状态码 */
const SERVICE_UNAVAILABLE_STATUS_CODES = [500, 502, 503, 504];

/** 无效 URL 相关的关键词 */
const INVALID_URL_KEYWORDS = ['base url', 'invalid url', 'failed to parse url', 'unsupported protocol'];

/**
 * 映射通用错误到标准化的 AIServiceError
 * @param error - 原始错误对象
 * @param fallbackMessage - 默认错误消息
 * @returns 标准化的 AIServiceError，如果无法映射则返回 null
 */
export function mapCommonError(error: unknown, fallbackMessage: string): AIServiceError | null {
  // 如果已经是标准化的错误，直接返回
  if (isAIServiceError(error)) {
    return error;
  }

  const details = extractErrorDetails(error, fallbackMessage);

  // 处理认证错误（401）
  if (details.statusCode === 401 || details.normalizedMessage.includes('unauthorized')) {
    return createAIServiceError(AI_ERROR_CODE.UNAUTHORIZED, 'API Key 无效或已过期');
  }

  // 处理权限错误（403）
  if (details.statusCode === 403 || details.providerStatus === 'permission_denied') {
    return createAIServiceError(AI_ERROR_CODE.FORBIDDEN, '当前账号没有访问该服务或模型的权限');
  }

  // 处理频率限制错误
  const isRateLimited =
    (details.statusCode && RATE_LIMIT_STATUS_CODES.includes(details.statusCode)) ||
    details.providerStatus === 'resource_exhausted' ||
    (details.errorType && RATE_LIMIT_ERROR_TYPES.includes(details.errorType)) ||
    RATE_LIMIT_KEYWORDS.some((keyword) => details.normalizedMessage.includes(keyword));

  if (isRateLimited) {
    return createAIServiceError(AI_ERROR_CODE.RATE_LIMITED, '请求过于频繁或额度已耗尽，请稍后重试');
  }

  // 处理服务不可用错误
  if (details.statusCode && SERVICE_UNAVAILABLE_STATUS_CODES.includes(details.statusCode)) {
    return createAIServiceError(AI_ERROR_CODE.SERVICE_UNAVAILABLE, 'AI 服务暂时不可用，请稍后重试');
  }

  // 处理无效 URL 错误
  const isInvalidUrl = INVALID_URL_KEYWORDS.some((keyword) => details.normalizedMessage.includes(keyword));

  if (isInvalidUrl) {
    return createAIServiceError(AI_ERROR_CODE.INVALID_BASE_URL, 'API 地址格式不正确');
  }

  return null;
}
