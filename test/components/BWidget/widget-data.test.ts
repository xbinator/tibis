/**
 * @file widget-data.test.ts
 * @description 验证 BWidget 外部 WidgetData 默认值与契约字段归一化。
 */
import { describe, expect, it } from 'vitest';
import type { WidgetSchemaObject } from '@/components/BWidget/types';
import { createDefaultWidgetData, normalizeWidgetDataContract } from '@/components/BWidget/utils/widgetData';

/** 默认空对象 schema。 */
const emptyObjectSchema: WidgetSchemaObject = {
  type: 'object',
  properties: {},
  required: []
};

describe('dataItem', (): void => {
  it('creates input and state schemas for new widget data without output schema', (): void => {
    const dataItem = createDefaultWidgetData();

    expect(dataItem.inputSchema).toEqual(emptyObjectSchema);
    expect(dataItem.stateSchema).toEqual(emptyObjectSchema);
    expect(dataItem).not.toHaveProperty('outputSchema');
  });

  it('normalizes contract schemas without output schema', (): void => {
    const legacyContract = {
      outputSchema: {
        type: 'object',
        properties: {
          ignored: { type: 'string' }
        },
        required: ['ignored']
      }
    } as unknown as Parameters<typeof normalizeWidgetDataContract>[0];
    const contract = normalizeWidgetDataContract(legacyContract);

    expect(contract.inputSchema).toEqual(emptyObjectSchema);
    expect(contract.stateSchema).toEqual(emptyObjectSchema);
    expect(contract).not.toHaveProperty('outputSchema');
  });

  it('keeps the top-level method script when normalizing widget data contract fields', (): void => {
    const contract = normalizeWidgetDataContract({
      execute: {
        enabled: true,
        description: '查询天气',
        code: "defineConfig({ methods: { confirm() { this.$sendMessage('确认') } } })"
      }
    });

    expect(contract.execute).toEqual({
      enabled: true,
      description: '查询天气',
      code: "defineConfig({ methods: { confirm() { this.$sendMessage('确认') } } })"
    });
  });
});
