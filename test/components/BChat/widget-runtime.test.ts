/**
 * @file widget-runtime.test.ts
 * @description BChat 小组件消息运行态脚本测试。
 */
import type { ChatMessageWidgetPart } from 'types/chat';
import type { WidgetData, WidgetHttpClient } from 'types/widget';
import { describe, expect, it } from 'vitest';
import {
  createWidgetRuntimeInstance as createWidgetRuntimeInstanceBase,
  finishWidgetRuntime as finishWidgetRuntimeBase,
  finishWidgetUnmountState as finishWidgetUnmountStateBase,
  initWidgetMountState as initWidgetMountStateBase
} from '@/components/BChat/utils/widgetRuntime';
import { createDefaultWidgetData } from '@/components/BWidget/utils/widgetData';
import { runSandboxCode } from '@/utils/sandbox';

/** 测试环境没有浏览器 Worker，显式允许走本地 fallback。 */
const TEST_WIDGET_RUN_OPTIONS = {
  useWorker: false
} satisfies NonNullable<Parameters<typeof initWidgetMountStateBase>[1]>;

/**
 * 初始化测试小组件。
 * @param part - 小组件消息片段
 * @param options - 运行选项
 * @returns 初始化后的消息片段
 */
function initWidgetMountState(
  part: ChatMessageWidgetPart,
  options: NonNullable<Parameters<typeof initWidgetMountStateBase>[1]> = {}
): ReturnType<typeof initWidgetMountStateBase> {
  return initWidgetMountStateBase(part, { ...TEST_WIDGET_RUN_OPTIONS, ...options });
}

/**
 * 完成测试小组件运行态。
 * @param part - 小组件消息片段
 * @param options - 运行选项
 * @returns 小组件完成结果
 */
function finishWidgetRuntime(
  part: ChatMessageWidgetPart,
  options: NonNullable<Parameters<typeof finishWidgetRuntimeBase>[1]> = {}
): ReturnType<typeof finishWidgetRuntimeBase> {
  return finishWidgetRuntimeBase(part, { ...TEST_WIDGET_RUN_OPTIONS, ...options });
}

/**
 * 完成测试小组件卸载态。
 * @param part - 小组件消息片段
 * @param options - 运行选项
 * @returns 小组件消息片段
 */
function finishWidgetUnmountState(
  part: ChatMessageWidgetPart,
  options: NonNullable<Parameters<typeof finishWidgetUnmountStateBase>[1]> = {}
): ReturnType<typeof finishWidgetUnmountStateBase> {
  return finishWidgetUnmountStateBase(part, { ...TEST_WIDGET_RUN_OPTIONS, ...options });
}

/**
 * 创建测试小组件运行态实例。
 * @param part - 小组件消息片段
 * @param options - 运行选项
 * @returns 小组件运行态实例
 */
function createWidgetRuntimeInstance(
  part: ChatMessageWidgetPart,
  options: NonNullable<Parameters<typeof createWidgetRuntimeInstanceBase>[1]> = {}
): ReturnType<typeof createWidgetRuntimeInstanceBase> {
  return createWidgetRuntimeInstanceBase(part, { ...TEST_WIDGET_RUN_OPTIONS, ...options });
}

/**
 * 创建测试用 Widget 数据。
 * @param code - JS 脚本代码
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
 * @param code - JS 脚本代码
 * @returns 小组件消息片段
 */
function createWidgetPart(code: string): ChatMessageWidgetPart {
  return {
    id: 'widget-part-weather',
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
  it('does not use local sandbox fallback unless explicitly requested', async (): Promise<void> => {
    await expect(runSandboxCode({ code: 'return 1' })).rejects.toThrow('当前环境不支持 Worker');
  });

  it('does not execute arbitrary mounted code while applying supported setState calls', async (): Promise<void> => {
    const runtimeGlobal = globalThis as typeof globalThis & { __widgetRuntimeUnsafe?: boolean };
    delete runtimeGlobal.__widgetRuntimeUnsafe;
    const part = createWidgetPart(
      ['Widget({', '  mounted() {', '    globalThis.__widgetRuntimeUnsafe = true', "    this.$setState('weather.temperature', 28)", '  }', '})'].join('\n')
    );

    const nextPart = await initWidgetMountState(part);

    expect(runtimeGlobal.__widgetRuntimeUnsafe).toBeUndefined();
    expect(nextPart.renderContext.state).toEqual({
      weather: {
        temperature: 28
      }
    });
  });

  it('ignores legacy defineConfig entry scripts after switching to Widget', async (): Promise<void> => {
    const part = createWidgetPart("defineConfig({ mounted() { this.$setState('weather.temperature', 28) } })");

    const nextPart = await initWidgetMountState(part);

    expect(nextPart.renderContext.state).toEqual({});
  });

  it('blocks disallowed syntax inside widget scripts before execution', async (): Promise<void> => {
    const part = createWidgetPart('Widget({ mounted() { eval(\'this.$setState("unsafe", true)\') } })');

    const nextPart = await initWidgetMountState(part);

    expect(nextPart.status).toBe('failure');
    expect(nextPart.renderContext.state).toEqual({});
  });

  it('runs mounted once and writes state into the returned widget part', async (): Promise<void> => {
    const part = createWidgetPart(
      [
        'Widget({',
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

  it('does not expose adapter internals to widget lifecycle code', async (): Promise<void> => {
    const part = createWidgetPart(
      [
        'Widget({',
        '  mounted() {',
        '    try {',
        '      __widgetState.leaked = true',
        '    } catch (error) {',
        "      this.$setState('internalAccessBlocked', true)",
        '    }',
        "    this.$setState('weather.temperature', 28)",
        '  }',
        '})'
      ].join('\n')
    );

    const nextPart = await initWidgetMountState(part);

    expect(nextPart.renderContext.state).toEqual({
      internalAccessBlocked: true,
      weather: {
        temperature: 28
      }
    });
  });

  it('keeps completed mounted parts unchanged', async (): Promise<void> => {
    const part: ChatMessageWidgetPart = {
      ...createWidgetPart('Widget({ mounted() { this.$setState("weather.temperature", 28) } })'),
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
        'Widget({',
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

  it('runs normal JavaScript control flow inside mounted hooks', async (): Promise<void> => {
    const part = createWidgetPart(
      [
        'Widget({',
        '  mounted() {',
        "    const city = this.$input.city || '上海'",
        '    const temperatures = [26, 28, 30]',
        '    const temperature = temperatures.find((item) => item > 27)',
        '    if (temperature) {',
        "      this.$setState('weather', { city, label: city + ' ' + temperature + '°C', temperature })",
        '    }',
        '  }',
        '})'
      ].join('\n')
    );

    const nextPart = await initWidgetMountState(part);

    expect(nextPart.renderContext.state).toEqual({
      weather: {
        city: '上海',
        label: '上海 28°C',
        temperature: 28
      }
    });
  });

  it('runs unmounted once and writes final state into the returned widget part', async (): Promise<void> => {
    const part: ChatMessageWidgetPart = {
      ...createWidgetPart(
        [
          'Widget({',
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

  it('captures sendMessage calls with script text parts while finishing unmounted state', async (): Promise<void> => {
    const part: ChatMessageWidgetPart = {
      ...createWidgetPart(['Widget({', '  unmounted() {', "    this.$sendMessage({ content: [{ type: 'text', text: '确认下单' }] })", '  }', '})'].join('\n')),
      status: 'mounted',
      lifecycle: {
        mountedAt: '2026-07-01T00:00:00.000Z'
      }
    };

    const result = await finishWidgetRuntime(part);

    expect(result.part.status).toBe('finished');
    expect(result.sendMessage).toEqual({
      content: [expect.objectContaining({ type: 'text', text: '确认下单' })],
      isError: false
    });
  });

  it('keeps widget parts unchanged before mounted state is reached', async (): Promise<void> => {
    const part = createWidgetPart(['Widget({', '  unmounted() {', "    this.$setState('submitted', true)", '  }', '})'].join('\n'));

    const nextPart = await finishWidgetUnmountState(part);

    expect(nextPart).toBe(part);
    expect(nextPart.status).toBe('created');
    expect(nextPart.renderContext.state).toEqual({});
  });

  it('does not run disabled execute scripts', async (): Promise<void> => {
    const code = "Widget({ mounted() { this.$setState('weather.temperature', 28) } })";
    const part: ChatMessageWidgetPart = {
      ...createWidgetPart(code),
      value: {
        ...createWidgetData(code),
        execute: {
          enabled: false,
          code
        }
      }
    };

    const nextPart = await initWidgetMountState(part);

    expect(nextPart).toBe(part);
    expect(nextPart.renderContext.state).toEqual({});
  });

  it('runs interaction code and finishes when the code sends a message', async (): Promise<void> => {
    const part: ChatMessageWidgetPart = {
      ...createWidgetPart('Widget({})'),
      status: 'mounted',
      lifecycle: {
        mountedAt: '2026-07-01T00:00:00.000Z'
      }
    };

    const result = await createWidgetRuntimeInstance(part, { now: () => new Date('2026-07-01T00:02:00.000Z') }).runInteraction(
      ["this.$setState('confirmed', true)", "this.$sendMessage('确认下单')"].join('\n')
    );

    expect(result.part.status).toBe('finished');
    expect(result.part.lifecycle.unmountedAt).toBe('2026-07-01T00:02:00.000Z');
    expect(result.part.renderContext.state).toEqual({ confirmed: true });
    expect(result.sendMessage).toEqual({ content: '确认下单', isError: false });
  });

  it('runs unmounted cleanup when an interaction finishes with a message', async (): Promise<void> => {
    const part: ChatMessageWidgetPart = {
      ...createWidgetPart(
        ['Widget({', '  unmounted() {', "    this.$setState('cleanedUp', true)", "    this.$sendMessage('清理消息')", '  }', '})'].join('\n')
      ),
      status: 'mounted',
      lifecycle: {
        mountedAt: '2026-07-01T00:00:00.000Z'
      }
    };

    const result = await createWidgetRuntimeInstance(part, { now: () => new Date('2026-07-01T00:02:00.000Z') }).runInteraction(
      ["this.$setState('confirmed', true)", "this.$sendMessage('确认下单')"].join('\n')
    );

    expect(result.part.status).toBe('finished');
    expect(result.part.renderContext.state).toEqual({
      confirmed: true,
      cleanedUp: true
    });
    expect(result.sendMessage).toEqual({ content: '确认下单', isError: false });
  });

  it('runs user helper calls from interaction code without exposing them as runtime API', async (): Promise<void> => {
    const part: ChatMessageWidgetPart = {
      ...createWidgetPart(
        [
          'Widget({',
          '  methods: {',
          '    submitOrder() {',
          "      this.$setState('confirmed', true)",
          "      this.$sendMessage('确认下单')",
          '    }',
          '  }',
          '})'
        ].join('\n')
      ),
      status: 'mounted',
      lifecycle: {
        mountedAt: '2026-07-01T00:00:00.000Z'
      }
    };

    const result = await createWidgetRuntimeInstance(part, { now: () => new Date('2026-07-01T00:02:00.000Z') }).runInteraction('submitOrder()');

    expect(result.part.status).toBe('finished');
    expect(result.part.renderContext.state).toEqual({ confirmed: true });
    expect(result.sendMessage).toEqual({ content: '确认下单', isError: false });
  });

  it('keeps widget mounted when a method throw is handled by interaction code', async (): Promise<void> => {
    const part: ChatMessageWidgetPart = {
      ...createWidgetPart(['Widget({', '  methods: {', '    explode() {', "      throw new Error('handled by interaction')", '    }', '  }', '})'].join('\n')),
      status: 'mounted',
      lifecycle: {
        mountedAt: '2026-07-01T00:00:00.000Z'
      }
    };

    const result = await createWidgetRuntimeInstance(part).runInteraction(
      ['try {', '  explode()', '} catch (error) {', "  this.$setState('methodErrorHandled', true)", '}'].join('\n')
    );

    expect(result.part.status).toBe('mounted');
    expect(result.part.renderContext.state).toEqual({
      methodErrorHandled: true
    });
  });

  it('passes evaluated interaction arguments into user helper parameters', async (): Promise<void> => {
    const part: ChatMessageWidgetPart = {
      ...createWidgetPart(
        ['Widget({', '  methods: {', '    selectCoffee(id, city) {', "      this.$setState('selection', { id, city })", '    }', '  }', '})'].join('\n')
      ),
      status: 'mounted',
      lifecycle: {
        mountedAt: '2026-07-01T00:00:00.000Z'
      }
    };

    const result = await createWidgetRuntimeInstance(part).runInteraction("selectCoffee('latte', this.$input.city)");

    expect(result.part.status).toBe('mounted');
    expect(result.part.renderContext.state).toEqual({
      selection: {
        id: 'latte',
        city: '上海'
      }
    });
  });

  it('marks the widget as failed when interaction code throws', async (): Promise<void> => {
    const part: ChatMessageWidgetPart = {
      ...createWidgetPart('Widget({})'),
      status: 'mounted',
      lifecycle: {
        mountedAt: '2026-07-01T00:00:00.000Z'
      }
    };

    const result = await createWidgetRuntimeInstance(part).runInteraction('unknownAction()');

    expect(result.part.status).toBe('failure');
    expect(part.status).toBe('mounted');
  });

  it('keeps the widget mounted when interaction code updates state without sending a message', async (): Promise<void> => {
    const part: ChatMessageWidgetPart = {
      ...createWidgetPart('Widget({})'),
      status: 'mounted',
      lifecycle: {
        mountedAt: '2026-07-01T00:00:00.000Z'
      }
    };

    const result = await createWidgetRuntimeInstance(part).runInteraction("this.$setState('selectedCoffee', 'latte')");

    expect(result.part.status).toBe('mounted');
    expect(result.part.renderContext.state).toEqual({
      selectedCoffee: 'latte'
    });
    expect(result.sendMessage).toBeUndefined();
  });

  it('supports managed http calls and stores response data', async (): Promise<void> => {
    const part = createWidgetPart(
      [
        'Widget({',
        '  async mounted() {',
        "    const weather = await this.$http.get('https://api.example.com/weather', { query: { city: this.$input.city } })",
        "    this.$setState('weather.temperature', weather.data.temperature)",
        '  }',
        '})'
      ].join('\n')
    );
    const http: WidgetHttpClient = {
      get: async () => ({ status: 200, ok: true, url: 'https://api.example.com/weather', headers: {}, data: { temperature: 28 } }),
      post: async () => ({ status: 405, ok: false, url: '', headers: {}, data: '' }),
      put: async () => ({ status: 405, ok: false, url: '', headers: {}, data: '' }),
      patch: async () => ({ status: 405, ok: false, url: '', headers: {}, data: '' }),
      delete: async () => ({ status: 405, ok: false, url: '', headers: {}, data: '' })
    };

    const nextPart = await initWidgetMountState(part, { http });

    expect(nextPart.renderContext.state).toEqual({
      weather: {
        temperature: 28
      }
    });
  });

  it('passes undefined body through to the hosted request layer for non-GET methods', async (): Promise<void> => {
    const part = createWidgetPart(
      [
        'Widget({',
        '  async mounted() {',
        "    await this.$http.post('https://api.example.com/orders')",
        "    this.$setState('submitted', true)",
        '  }',
        '})'
      ].join('\n')
    );
    const postRequests: Parameters<WidgetHttpClient['post']>[1][] = [];
    const http: WidgetHttpClient = {
      get: async () => ({ status: 405, ok: false, url: '', headers: {}, data: '' }),
      post: async (_url, request) => {
        postRequests.push(request);
        return { status: 200, ok: true, url: 'https://api.example.com/orders', headers: {}, data: '' };
      },
      put: async () => ({ status: 405, ok: false, url: '', headers: {}, data: '' }),
      patch: async () => ({ status: 405, ok: false, url: '', headers: {}, data: '' }),
      delete: async () => ({ status: 405, ok: false, url: '', headers: {}, data: '' })
    };

    const nextPart = await initWidgetMountState(part, { http });

    expect(nextPart.status).toBe('mounted');
    expect(postRequests).toHaveLength(1);
    expect(postRequests[0]).toHaveProperty('body', undefined);
  });

  it('waits for managed http calls without adding a script-level timeout', async (): Promise<void> => {
    const code = [
      'Widget({',
      '  async mounted() {',
      "    await this.$http.get('https://api.example.com/slow')",
      "    this.$setState('weather.temperature', 28)",
      '  }',
      '})'
    ].join('\n');
    const part: ChatMessageWidgetPart = {
      ...createWidgetPart(code),
      value: {
        ...createWidgetData(code),
        execute: {
          code
        }
      }
    };
    const http: WidgetHttpClient = {
      get: async (): Promise<{ status: number; ok: true; url: string; headers: Record<string, string>; data: { temperature: number } }> =>
        new Promise((resolve): void => {
          setTimeout((): void => {
            resolve({ status: 200, ok: true, url: 'https://api.example.com/slow', headers: {}, data: { temperature: 28 } });
          }, 20);
        }),
      post: async () => ({ status: 405, ok: false, url: '', headers: {}, data: '' }),
      put: async () => ({ status: 405, ok: false, url: '', headers: {}, data: '' }),
      patch: async () => ({ status: 405, ok: false, url: '', headers: {}, data: '' }),
      delete: async () => ({ status: 405, ok: false, url: '', headers: {}, data: '' })
    };

    const nextPart = await initWidgetMountState(part, { http });

    expect(nextPart.status).toBe('mounted');
    expect(nextPart.renderContext.state).toEqual({
      weather: {
        temperature: 28
      }
    });
  });
});
