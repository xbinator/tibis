/**
 * @file http.ts
 * @description 通用 JS 沙箱 HTTP 宿主能力。
 */
import type { SandboxHostFunction } from './types';
import type { RequestInput, RequestQueryValue, RequestResponse } from 'types/request';
import { isPlainObject } from 'lodash-es';

/** 沙箱中默认暴露的 HTTP 宿主函数名。 */
export const SANDBOX_HTTP_HOST_FUNCTION_NAME = '__sandboxHttpRequest';

/**
 * 沙箱 HTTP 宿主能力选项。
 */
export interface SandboxHttpHostOptions {
  /** 实际执行 HTTP 请求的宿主依赖。 */
  request?: (request: RequestInput) => Promise<RequestResponse>;
  /** 注入到沙箱中的宿主函数名。 */
  functionName?: string;
  /** 未启用 request 依赖时的错误提示。 */
  disabledMessage?: string;
  /** 请求参数无效时的错误提示。 */
  invalidRequestMessage?: string;
}

/** 允许的 HTTP 方法。 */
const ALLOWED_REQUEST_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

/**
 * 判断值是否为普通对象记录。
 * @param value - 待判断值
 * @returns 是否为普通对象记录
 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return isPlainObject(value);
}

/**
 * 判断值是否为托管请求查询参数值。
 * @param value - 待判断值
 * @returns 是否为查询参数值
 */
function isRequestQueryValue(value: unknown): value is RequestQueryValue {
  return value === undefined || value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/**
 * 判断值是否为托管请求查询参数对象。
 * @param value - 待判断值
 * @returns 是否为查询参数对象
 */
function isRequestQuery(value: unknown): value is Record<string, RequestQueryValue> {
  return isPlainRecord(value) && Object.values(value).every(isRequestQueryValue);
}

/**
 * 判断 URL 是否为沙箱 HTTP 能力允许的协议。
 * @param url - 待判断 URL
 * @returns 是否为 http/https URL
 */
function isAllowedHttpUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);

    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * 判断值是否为沙箱允许的托管请求输入。
 * @param value - 待判断值
 * @returns 是否为托管请求输入
 */
function isSandboxRequestInput(value: unknown): value is RequestInput {
  if (!isPlainRecord(value)) return false;
  if (!ALLOWED_REQUEST_METHODS.includes(value.method as (typeof ALLOWED_REQUEST_METHODS)[number])) return false;
  if (typeof value.url !== 'string') return false;
  if (!isAllowedHttpUrl(value.url)) return false;
  if (value.query !== undefined && !isRequestQuery(value.query)) return false;

  return true;
}

/**
 * 创建通用沙箱 HTTP 宿主函数表。
 * @param options - HTTP 宿主能力选项
 * @returns 可传给 runSandboxCode 的宿主函数表
 */
export function createSandboxHttpHost(options: SandboxHttpHostOptions = {}): Record<string, SandboxHostFunction> {
  const functionName = options.functionName ?? SANDBOX_HTTP_HOST_FUNCTION_NAME;

  return {
    [functionName]: async (request: unknown): Promise<RequestResponse> => {
      if (!isSandboxRequestInput(request)) {
        const invalidMessage =
          isPlainRecord(request) &&
          ALLOWED_REQUEST_METHODS.includes(request.method as (typeof ALLOWED_REQUEST_METHODS)[number]) &&
          typeof request.url === 'string' &&
          !isAllowedHttpUrl(request.url)
            ? '沙箱 HTTP URL 仅支持 http/https'
            : '沙箱 HTTP 请求参数无效';

        throw new Error(options.invalidRequestMessage ?? invalidMessage);
      }

      if (!options.request) {
        throw new Error(options.disabledMessage ?? '当前环境未启用沙箱 HTTP 请求能力');
      }

      return options.request(request);
    }
  };
}
