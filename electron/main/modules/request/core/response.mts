/**
 * @file response.mts
 * @description 平台托管 request 的响应解析工具。
 */
import { REQUEST_MAX_RESPONSE_BYTES } from './constants.mjs';

/**
 * 取消响应正文读取器，忽略取消过程中的底层错误。
 * @param reader - 响应正文读取器
 */
async function cancelResponseBodyReader(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
  try {
    await reader.cancel();
  } catch {
    // 响应读取已经失败时，取消失败不应覆盖原始错误。
  }
}

/**
 * 读取响应文本，并在超过大小限制时立即停止读取。
 * @param response - Fetch 响应
 * @returns 响应文本
 */
async function readLimitedResponseText(response: Response): Promise<string> {
  if (!response.body) {
    const text = await response.text();

    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = '';
  let shouldCancel = false;

  try {
    let readResult = await reader.read();
    while (!readResult.done) {
      totalBytes += readResult.value.byteLength;
      if (totalBytes > REQUEST_MAX_RESPONSE_BYTES) {
        shouldCancel = true;
        break;
      }

      text += decoder.decode(readResult.value, { stream: true });
      // 响应体必须按顺序读取，超限后立即终止后续数据拉取。
      // eslint-disable-next-line no-await-in-loop
      readResult = await reader.read();
    }

    return text + decoder.decode();
  } finally {
    if (shouldCancel) {
      await cancelResponseBodyReader(reader);
    }
    reader.releaseLock();
  }
}

/**
 * 解析响应正文。
 * @param response - Fetch 响应
 * @returns 响应数据
 */
export async function readRequestResponseData(response: Response): Promise<unknown> {
  const text = await readLimitedResponseText(response);

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return text;
  }

  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
