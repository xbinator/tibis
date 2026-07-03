/**
 * @file widget-http-client.test.ts
 * @description BChat 小组件托管 HTTP 客户端测试。
 */
import type { RequestInput, RequestResponse } from 'types/request';
import { describe, expect, it } from 'vitest';
import { createWidgetHttpClient } from '@/components/BWidget/utils/widgetRuntime';

describe('request protocol', (): void => {
  it('uses a small request and response contract without permission config', (): void => {
    const request: RequestInput = {
      method: 'GET',
      url: 'https://api.example.com/weather',
      query: {
        city: '上海'
      }
    };

    const response: RequestResponse = {
      status: 200,
      ok: true,
      url: 'https://api.example.com/weather?city=%E4%B8%8A%E6%B5%B7',
      headers: {
        'content-type': 'application/json'
      },
      data: {
        temperature: 28
      }
    };

    expect(request).toMatchObject({ method: 'GET' });
    expect(response.ok).toBe(true);
  });
});

describe('createWidgetHttpClient', (): void => {
  it('normalizes GET query requests before calling the native bridge', async (): Promise<void> => {
    const requests: RequestInput[] = [];
    const client = createWidgetHttpClient({
      request: async (request: RequestInput): Promise<RequestResponse> => {
        requests.push(request);
        return {
          status: 200,
          ok: true,
          url: request.url,
          headers: {},
          data: { ok: true }
        };
      }
    });

    await client.get('https://api.example.com/weather', {
      query: {
        city: '上海'
      }
    });

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
});
