/**
 * @file body.mts
 * @description 平台托管 request 的请求体处理工具。
 */
import type { RequestInput } from 'types/request';
import { isString } from 'lodash-es';

/**
 * 判断是否为 fetch 可直接接收的特殊请求体。
 * @param data - 待判断数据
 * @returns 是否为特殊请求体
 */
export function isSpecialRequestBody(data: unknown): data is Blob | FormData | ReadableStream | URLSearchParams | ArrayBuffer {
  const specialTypes = [Blob, FormData, ReadableStream, URLSearchParams, ArrayBuffer];

  return specialTypes.some((Type): boolean => data instanceof Type);
}

/**
 * 判断是否为 fetch 可直接接收的请求体。
 * @param data - 待判断数据
 * @returns 是否为 fetch 可直接接收的请求体
 */
export function isBodyData(data: unknown): data is BodyInit {
  return isString(data) || isSpecialRequestBody(data);
}

/**
 * 创建请求体相关 fetch 初始化参数。
 * @param request - 托管请求输入
 * @returns fetch 请求体初始化参数
 */
export function createRequestBodyInit(request: RequestInput): Pick<RequestInit, 'body' | 'headers'> {
  if (request.method === 'GET' || request.body === undefined) return {};
  if (isBodyData(request.body)) return { body: request.body };

  return {
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(request.body)
  };
}
