import type { ExtractedErrorDetails } from './codes.mjs';
import { get, isObject } from 'lodash-es';

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

const toStr = (v: unknown) => (typeof v === 'string' ? v.toLowerCase() : undefined);
const toNum = (v: unknown) => (typeof v === 'number' ? v : undefined);

// ─── 主函数 ───────────────────────────────────────────────────────────────────

export function extractErrorDetails(error: unknown, fallbackMessage: string): ExtractedErrorDetails {
  const root = isObject(error) ? error : undefined;
  const message = error instanceof Error ? error.message : fallbackMessage;

  // 按优先级依次查找 error 载体
  const errorSource = get(root, 'responseBody.error') ?? get(root, 'data.error') ?? root ?? {};

  return {
    message,
    normalizedMessage: message.toLowerCase(),
    statusCode: toNum(get(root, 'statusCode')),
    errorCode: toStr(get(errorSource, 'code')),
    errorType: toStr(get(errorSource, 'type')),
    providerStatus: toStr(get(errorSource, 'status'))
  };
}
