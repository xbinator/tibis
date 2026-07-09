/**
 * @file widget-data.test.ts
 * @description 验证 BWidget 外部 WidgetData 默认值与契约字段归一化。
 */
import { readFileSync } from 'node:fs';
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
    expect(execute.code).toContain('onExecute()');
    expect(execute.code).toContain('onMounted()');
    expect(execute.code).not.toContain('confirm()');
    expect(execute.code).not.toContain('weather');
    expect(execute.code).not.toContain('$sendMessage');
    expect(execute.code).not.toContain('$http.get');
    expect(execute.code).not.toContain('$logger.info');
    expect(execute.code).not.toContain('Widget({');
    expect(execute.code).not.toContain('Promise<void>');
    expect(execute.code).not.toContain('async mounted');
  });

  it('falls back to Component when widget id conflicts with base class name', (): void => {
    const execute = createDefaultWidgetExecuteMethod('widget');

    expect(execute.code).toContain('export default class Component extends Widget');
  });

  it('creates input, output and data schemas for new widget data', (): void => {
    const dataItem = createDefaultWidgetData();

    expect(dataItem.inputSchema).toEqual(emptyObjectSchema);
    expect(dataItem.outputSchema).toEqual(emptyObjectSchema);
    expect(dataItem.dataSchema).toEqual(emptyObjectSchema);
    expect(dataItem.execute).toEqual(createDefaultWidgetExecuteMethod());
    expect(dataItem).not.toHaveProperty('viewport');
  });

  it('normalizes contract schemas with output schema', (): void => {
    const legacyContract = {
      outputSchema: {
        type: 'object',
        properties: {
          summary: { type: 'string' }
        },
        required: ['summary']
      }
    } as unknown as Parameters<typeof normalizeWidgetDataContract>[0];
    const contract = normalizeWidgetDataContract(legacyContract);

    expect(contract.inputSchema).toEqual(emptyObjectSchema);
    expect(contract.outputSchema).toEqual({
      type: 'object',
      properties: {
        summary: { type: 'string' }
      },
      required: ['summary']
    });
    expect(contract.dataSchema).toEqual(emptyObjectSchema);
  });

  it('keeps widget schema normalization independent from schema kind names', (): void => {
    const source = readFileSync('src/components/BWidget/utils/widgetData.ts', 'utf-8');
    const legacySchemaKindTypeName = ['Widget', 'Schema', 'Kind'].join('');
    const legacySchemaKindUnion = ["'input'", "'output'", "'data'"].join(' | ');
    const normalizeFunctionName = ['normalizeWidget', 'SchemaObject'].join('');
    const legacyInputNormalizeCall = `${normalizeFunctionName}(candidate.inputSchema, '${'input'}')`;
    const legacyOutputNormalizeCall = `${normalizeFunctionName}(candidate.outputSchema, '${'output'}')`;
    const legacyDataNormalizeCall = `${normalizeFunctionName}(candidate.dataSchema, '${'data'}')`;

    expect(source).not.toContain(legacySchemaKindTypeName);
    expect(source).not.toContain(legacySchemaKindUnion);
    expect(source).not.toContain(legacyInputNormalizeCall);
    expect(source).not.toContain(legacyOutputNormalizeCall);
    expect(source).not.toContain(legacyDataNormalizeCall);
    expect(source).toContain('inputSchema: normalizeWidgetSchemaObject(candidate.inputSchema)');
    expect(source).toContain('outputSchema: normalizeWidgetSchemaObject(candidate.outputSchema)');
    expect(source).toContain('dataSchema: normalizeWidgetSchemaObject(candidate.dataSchema)');
  });

  it('reuses widget schema candidate detection from schema utilities', (): void => {
    const source = readFileSync('src/components/BWidget/utils/widgetData.ts', 'utf-8');

    expect(source).toContain("import { isWidgetSchemaObjectCandidate } from './widgetSchema';");
    expect(source).not.toContain('function isWidgetSchemaObjectCandidate');
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
