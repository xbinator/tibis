/**
 * @file widget-data.test.ts
 * @description 验证 BWidget 外部 WidgetData 默认值与契约字段归一化。
 */
import { describe, expect, it } from 'vitest';
import type { WidgetSchemaObject } from '@/components/BWidget/types';
import { createDefaultWidgetData, normalizeWidgetDataContract } from '@/components/BWidget/utils/widgetData';
import { createDefaultWidgetExecuteMethod } from '@/components/BWidget/utils/widgetExecuteMethod';

/** 默认空对象 schema。 */
const emptyObjectSchema: WidgetSchemaObject = {
  type: 'object',
  properties: {},
  required: []
};

describe('dataItem', (): void => {
  it('creates class-style default execute method from widget id', (): void => {
    const execute = createDefaultWidgetExecuteMethod('weather-card');

    expect(execute.code).toContain('export default class WeatherCard extends Widget');
    expect(execute.code).not.toContain('Widget({');
    expect(execute.code).not.toContain('Promise<void>');
    expect(execute.code).not.toContain('$logger');
    expect(execute.code).not.toContain('async mounted');
  });

  it('falls back to Component when widget id conflicts with base class name', (): void => {
    const execute = createDefaultWidgetExecuteMethod('widget');

    expect(execute.code).toContain('export default class Component extends Widget');
  });

  it('creates input and data schemas for new widget data without output schema', (): void => {
    const dataItem = createDefaultWidgetData();

    expect(dataItem.inputSchema).toEqual(emptyObjectSchema);
    expect(dataItem.dataSchema).toEqual(emptyObjectSchema);
    expect(dataItem.execute).toEqual(createDefaultWidgetExecuteMethod());
    expect(dataItem).not.toHaveProperty('outputSchema');
    expect(dataItem).not.toHaveProperty('viewport');
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
    expect(contract.dataSchema).toEqual(emptyObjectSchema);
    expect(contract).not.toHaveProperty('outputSchema');
  });

  it('keeps the top-level method script when normalizing widget data contract fields', (): void => {
    const contract = normalizeWidgetDataContract({
      execute: {
        enabled: true,
        description: '查询天气',
        code: "export default class Weather extends Widget { confirm() { this.$sendMessage('确认') } }"
      }
    });

    expect(contract.execute).toEqual({
      enabled: true,
      description: '查询天气',
      code: "export default class Weather extends Widget { confirm() { this.$sendMessage('确认') } }"
    });
  });
});
