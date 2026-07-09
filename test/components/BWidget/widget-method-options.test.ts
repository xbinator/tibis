/**
 * @file widget-method-options.test.ts
 * @description 验证 Widget 脚本公开方法选项提取。
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectWidgetPublicMethodOptions } from '@/components/BWidget/hooks/useElementMethods';

describe('collectWidgetPublicMethodOptions', (): void => {
  it('collects public custom methods from the default exported Widget class', (): void => {
    const code = [
      'export default class OrderWidget extends Widget {',
      '  onExecute() {}',
      '  onMounted() {}',
      '  submitOrder(orderId, remark) {}',
      '  refreshList() {}',
      '  private secret() {}',
      '  protected helper() {}',
      '  _internal() {}',
      '  $reserved() {}',
      '}'
    ].join('\n');

    expect(collectWidgetPublicMethodOptions(code)).toEqual([
      {
        label: 'submitOrder',
        parameters: ['orderId', 'remark'],
        value: 'submitOrder'
      },
      {
        label: 'refreshList',
        parameters: [],
        value: 'refreshList'
      }
    ]);
  });

  it('does not keep the legacy widget methods utility file', (): void => {
    const utilityPath = resolve(__dirname, '../../../src/components/BWidget/utils/widgetMethods.ts');

    expect(existsSync(utilityPath)).toBe(false);
  });
});
