/**
 * @file widget-data-schema.test.ts
 * @description 验证 Widget 数据 schema 可从JS 脚本中的 this.$setData 调用构建。
 */
import { describe, expect, it } from 'vitest';
import type { WidgetSchemaObject } from '@/components/BWidget/types';
import { buildWidgetDataSchema } from '@/components/BWidget/utils/widgetDataSchema';

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

describe('buildWidgetDataSchema', (): void => {
  it('builds nested data schema from setData object literals', (): void => {
    const code = `
      Widget({
        async mounted() {
          this.$setData('weather', {
            temperature: 28,
            condition: '晴',
            active: true
          })
        }
      })
    `;

    expect(buildWidgetDataSchema(code, inputSchema)).toEqual({
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

  it('builds data schema from Widget data declarations', (): void => {
    const code = `
      Widget({
        data: {
          weather: {
            temperature: 18,
            condition: '晴'
          },
          ready: true
        }
      })
    `;

    expect(buildWidgetDataSchema(code, inputSchema)).toEqual({
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
            }
          },
          required: []
        },
        ready: {
          type: 'boolean'
        }
      },
      required: []
    });
  });

  it('returns an empty data schema for legacy defineConfig scripts', (): void => {
    const code = `
      defineConfig({
        async mounted() {
          this.$setData('weather.temperature', 28)
        }
      })
    `;

    expect(buildWidgetDataSchema(code, inputSchema)).toEqual({
      type: 'object',
      properties: {},
      required: []
    });
  });

  it('supports this.$setData dot paths and input schema type reuse', (): void => {
    const code = `
      Widget({
        async mounted() {
          this.$setData('lastQuery.city', this.$input.city)
          this.$setData('weather.temperature', this.$input.weather.temperature)
        }
      })
    `;

    expect(buildWidgetDataSchema(code, inputSchema)).toEqual({
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

  it('supports Widget this context setData calls and input schema type reuse', (): void => {
    const code = `
      Widget({
        async mounted() {
          this.$setData('lastQuery.city', this.$input.city)
          this.$setData('weather.temperature', this.$input.weather.temperature)
        },
        methods: {
          async refresh() {
            this.$setData('weather.condition', '晴')
            this.$sendMessage('刷新天气')
          }
        }
      })
    `;

    expect(buildWidgetDataSchema(code, inputSchema)).toEqual({
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
            },
            condition: {
              type: 'string'
            }
          },
          required: []
        }
      },
      required: []
    });
  });

  it('ignores setData methods that are not owned by the widget context', (): void => {
    const code = `
      Widget({
        async mounted() {
          const store = {
            $setData(path: string, value: unknown) {
              return { path, value }
            }
          }
          store.$setData('debug.enabled', true)
          this.$setData('weather.temperature', 28)
        }
      })
    `;

    expect(buildWidgetDataSchema(code, inputSchema)).toEqual({
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

  it('ignores nested object methods that use their own this context', (): void => {
    const code = `
      Widget({
        async mounted() {
          const store = {
            save() {
              this.$setData('debug.enabled', true)
            }
          }
          store.save()
          this.$setData('weather.temperature', 28)
        }
      })
    `;

    expect(buildWidgetDataSchema(code, inputSchema)).toEqual({
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
      Widget({
        async mounted() {
          const city = this.$input.city
          {
            const city = this.$input.weather.temperature
            this.$setData('shadowed', { city })
          }
          this.$setData('lastQuery', { city })
        }
      })
    `;

    expect(buildWidgetDataSchema(code, inputSchema)).toEqual({
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

  it('returns an empty data schema when code has no static setData path', (): void => {
    const code = `
      Widget({
        async mounted() {
          const path = 'weather.temperature'
          this.$setData(path, 28)
        }
      })
    `;

    expect(buildWidgetDataSchema(code, inputSchema)).toEqual({
      type: 'object',
      properties: {},
      required: []
    });
  });
});
