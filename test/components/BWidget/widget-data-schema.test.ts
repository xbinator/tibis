/**
 * @file widget-data-schema.test.ts
 * @description 验证 Widget 数据 schema 可从JS 脚本中的 data 声明和 this 赋值构建。
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
  it('builds nested data schema from direct this object assignments', (): void => {
    const code = `
      export default class Weather extends Widget {
        async onMounted() {
          this.weather = {
            temperature: 28,
            condition: '晴',
            active: true
          }
        }
      }
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

  it('ignores nested this data writes when the root field is not initialized', (): void => {
    const code = `
      export default class Weather extends Widget {
        async onMounted() {
          this.weather.temperature = 28
        }
      }
    `;

    expect(buildWidgetDataSchema(code, inputSchema)).toEqual({
      type: 'object',
      properties: {},
      required: []
    });
  });

  it('builds nested data schema after a root this assignment initializes the field', (): void => {
    const code = `
      export default class Weather extends Widget {
        async onMounted() {
          this.weather = {}
          this.weather.temperature = this.$input.weather.temperature
        }
      }
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

  it('builds data schema from Widget class field declarations', (): void => {
    const code = `
      export default class Weather extends Widget {
        weather = {
          temperature: 18,
          condition: '晴'
        }

        ready = true
      }
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

  it('ignores TypeScript private and protected class fields when building data schema', (): void => {
    const code = `
      export default class Weather extends Widget {
        private secret = 'token'
        protected cache = {
          ready: true
        }
        weather = {
          temperature: 18
        }
      }
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

  it('supports direct this dot paths and input schema type reuse', (): void => {
    const code = `
      export default class Weather extends Widget {
        lastQuery = {
          city: ''
        }

        weather = {
          temperature: 0
        }

        async onMounted() {
          this.lastQuery.city = this.$input.city
          this.weather.temperature = this.$input.weather.temperature
        }
      }
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

  it('supports Widget this context assignments and input schema type reuse', (): void => {
    const code = `
      export default class Weather extends Widget {
        lastQuery = {
          city: ''
        }

        weather = {
          temperature: 0,
          condition: ''
        }

        async onMounted() {
          this.lastQuery.city = this.$input.city
          this.weather.temperature = this.$input.weather.temperature
        }

        async refresh() {
          this.weather.condition = '晴'
          this.$sendMessage('刷新天气')
        }
      }
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

  it('ignores assignments that are not owned by the widget context', (): void => {
    const code = `
      export default class Weather extends Widget {
        async onMounted() {
          const store = {
            save() {
              this.debug = { enabled: true }
            }
          }
          store.save()
          this.weather = { temperature: 28 }
        }
      }
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
      export default class Weather extends Widget {
        async onMounted() {
          const store = {
            save() {
              this.debug = { enabled: true }
            }
          }
          store.save()
          this.weather = { temperature: 28 }
        }
      }
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
      export default class Weather extends Widget {
        async onMounted() {
          const city = this.$input.city
          {
            const city = this.$input.weather.temperature
            this.shadowed = { city }
          }
          this.lastQuery = { city }
        }
      }
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

  it('returns an empty data schema when code has no static this data path', (): void => {
    const code = `
      export default class Weather extends Widget {
        async onMounted() {
          const path = 'weather.temperature'
          this[path] = 28
        }
      }
    `;

    expect(buildWidgetDataSchema(code, inputSchema)).toEqual({
      type: 'object',
      properties: {},
      required: []
    });
  });

  it('preserves array type from data initialization when runtime assignment cannot be inferred', (): void => {
    const code = `
      export default class Weather extends Widget {
        movieList = []

        async onMounted() {
          const res = await this.$http.get('https://example.com/api')
          this.movieList = res.data.movieList
        }
      }
    `;

    expect(buildWidgetDataSchema(code, inputSchema)).toEqual({
      type: 'object',
      properties: {
        movieList: {
          type: 'array'
        }
      },
      required: []
    });
  });
});
