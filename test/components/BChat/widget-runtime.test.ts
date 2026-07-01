/**
 * @file widget-runtime.test.ts
 * @description BChat 小组件消息运行态脚本测试。
 */
import type { ChatMessageWidgetPart } from 'types/chat';
import { describe, expect, it } from 'vitest';
import { finishWidgetRuntime, finishWidgetUnmountState, initWidgetMountState } from '@/components/BChat/utils/widgetRuntime';
import type { WidgetData } from '@/components/BWidget/types';
import { createDefaultWidgetData } from '@/components/BWidget/utils/widgetData';

/**
 * 创建测试用 Widget 数据。
 * @param code - 交互脚本代码
 * @returns Widget 数据
 */
function createWidgetData(code: string): WidgetData {
  return {
    ...createDefaultWidgetData(),
    execute: {
      code
    }
  };
}

/**
 * 创建测试用小组件消息片段。
 * @param code - 交互脚本代码
 * @returns 小组件消息片段
 */
function createWidgetPart(code: string): ChatMessageWidgetPart {
  return {
    type: 'widget',
    sessionId: 'widget-session-1',
    widgetId: 'weather',
    status: 'created',
    lifecycle: {},
    value: createWidgetData(code),
    renderContext: {
      input: {
        city: '上海'
      },
      state: {}
    }
  };
}

describe('widgetRuntime', (): void => {
  it('does not execute arbitrary mounted code while applying supported setState calls', async (): Promise<void> => {
    const runtimeGlobal = globalThis as typeof globalThis & { __widgetRuntimeUnsafe?: boolean };
    delete runtimeGlobal.__widgetRuntimeUnsafe;
    const part = createWidgetPart(
      ['defineConfig({', '  mounted() {', '    globalThis.__widgetRuntimeUnsafe = true', "    this.$setState('weather.temperature', 28)", '  }', '})'].join(
        '\n'
      )
    );

    const nextPart = await initWidgetMountState(part);

    expect(runtimeGlobal.__widgetRuntimeUnsafe).toBeUndefined();
    expect(nextPart.renderContext.state).toEqual({
      weather: {
        temperature: 28
      }
    });
  });

  it('runs mounted once and writes state into the returned widget part', async (): Promise<void> => {
    const part = createWidgetPart(
      [
        'defineConfig({',
        '  async mounted() {',
        "    this.$setState('weather.city', this.$input.city)",
        "    this.$setState('weather.temperature', 28)",
        '  }',
        '})'
      ].join('\n')
    );

    const nextPart = await initWidgetMountState(part, {
      now: () => new Date('2026-07-01T00:00:00.000Z')
    });

    expect(part.renderContext.state).toEqual({});
    expect(nextPart).toMatchObject({
      status: 'mounted',
      lifecycle: {
        mountedAt: '2026-07-01T00:00:00.000Z'
      },
      renderContext: {
        input: {
          city: '上海'
        },
        state: {
          weather: {
            city: '上海',
            temperature: 28
          }
        }
      }
    });
  });

  it('keeps completed mounted parts unchanged', async (): Promise<void> => {
    const part: ChatMessageWidgetPart = {
      ...createWidgetPart('defineConfig({ mounted() { this.$setState("weather.temperature", 28) } })'),
      status: 'mounted',
      lifecycle: {
        mountedAt: '2026-07-01T00:00:00.000Z'
      },
      renderContext: {
        input: {},
        state: {
          weather: {
            temperature: 18
          }
        }
      }
    };

    const nextPart = await initWidgetMountState(part);

    expect(nextPart).toEqual(part);
  });

  it('supports constants and object literals in supported setState calls', async (): Promise<void> => {
    const part = createWidgetPart(
      [
        'defineConfig({',
        '  mounted() {',
        '    const city = this.$input.city',
        "    this.$setState('lastQuery', { city, unit: 'celsius', tags: ['weather'] })",
        '  }',
        '})'
      ].join('\n')
    );

    const nextPart = await initWidgetMountState(part);

    expect(nextPart.renderContext.state).toEqual({
      lastQuery: {
        city: '上海',
        unit: 'celsius',
        tags: ['weather']
      }
    });
  });

  it('runs unmounted once and writes final state into the returned widget part', async (): Promise<void> => {
    const part: ChatMessageWidgetPart = {
      ...createWidgetPart(
        [
          'defineConfig({',
          '  unmounted() {',
          "    this.$setState('submitted', { city: this.$input.city, temperature: this.$state.weather.temperature })",
          '  }',
          '})'
        ].join('\n')
      ),
      status: 'mounted',
      lifecycle: {
        mountedAt: '2026-07-01T00:00:00.000Z'
      },
      renderContext: {
        input: {
          city: '上海'
        },
        state: {
          weather: {
            temperature: 28
          }
        }
      }
    };

    const nextPart = await finishWidgetUnmountState(part, {
      now: () => new Date('2026-07-01T00:01:00.000Z')
    });

    expect(part.renderContext.state).toEqual({
      weather: {
        temperature: 28
      }
    });
    expect(nextPart).toMatchObject({
      status: 'finished',
      lifecycle: {
        mountedAt: '2026-07-01T00:00:00.000Z',
        unmountedAt: '2026-07-01T00:01:00.000Z'
      },
      renderContext: {
        state: {
          weather: {
            temperature: 28
          },
          submitted: {
            city: '上海',
            temperature: 28
          }
        }
      }
    });
  });

  it('captures sendMessage calls while finishing unmounted state', (): void => {
    const part: ChatMessageWidgetPart = {
      ...createWidgetPart(
        ['defineConfig({', '  unmounted() {', "    this.$sendMessage({ content: [{ type: 'text', text: '确认下单' }] })", '  }', '})'].join('\n')
      ),
      status: 'mounted',
      lifecycle: {
        mountedAt: '2026-07-01T00:00:00.000Z'
      }
    };

    const result = finishWidgetRuntime(part);

    expect(result.part.status).toBe('finished');
    expect(result.sendMessage).toEqual({
      content: [{ type: 'text', text: '确认下单' }],
      isError: false
    });
  });

  it('keeps widget parts unchanged before mounted state is reached', async (): Promise<void> => {
    const part = createWidgetPart(['defineConfig({', '  unmounted() {', "    this.$setState('submitted', true)", '  }', '})'].join('\n'));

    const nextPart = await finishWidgetUnmountState(part);

    expect(nextPart).toBe(part);
    expect(nextPart.status).toBe('created');
    expect(nextPart.renderContext.state).toEqual({});
  });
});
