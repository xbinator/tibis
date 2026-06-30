/**
 * @file widget-state-schema.test.ts
 * @description 验证 Widget 状态 schema 可从执行方法代码中的 setState 调用构建。
 */
import { describe, expect, it } from 'vitest';
import type { WidgetSchemaObject } from '@/components/BWidget/types';
import { buildWidgetStateSchema } from '@/components/BWidget/utils/widgetStateSchema';

/** 测试用 input schema。 */
const inputSchema: WidgetSchemaObject = {
  type: 'object',
  properties: {
    city: {
      type: 'string',
      description: '城市名称'
    },
    weather: {
      type: 'object',
      description: '天气输入',
      properties: {
        temperature: {
          type: 'number',
          description: '输入温度'
        }
      }
    }
  },
  required: ['city']
};

describe('buildWidgetStateSchema', (): void => {
  it('builds nested state schema from setState object literals', (): void => {
    const code = `
      export async function execute(ctx: WidgetSkillContext): Promise<ExecutionResult> {
        const { setState } = ctx
        setState('weather', {
          temperature: 28,
          condition: '晴',
          active: true
        })
        return ctx.result.success()
      }
    `;

    expect(buildWidgetStateSchema(code, inputSchema)).toEqual({
      type: 'object',
      properties: {
        weather: {
          type: 'object',
          properties: {
            temperature: {
              type: 'number'
            },
            condition: {
              type: 'string'
            },
            active: {
              type: 'boolean'
            }
          },
          required: []
        }
      },
      required: []
    });
  });

  it('supports ctx.setState dot paths and input schema type reuse', (): void => {
    const code = `
      export async function execute(ctx: WidgetSkillContext): Promise<ExecutionResult> {
        ctx.setState('lastQuery.city', ctx.input.city)
        ctx.setState('weather.temperature', ctx.input.weather.temperature)
        return ctx.result.success()
      }
    `;

    expect(buildWidgetStateSchema(code, inputSchema)).toEqual({
      type: 'object',
      properties: {
        lastQuery: {
          type: 'object',
          properties: {
            city: {
              type: 'string'
            }
          },
          required: []
        },
        weather: {
          type: 'object',
          properties: {
            temperature: {
              type: 'number'
            }
          },
          required: []
        }
      },
      required: []
    });
  });

  it('ignores setState methods that are not owned by the widget context', (): void => {
    const code = `
      export async function execute(ctx: WidgetSkillContext): Promise<ExecutionResult> {
        const store = {
          setState(path: string, value: unknown) {
            return { path, value }
          }
        }
        store.setState('debug.enabled', true)
        ctx.setState('weather.temperature', 28)
        return ctx.result.success()
      }
    `;

    expect(buildWidgetStateSchema(code, inputSchema)).toEqual({
      type: 'object',
      properties: {
        weather: {
          type: 'object',
          properties: {
            temperature: {
              type: 'number'
            }
          },
          required: []
        }
      },
      required: []
    });
  });

  it('keeps input aliases scoped when a block declares the same variable name', (): void => {
    const code = `
      export async function execute(ctx: WidgetSkillContext): Promise<ExecutionResult> {
        const city = ctx.input.city
        {
          const city = ctx.input.weather.temperature
          setState('shadowed', { city })
        }
        setState('lastQuery', { city })
        return ctx.result.success()
      }
    `;

    expect(buildWidgetStateSchema(code, inputSchema)).toEqual({
      type: 'object',
      properties: {
        shadowed: {
          type: 'object',
          properties: {
            city: {
              type: 'number'
            }
          },
          required: []
        },
        lastQuery: {
          type: 'object',
          properties: {
            city: {
              type: 'string'
            }
          },
          required: []
        }
      },
      required: []
    });
  });

  it('returns an empty state schema when code has no static setState path', (): void => {
    const code = `
      export async function execute(ctx: WidgetSkillContext): Promise<ExecutionResult> {
        const path = 'weather.temperature'
        ctx.setState(path, 28)
        return ctx.result.success()
      }
    `;

    expect(buildWidgetStateSchema(code, inputSchema)).toEqual({
      type: 'object',
      properties: {},
      required: []
    });
  });
});
