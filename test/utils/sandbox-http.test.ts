/**
 * @file sandbox-http.test.ts
 * @description 通用 JS 沙箱 HTTP 宿主能力测试。
 */
import type { RequestInput, RequestResponse } from 'types/request';
import { describe, expect, it } from 'vitest';
import { createSandboxHttpHost, SANDBOX_HTTP_HOST_FUNCTION_NAME, runSandboxCode } from '@/utils/sandbox';

describe('createSandboxHttpHost', (): void => {
  it('bridges validated request input through a generic host function', async (): Promise<void> => {
    const requests: RequestInput[] = [];
    const hostFunctions = createSandboxHttpHost({
      request: async (request: RequestInput): Promise<RequestResponse> => {
        requests.push(request);
        return {
          status: 200,
          ok: true,
          url: request.url,
          headers: {},
          data: {
            ok: true
          }
        };
      }
    });

    const result = await runSandboxCode(
      {
        code: [
          `const response = await ${SANDBOX_HTTP_HOST_FUNCTION_NAME}({`,
          "  method: 'GET',",
          "  url: 'https://api.example.com/weather',",
          "  query: { city: '上海' }",
          '})',
          'return response.data'
        ].join('\n')
      },
      {
        useWorker: false,
        hostFunctions
      }
    );

    expect(result.value).toEqual({ ok: true });
    expect(requests).toEqual([
      {
        method: 'GET',
        url: 'https://api.example.com/weather',
        query: {
          city: '上海'
        }
      }
    ]);
  });

  it('rejects invalid request input before calling the host request dependency', async (): Promise<void> => {
    const hostFunctions = createSandboxHttpHost({
      request: async (): Promise<RequestResponse> => {
        throw new Error('unexpected request call');
      }
    });

    await expect(
      runSandboxCode(
        {
          code: [`await ${SANDBOX_HTTP_HOST_FUNCTION_NAME}({`, "  method: 'TRACE',", "  url: 'https://api.example.com/weather'", '})'].join('\n')
        },
        {
          useWorker: false,
          hostFunctions
        }
      )
    ).rejects.toThrow('沙箱 HTTP 请求参数无效');
  });

  it('rejects non-http URLs before calling the host request dependency', async (): Promise<void> => {
    const requests: RequestInput[] = [];
    const hostFunctions = createSandboxHttpHost({
      request: async (request: RequestInput): Promise<RequestResponse> => {
        requests.push(request);
        return {
          status: 200,
          ok: true,
          url: request.url,
          headers: {},
          data: ''
        };
      }
    });

    await expect(
      runSandboxCode(
        {
          code: [`await ${SANDBOX_HTTP_HOST_FUNCTION_NAME}({`, "  method: 'GET',", "  url: 'file:///etc/passwd'", '})'].join('\n')
        },
        {
          useWorker: false,
          hostFunctions
        }
      )
    ).rejects.toThrow('沙箱 HTTP URL 仅支持 http/https');
    expect(requests).toEqual([]);
  });
});
