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
  it('creates empty schemas for new widget data', (): void => {
    const dataItem = createDefaultWidgetData();

    expect(dataItem.inputSchema).toEqual(emptyObjectSchema);
    expect(dataItem.stateSchema).toEqual(emptyObjectSchema);
    expect(dataItem.outputSchema).toEqual(emptyObjectSchema);
  });

  it('normalizes missing contract schemas to empty schemas', (): void => {
    const contract = normalizeWidgetDataContract({});

    expect(contract.inputSchema).toEqual(emptyObjectSchema);
    expect(contract.stateSchema).toEqual(emptyObjectSchema);
    expect(contract.outputSchema).toEqual(emptyObjectSchema);
  });

  it('keeps the top-level execute method when normalizing widget data contract fields', (): void => {
    const contract = normalizeWidgetDataContract({
      execute: {
        enabled: true,
        description: '查询天气',
        timeout: 10000,
        code: 'export async function execute(ctx) { return ctx.result.success(ctx.input) }'
      }
    });

    expect(contract.execute).toEqual({
      enabled: true,
      description: '查询天气',
      timeout: 10000,
      code: 'export async function execute(ctx) { return ctx.result.success(ctx.input) }'
    });
  });
});
