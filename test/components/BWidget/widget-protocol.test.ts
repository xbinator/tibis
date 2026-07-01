/**
 * @file widget-protocol.test.ts
 * @description 验证小组件协议工具的统一归一化行为。
 */
import { describe, expect, it } from 'vitest';
import { createWidgetSubmitSuccessResult, normalizeWidgetSendMessage } from '@/shared/widget/protocol';

describe('widgetProtocol', (): void => {
  it('normalizes widget submit values into string-only success result data', (): void => {
    expect(
      createWidgetSubmitSuccessResult({
        coffeeId: 'latte',
        count: 2,
        extra: {
          hot: true
        },
        empty: undefined
      })
    ).toEqual({
      status: 'success',
      data: {
        coffeeId: 'latte',
        count: '2',
        extra: '{"hot":true}',
        empty: ''
      }
    });
  });

  it('normalizes sendMessage content without chat message part ids', (): void => {
    expect(
      normalizeWidgetSendMessage({
        content: [{ type: 'text', text: '确认下单' }],
        isError: true
      })
    ).toEqual({
      content: [{ type: 'text', text: '确认下单' }],
      isError: true
    });
  });
});
