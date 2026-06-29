/**
 * @file drawing-data.test.ts
 * @description 验证 BDrawing 外部 DrawingData 默认值与契约字段归一化。
 */
import { describe, expect, it } from 'vitest';
import type { DrawingSchemaObject } from '@/components/BDrawing/types';
import { createDefaultDrawingData, normalizeDrawingDataContract } from '@/components/BDrawing/utils/drawingData';

/** 查天气入参默认 schema。 */
const weatherInputSchema: DrawingSchemaObject = {
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
const weatherOutputSchema: DrawingSchemaObject = {
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

describe('drawingData', (): void => {
  it('creates weather query schemas for new drawing data', (): void => {
    const drawingData = createDefaultDrawingData();

    expect(drawingData.inputSchema).toEqual(weatherInputSchema);
    expect(drawingData.outputSchema).toEqual(weatherOutputSchema);
  });

  it('normalizes missing contract schemas to weather query schemas', (): void => {
    const contract = normalizeDrawingDataContract({});

    expect(contract.inputSchema).toEqual(weatherInputSchema);
    expect(contract.outputSchema).toEqual(weatherOutputSchema);
  });
});
