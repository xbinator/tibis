/**
 * @file widget-runtime-logger.test.ts
 * @description BWidget 运行态 $logger 桥接与日志参数序列化测试。
 */
import { describe, expect, it, vi } from 'vitest';
import { createDefaultWidgetData } from '@/components/BWidget/utils/widgetData';
import { createWidgetRuntimeSession, executeWidgetRuntime, initWidgetMountState, type WidgetRuntimeState } from '@/components/BWidget/utils/widgetRuntime';
import { formatWidgetLogArgs } from '@/components/BWidget/utils/widgetRuntime/logger';
import type { WidgetRuntimePatch } from '@/components/BWidget/utils/widgetRuntime/patch';

/**
 * 创建用于 $logger 测试的运行态状态。
 * @param code - Widget 脚本源码
 * @param data - 初始 data
 * @returns 运行态状态
 */
function createLoggerRuntimeState(code: string, data: Record<string, unknown> = {}): WidgetRuntimeState {
  return {
    value: {
      ...createDefaultWidgetData(),
      execute: { enabled: true, code }
    },
    renderContext: {
      input: {},
      output: undefined,
      data
    }
  };
}

/**
 * 创建测试用 Widget class 脚本。
 * @param members - class 成员源码
 * @returns Widget class 脚本源码
 */
function createLoggerWidgetCode(members: string[]): string {
  return ['export default class LoggerWidget extends Widget {', ...members, '}'].join('\n');
}

/** 小组件 console 调用记录。 */
interface WidgetConsoleCall {
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  args: unknown[];
}

/**
 * 创建捕获 patch、$logger 与 console 回调的 options。
 * @param patches - patch 收集数组
 * @param loggerCalls - $logger 调用收集数组
 * @param consoleCalls - console 调用收集数组
 * @returns lifecycle options
 */
function createCaptureOptions(
  patches: WidgetRuntimePatch[],
  loggerCalls: Array<{ level: 'info' | 'warn' | 'error'; args: unknown[] }>,
  consoleCalls: WidgetConsoleCall[] = []
): {
  useWorker: false;
  onPatch: (incomingPatches: WidgetRuntimePatch[]) => void;
  onLogger: (level: 'info' | 'warn' | 'error', args: unknown[]) => void;
  onConsole: (level: 'log' | 'info' | 'warn' | 'error' | 'debug', args: unknown[]) => void;
} {
  return {
    useWorker: false,
    onPatch: (incomingPatches: WidgetRuntimePatch[]): void => {
      patches.push(...incomingPatches);
    },
    onLogger: (level: 'info' | 'warn' | 'error', args: unknown[]): void => {
      loggerCalls.push({ level, args });
    },
    onConsole: (level: 'log' | 'info' | 'warn' | 'error' | 'debug', args: unknown[]): void => {
      consoleCalls.push({ level, args });
    }
  };
}

describe('widgetRuntime/logger formatWidgetLogArgs', (): void => {
  it('formats string and number and boolean primitives', (): void => {
    expect(formatWidgetLogArgs(['hello'])).toBe('hello');
    expect(formatWidgetLogArgs([42])).toBe('42');
    expect(formatWidgetLogArgs([true])).toBe('true');
    expect(formatWidgetLogArgs([false])).toBe('false');
  });

  it('formats null and undefined', (): void => {
    expect(formatWidgetLogArgs([null])).toBe('null');
    expect(formatWidgetLogArgs([undefined])).toBe('undefined');
  });

  it('serializes plain objects via JSON.stringify', (): void => {
    expect(formatWidgetLogArgs([{ count: 1 }])).toBe('{"count":1}');
  });

  it('serializes arrays via JSON.stringify', (): void => {
    expect(formatWidgetLogArgs([[1, 2, 3]])).toBe('[1,2,3]');
  });

  it('formats Error as name: message', (): void => {
    expect(formatWidgetLogArgs([new Error('boom')])).toBe('Error: boom');
  });

  it('formats Error subclass with custom name', (): void => {
    class WidgetError extends Error {
      public constructor(message: string) {
        super(message);
        this.name = 'WidgetError';
      }
    }
    expect(formatWidgetLogArgs([new WidgetError('oops')])).toBe('WidgetError: oops');
  });

  it('falls back to String for circular references', (): void => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    // 循环引用 JSON.stringify 抛错，fallback 到 String([object Object])
    expect(formatWidgetLogArgs([circular])).toBe('[object Object]');
  });

  it('falls back to String for BigInt values', (): void => {
    // BigInt 在 JSON.stringify 中会抛 TypeError
    expect(formatWidgetLogArgs([42n])).toBe('42');
  });

  it('joins multiple args with single space', (): void => {
    expect(formatWidgetLogArgs(['a', 1, { x: 1 }])).toBe('a 1 {"x":1}');
  });

  it('returns empty string for empty args', (): void => {
    expect(formatWidgetLogArgs([])).toBe('');
  });
});

describe('widgetRuntime $logger bridge', (): void => {
  it('invokes onLogger with info level and args', async (): Promise<void> => {
    const loggerCalls: Array<{ level: 'info' | 'warn' | 'error'; args: unknown[] }> = [];
    const state = createLoggerRuntimeState(createLoggerWidgetCode(['  async onMounted() {', "    await this.$logger.info('hello', { count: 1 })", '  }']));

    await initWidgetMountState(state, createCaptureOptions([], loggerCalls));

    expect(loggerCalls).toEqual([{ level: 'info', args: ['hello', { count: 1 }] }]);
  });

  it('forwards warn and error levels', async (): Promise<void> => {
    const loggerCalls: Array<{ level: 'info' | 'warn' | 'error'; args: unknown[] }> = [];
    const state = createLoggerRuntimeState(
      createLoggerWidgetCode(['  async onMounted() {', "    await this.$logger.warn('warning')", "    await this.$logger.error('error')", '  }'])
    );

    await initWidgetMountState(state, createCaptureOptions([], loggerCalls));

    expect(loggerCalls).toEqual([
      { level: 'warn', args: ['warning'] },
      { level: 'error', args: ['error'] }
    ]);
  });

  it('flushes patches before invoking onLogger', async (): Promise<void> => {
    const patches: WidgetRuntimePatch[] = [];
    const loggerCalls: Array<{ level: 'info' | 'warn' | 'error'; args: unknown[] }> = [];
    const state = createLoggerRuntimeState(
      createLoggerWidgetCode(['  count = 0', '', '  async onMounted() {', '    this.count = 5', "    await this.$logger.info('count', this.count)", '  }']),
      { count: 0 }
    );

    // onLogger 触发时，前置的 set patch 应已上报
    let patchesAtLogTime: WidgetRuntimePatch[] = [];
    const options = createCaptureOptions(patches, loggerCalls);
    const originalOnLogger = options.onLogger;
    options.onLogger = (level, args): void => {
      patchesAtLogTime = [...patches];
      originalOnLogger(level, args);
    };

    await initWidgetMountState(state, options);

    expect(loggerCalls).toEqual([{ level: 'info', args: ['count', 5] }]);
    expect(patchesAtLogTime).toEqual([{ op: 'set', path: ['count'], value: 5 }]);
  });

  it('supports no-arg calls without throwing', async (): Promise<void> => {
    const loggerCalls: Array<{ level: 'info' | 'warn' | 'error'; args: unknown[] }> = [];
    const state = createLoggerRuntimeState(createLoggerWidgetCode(['  async onMounted() {', '    await this.$logger.info()', '  }']));

    await initWidgetMountState(state, createCaptureOptions([], loggerCalls));

    expect(loggerCalls).toEqual([{ level: 'info', args: [] }]);
  });

  it('deep-clones args before forwarding to host', async (): Promise<void> => {
    const loggerCalls: Array<{ level: 'info' | 'warn' | 'error'; args: unknown[] }> = [];
    const state = createLoggerRuntimeState(
      createLoggerWidgetCode([
        '  async onMounted() {',
        '    const payload = { items: [1, 2, 3] }',
        '    await this.$logger.info("payload", payload)',
        '    payload.items.push(4)',
        '  }'
      ])
    );

    await initWidgetMountState(state, createCaptureOptions([], loggerCalls));

    // 沙箱内 __clone 已断开引用，后续 push 不影响已上报的 args
    expect(loggerCalls[0]?.args).toEqual(['payload', { items: [1, 2, 3] }]);
  });

  it('preserves Error and undefined args before forwarding to host', async (): Promise<void> => {
    const loggerCalls: Array<{ level: 'info' | 'warn' | 'error'; args: unknown[] }> = [];
    const state = createLoggerRuntimeState(
      createLoggerWidgetCode(['  async onMounted() {', '    await this.$logger.error("caught", new Error("boom"), undefined)', '  }'])
    );

    await initWidgetMountState(state, createCaptureOptions([], loggerCalls));

    const errorArg = loggerCalls[0]?.args[1];
    expect(loggerCalls[0]?.args[0]).toBe('caught');
    expect(errorArg).toBeInstanceOf(Error);
    expect((errorArg as Error).message).toBe('boom');
    expect(loggerCalls[0]?.args[2]).toBeUndefined();
  });

  it('executeWidgetRuntime forwards $logger calls from onExecute', async (): Promise<void> => {
    const loggerCalls: Array<{ level: 'info' | 'warn' | 'error'; args: unknown[] }> = [];
    const state = createLoggerRuntimeState(createLoggerWidgetCode(['  async onExecute() {', "    await this.$logger.info('execute-log')", '  }']));

    await executeWidgetRuntime(state, createCaptureOptions([], loggerCalls));

    expect(loggerCalls).toEqual([{ level: 'info', args: ['execute-log'] }]);
  });

  it('runtime session mounted forwards $logger calls from onMounted', async (): Promise<void> => {
    const loggerCalls: Array<{ level: 'info' | 'warn' | 'error'; args: unknown[] }> = [];
    const state = createLoggerRuntimeState(createLoggerWidgetCode(['  async onMounted() {', "    await this.$logger.warn('mount-log')", '  }']));
    const session = createWidgetRuntimeSession(state, createCaptureOptions([], loggerCalls));

    try {
      await session.mounted();
    } finally {
      session.dispose();
    }

    expect(loggerCalls).toEqual([{ level: 'warn', args: ['mount-log'] }]);
  });

  it('waits for unawaited logger continuations before completing the current session run', async (): Promise<void> => {
    let releaseLogger: () => void = (): void => undefined;
    const loggerGate = new Promise<void>((resolve): void => {
      releaseLogger = resolve;
    });
    const loggerCalls: Array<{ level: 'info' | 'warn' | 'error'; args: unknown[] }> = [];
    const state = createLoggerRuntimeState(
      createLoggerWidgetCode([
        '  onMounted() {',
        "    this.$logger.info('deferred-log').then(() => {",
        "      this.message = 'logger-finished'",
        '    })',
        '  }'
      ])
    );
    const session = createWidgetRuntimeSession(state, {
      useWorker: false,
      onLogger: async (level, args): Promise<void> => {
        loggerCalls.push({ level, args });
        await loggerGate;
      }
    });
    let mountedSettled = false;

    try {
      const mountedPromise = session.mounted().then((result) => {
        mountedSettled = true;
        return result;
      });
      await vi.waitFor((): void => {
        expect(loggerCalls).toHaveLength(1);
      });
      const settledBeforeLogger = mountedSettled;

      releaseLogger();
      const result = await mountedPromise;

      expect(settledBeforeLogger).toBe(false);
      expect(result.state.renderContext.data).toEqual({ message: 'logger-finished' });
    } finally {
      releaseLogger();
      session.dispose();
    }
  });

  it('waits for the full asynchronous logger continuation chain', async (): Promise<void> => {
    const state = createLoggerRuntimeState(
      createLoggerWidgetCode([
        '  onMounted() {',
        "    this.$logger.info('async-chain').then(async () => {",
        '      for (let index = 0; index < 20; index += 1) {',
        '        await Promise.resolve()',
        '      }',
        "      this.message = 'async-chain-finished'",
        '    })',
        '  }'
      ])
    );

    const result = await initWidgetMountState(state, createCaptureOptions([], []));

    expect(result.renderContext.data).toEqual({ message: 'async-chain-finished' });
  });

  it('tracks logger continuations assimilated through Promise.resolve', async (): Promise<void> => {
    const state = createLoggerRuntimeState(
      createLoggerWidgetCode([
        '  onMounted() {',
        "    Promise.resolve(this.$logger.info('resolved-chain')).then(async () => {",
        '      for (let index = 0; index < 20; index += 1) {',
        '        await Promise.resolve()',
        '      }',
        "      this.message = 'resolved-chain-finished'",
        '    })',
        '  }'
      ])
    );

    const result = await initWidgetMountState(state, createCaptureOptions([], []));

    expect(result.renderContext.data).toEqual({ message: 'resolved-chain-finished' });
  });

  it('tracks logger continuations assimilated through Promise.all', async (): Promise<void> => {
    const state = createLoggerRuntimeState(
      createLoggerWidgetCode([
        '  onMounted() {',
        "    Promise.all([this.$logger.info('all-chain')]).then(async () => {",
        '      for (let index = 0; index < 20; index += 1) {',
        '        await Promise.resolve()',
        '      }',
        "      this.message = 'all-chain-finished'",
        '    })',
        '  }'
      ])
    );

    const result = await initWidgetMountState(state, createCaptureOptions([], []));

    expect(result.renderContext.data).toEqual({ message: 'all-chain-finished' });
  });

  it('runtime session run forwards $logger calls from custom methods', async (): Promise<void> => {
    const loggerCalls: Array<{ level: 'info' | 'warn' | 'error'; args: unknown[] }> = [];
    const state = createLoggerRuntimeState(createLoggerWidgetCode(['  async submitOrder() {', "    await this.$logger.error('interaction-log')", '  }']));
    const session = createWidgetRuntimeSession(state, createCaptureOptions([], loggerCalls));

    try {
      await session.run('submitOrder');
    } finally {
      session.dispose();
    }

    expect(loggerCalls).toEqual([{ level: 'error', args: ['interaction-log'] }]);
  });

  it('supports circular and BigInt args without failing runtime', async (): Promise<void> => {
    const loggerCalls: Array<{ level: 'info' | 'warn' | 'error'; args: unknown[] }> = [];
    const state = createLoggerRuntimeState(
      createLoggerWidgetCode([
        '  async onMounted() {',
        '    const payload = { label: "loop" }',
        '    payload.self = payload',
        '    await this.$logger.info(payload, 42n)',
        '  }'
      ])
    );

    await initWidgetMountState(state, createCaptureOptions([], loggerCalls));
    const payloadArg = loggerCalls[0]?.args[0] as Record<string, unknown> | undefined;

    expect(payloadArg?.label).toBe('loop');
    expect(payloadArg?.self).toBe(payloadArg);
    expect(loggerCalls[0]?.args[1]).toBe(42n);
  });

  it('unwraps proxied data args before forwarding to host logger', async (): Promise<void> => {
    const loggerCalls: Array<{ level: 'info' | 'warn' | 'error'; args: unknown[] }> = [];
    const state = createLoggerRuntimeState(
      createLoggerWidgetCode([
        '  movieList = []',
        '',
        '  async onMounted() {',
        '    this.movieList = [{ title: "流浪地球" }]',
        '    await this.$logger.info("movies", this.movieList)',
        '  }'
      ])
    );

    await initWidgetMountState(state, createCaptureOptions([], loggerCalls));

    expect(loggerCalls).toEqual([{ level: 'info', args: ['movies', [{ title: '流浪地球' }]] }]);
  });

  it('unwraps proxied data inside Map and Set logger args', async (): Promise<void> => {
    const loggerCalls: Array<{ level: 'info' | 'warn' | 'error'; args: unknown[] }> = [];
    const state = createLoggerRuntimeState(
      createLoggerWidgetCode([
        '  movieList = []',
        '',
        '  async onMounted() {',
        '    this.movieList = [{ title: "流浪地球" }]',
        '    await this.$logger.info(new Map([["movies", this.movieList]]), new Set([this.movieList]))',
        '  }'
      ])
    );

    await initWidgetMountState(state, createCaptureOptions([], loggerCalls));

    expect(loggerCalls).toEqual([{ level: 'info', args: [new Map([['movies', [{ title: '流浪地球' }]]]), new Set([[{ title: '流浪地球' }]])] }]);
  });

  it('does not invoke onLogger when script execution throws', async (): Promise<void> => {
    const loggerCalls: Array<{ level: 'info' | 'warn' | 'error'; args: unknown[] }> = [];
    const state = createLoggerRuntimeState(createLoggerWidgetCode(['  onMounted() {', '    throw new Error("script boom")', '  }']));

    await expect(initWidgetMountState(state, createCaptureOptions([], loggerCalls))).rejects.toThrow('script boom');

    // 脚本抛错时不触发 $logger。
    expect(loggerCalls).toHaveLength(0);
  });

  it('does not invoke onLogger when script is disabled', async (): Promise<void> => {
    const onLogger = vi.fn<(level: 'info' | 'warn' | 'error', args: unknown[]) => void>();
    const state = createLoggerRuntimeState(createLoggerWidgetCode(['  async onMounted() {', "    await this.$logger.info('should not run')", '  }']));
    state.value.execute = { enabled: false, code: state.value.execute.code };

    await initWidgetMountState(state, { useWorker: false, onLogger });

    expect(onLogger).not.toHaveBeenCalled();
  });
});

describe('widgetRuntime console bridge', (): void => {
  it('executeWidgetRuntime forwards console calls from onExecute', async (): Promise<void> => {
    const consoleCalls: WidgetConsoleCall[] = [];
    const state = createLoggerRuntimeState(createLoggerWidgetCode(['  onExecute() {', "    console.log('execute-console')", '  }']));

    await executeWidgetRuntime(state, createCaptureOptions([], [], consoleCalls));

    expect(consoleCalls).toEqual([{ level: 'log', args: ['execute-console'] }]);
  });

  it('runtime session run forwards console calls from custom methods', async (): Promise<void> => {
    const consoleCalls: WidgetConsoleCall[] = [];
    const state = createLoggerRuntimeState(createLoggerWidgetCode(['  submitOrder() {', "    console.info('interaction-console')", '  }']));
    const session = createWidgetRuntimeSession(state, createCaptureOptions([], [], consoleCalls));

    try {
      await session.run('submitOrder');
    } finally {
      session.dispose();
    }

    expect(consoleCalls).toEqual([{ level: 'info', args: ['interaction-console'] }]);
  });

  it('forwards console.log to onConsole with level and args', async (): Promise<void> => {
    const consoleCalls: WidgetConsoleCall[] = [];
    const state = createLoggerRuntimeState(createLoggerWidgetCode(['  onMounted() {', "    console.log('hello', { count: 1 })", '  }']));

    await initWidgetMountState(state, createCaptureOptions([], [], consoleCalls));

    expect(consoleCalls).toEqual([{ level: 'log', args: ['hello', { count: 1 }] }]);
  });

  it('forwards info/warn/error/debug levels', async (): Promise<void> => {
    const consoleCalls: WidgetConsoleCall[] = [];
    const state = createLoggerRuntimeState(
      createLoggerWidgetCode([
        '  onMounted() {',
        "    console.info('info')",
        "    console.warn('warn')",
        "    console.error('error')",
        "    console.debug('debug')",
        '  }'
      ])
    );

    await initWidgetMountState(state, createCaptureOptions([], [], consoleCalls));

    expect(consoleCalls).toEqual([
      { level: 'info', args: ['info'] },
      { level: 'warn', args: ['warn'] },
      { level: 'error', args: ['error'] },
      { level: 'debug', args: ['debug'] }
    ]);
  });

  it('deep-clones object args before forwarding (breaks reference)', async (): Promise<void> => {
    const consoleCalls: WidgetConsoleCall[] = [];
    const state = createLoggerRuntimeState(
      createLoggerWidgetCode([
        '  onMounted() {',
        '    const payload = { items: [1, 2, 3] }',
        '    console.log("payload", payload)',
        '    payload.items.push(4)',
        '  }'
      ])
    );

    await initWidgetMountState(state, createCaptureOptions([], [], consoleCalls));

    // 沙箱内 __clone 已断开引用，后续 push 不影响已上报的 args
    expect(consoleCalls[0]?.args).toEqual(['payload', { items: [1, 2, 3] }]);
  });

  it('preserves undefined and BigInt console args without failing runtime', async (): Promise<void> => {
    const consoleCalls: WidgetConsoleCall[] = [];
    const state = createLoggerRuntimeState(createLoggerWidgetCode(['  onMounted() {', '    console.log(undefined, 42n)', '  }']));

    await initWidgetMountState(state, createCaptureOptions([], [], consoleCalls));

    expect(consoleCalls).toEqual([{ level: 'log', args: [undefined, 42n] }]);
  });

  it('unwraps proxied data args before forwarding to host console', async (): Promise<void> => {
    const consoleCalls: WidgetConsoleCall[] = [];
    const state = createLoggerRuntimeState(
      createLoggerWidgetCode([
        '  movieList = []',
        '',
        '  onMounted() {',
        '    this.fetchMovies()',
        '  }',
        '',
        '  async fetchMovies() {',
        '    this.movieList = [{ title: "流浪地球" }]',
        '    console.log("movies", this.movieList)',
        '  }'
      ])
    );

    await initWidgetMountState(state, createCaptureOptions([], [], consoleCalls));

    expect(consoleCalls).toEqual([{ level: 'log', args: ['movies', [{ title: '流浪地球' }]] }]);
  });

  it('unwraps proxied data inside Map and Set console args', async (): Promise<void> => {
    const consoleCalls: WidgetConsoleCall[] = [];
    const state = createLoggerRuntimeState(
      createLoggerWidgetCode([
        '  movieList = []',
        '',
        '  onMounted() {',
        '    this.movieList = [{ title: "流浪地球" }]',
        '    console.log(new Map([["movies", this.movieList]]), new Set([this.movieList]))',
        '  }'
      ])
    );

    await initWidgetMountState(state, createCaptureOptions([], [], consoleCalls));

    expect(consoleCalls).toEqual([{ level: 'log', args: [new Map([['movies', [{ title: '流浪地球' }]]]), new Set([[{ title: '流浪地球' }]])] }]);
  });

  it('keeps $logger and console independent', async (): Promise<void> => {
    const loggerCalls: Array<{ level: 'info' | 'warn' | 'error'; args: unknown[] }> = [];
    const consoleCalls: WidgetConsoleCall[] = [];
    const state = createLoggerRuntimeState(
      createLoggerWidgetCode([
        '  async onMounted() {',
        "    console.log('to-devtools')",
        "    await this.$logger.info('to-file')",
        "    console.error('devtools-error')",
        '  }'
      ])
    );

    await initWidgetMountState(state, createCaptureOptions([], loggerCalls, consoleCalls));

    // console 走 DevTools 通道，$logger 走日志文件通道，二者互不干扰
    expect(consoleCalls).toEqual([
      { level: 'log', args: ['to-devtools'] },
      { level: 'error', args: ['devtools-error'] }
    ]);
    expect(loggerCalls).toEqual([{ level: 'info', args: ['to-file'] }]);
  });

  it('does not invoke onConsole when script is disabled', async (): Promise<void> => {
    const onConsole = vi.fn<(level: 'log' | 'info' | 'warn' | 'error' | 'debug', args: unknown[]) => void>();
    const state = createLoggerRuntimeState(createLoggerWidgetCode(['  onMounted() {', "    console.log('should not run')", '  }']));
    state.value.execute = { enabled: false, code: state.value.execute.code };

    await initWidgetMountState(state, { useWorker: false, onConsole });

    expect(onConsole).not.toHaveBeenCalled();
  });
});
