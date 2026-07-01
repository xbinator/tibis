/**
 * @file request.d.ts
 * @description 平台托管 request 能力的跨层协议类型定义。
 */

/**
 * 托管请求方法。
 */
export type RequestMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * 托管请求查询参数。
 */
export type RequestQueryValue = string | number | boolean | null | undefined;

/**
 * 托管请求 JSON 请求体。
 */
export type RequestJsonValue = string | number | boolean | null | RequestJsonValue[] | { [key: string]: RequestJsonValue };

/**
 * fetch 可直接接收的特殊请求体。
 */
export type RequestSpecialBody = Blob | FormData | ReadableStream | URLSearchParams | ArrayBuffer;

/**
 * 托管请求体。
 */
export type RequestBody = RequestJsonValue | RequestSpecialBody;

/**
 * 托管请求输入。
 */
export interface RequestInput {
  /** 请求方法 */
  method: RequestMethod;
  /** 请求 URL，仅支持 http/https */
  url: string;
  /** 查询参数 */
  query?: Record<string, RequestQueryValue>;
  /** 请求体，普通对象会作为 JSON 发送，字符串和特殊请求体会直接发送 */
  body?: RequestBody;
}

/**
 * 托管请求响应。
 */
export interface RequestResponse {
  /** 最终响应 URL */
  url: string;
  /** HTTP 状态码 */
  status: number;
  /** 是否为 2xx 响应 */
  ok: boolean;
  /** 响应头，key 统一小写 */
  headers: Record<string, string>;
  /** 响应数据，JSON 响应为对象；其他响应为文本 */
  data: unknown;
}
