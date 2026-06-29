/**
 * @file widget-data.test.ts
 * @description 验证 BWidget 外部 WidgetData 默认值与契约字段归一化。
 */
import { describe, expect, it } from 'vitest';
import type { WidgetSchemaObject } from '@/components/BWidget/types';
import { createDefaultWidgetData, normalizeWidgetDataContract } from '@/components/BWidget/utils/widgetData';

/** 查天气入参默认 schema。 */
const weatherInputSchema: WidgetSchemaObject = {
  type: 'object',
  properties: {
    city: {
      type: 'string',
      description: '城市名称，例如上海'
    },
    date: {
      type: 'string',
      description: '查询日期，例如今天或明天'
    },
    unit: {
      type: 'string',
      description: '温度单位，celsius 或 fahrenheit'
    }
  },
  required: ['city']
};

/** 查天气出参默认 schema。 */
const weatherOutputSchema: WidgetSchemaObject = {
  type: 'object',
  properties: {
    condition: {
      type: 'string',
      description: '天气概况'
    },
    temperatureCelsius: {
      type: 'number',
      description: '摄氏温度'
    },
    suggestion: {
      type: 'string',
      description: '出行建议'
    }
  },
  required: ['condition', 'temperatureCelsius']
};

describe('dataItem', (): void => {
  it('creates weather query schemas for new widget data', (): void => {
    const dataItem = createDefaultWidgetData();

    expect(dataItem.inputSchema).toEqual(weatherInputSchema);
    expect(dataItem.outputSchema).toEqual(weatherOutputSchema);
  });

  it('normalizes missing contract schemas to weather query schemas', (): void => {
    const contract = normalizeWidgetDataContract({});

    expect(contract.inputSchema).toEqual(weatherInputSchema);
    expect(contract.outputSchema).toEqual(weatherOutputSchema);
  });
});
