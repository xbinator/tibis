/**
 * @file widget-state-schema.test.ts
 * @description 验证 Widget 状态 schema 可从交互脚本中的 this.$setState 调用构建。
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
      defineConfig({
        async mounted() {
          this.$setState('weather', {
            temperature: 28,
            condition: '晴',
            active: true
          })
        }
      })
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

  it('supports this.$setState dot paths and input schema type reuse', (): void => {
    const code = `
      defineConfig({
        async mounted() {
          this.$setState('lastQuery.city', this.$input.city)
          this.$setState('weather.temperature', this.$input.weather.temperature)
        }
      })
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

  it('supports defineConfig this context setState calls and input schema type reuse', (): void => {
    const code = `
      defineConfig({
        async mounted() {
          this.$setState('lastQuery.city', this.$input.city)
          this.$setState('weather.temperature', this.$input.weather.temperature)
        },
        methods: {
          async refresh() {
            this.$setState('weather.condition', '晴')
            this.$sendMessage('刷新天气')
          }
        }
      })
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

  it('ignores setState methods that are not owned by the widget context', (): void => {
    const code = `
      defineConfig({
        async mounted() {
          const store = {
            $setState(path: string, value: unknown) {
              return { path, value }
            }
          }
          store.$setState('debug.enabled', true)
          this.$setState('weather.temperature', 28)
        }
      })
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

  it('ignores nested object methods that use their own this context', (): void => {
    const code = `
      defineConfig({
        async mounted() {
          const store = {
            save() {
              this.$setState('debug.enabled', true)
            }
          }
          store.save()
          this.$setState('weather.temperature', 28)
        }
      })
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
      defineConfig({
        async mounted() {
          const city = this.$input.city
          {
            const city = this.$input.weather.temperature
            this.$setState('shadowed', { city })
          }
          this.$setState('lastQuery', { city })
        }
      })
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
      defineConfig({
        async mounted() {
          const path = 'weather.temperature'
          this.$setState(path, 28)
        }
      })
    `;

    expect(buildWidgetStateSchema(code, inputSchema)).toEqual({
      type: 'object',
      properties: {},
      required: []
    });
  });
});
