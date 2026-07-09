/**
 * @file widget-schema.test.ts
 * @description 验证 BWidget schema 形状校验工具。
 */
import { describe, expect, it } from 'vitest';
import { isWidgetSchemaObject } from '@/components/BWidget/utils/widgetSchema';

describe('widgetSchema', (): void => {
  it('accepts complete object schema without changing it', (): void => {
    const schema = {
      type: 'object',
      description: '查询参数',
      properties: {
        query: {
          type: 'string',
          description: '查询词'
        }
      },
      required: ['query']
    };

    expect(isWidgetSchemaObject(schema)).toBe(true);
    expect(schema).toEqual({
      type: 'object',
      description: '查询参数',
      properties: {
        query: {
          type: 'string',
          description: '查询词'
        }
      },
      required: ['query']
    });
  });

  it('rejects object schema without properties', (): void => {
    expect(isWidgetSchemaObject({ type: 'object' })).toBe(false);
  });

  it('rejects malformed required and nested properties', (): void => {
    expect(
      isWidgetSchemaObject({
        type: 'object',
        properties: {
          result: {
            type: 'object',
            properties: null
          }
        },
        required: ['result', 1]
      })
    ).toBe(false);
  });
});
