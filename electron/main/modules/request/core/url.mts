/**
 * @file url.mts
 * @description 平台托管 request 的 URL 处理工具。
 */
import type { RequestInput, RequestQueryValue } from 'types/request';

/**
 * 将查询参数写入 URL。
 * @param url - URL 对象
 * @param query - 查询参数
 */
function appendQueryParams(url: URL, query?: Record<string, RequestQueryValue>): void {
  if (!query) return;

  Object.entries(query).forEach(([key, value]): void => {
    if (value === undefined) return;
    url.searchParams.set(key, value === null ? '' : String(value));
  });
}

/**
 * 校验并创建请求 URL。
 * @param request - 托管请求输入
 * @returns URL 对象
 */
export function createRequestUrl(request: RequestInput): URL {
  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('仅支持 http/https 请求');
  }
  appendQueryParams(url, request.query);
  return url;
}
