# Widget Script Managed HTTP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not commit changes unless the user explicitly asks for a commit.

**Goal:** Complete the first usable Widget interaction script runtime and managed HTTP path without adding user-facing HTTP permission configuration.

**Architecture:** Keep Widget scripts on the current controlled interpreter path instead of evaluating arbitrary JavaScript. Scripts can use `Widget({ mounted, unmounted, methods })`, `this.$setState`, `this.$sendMessage`, and a managed `this.$http` client; all HTTP timeout, queueing, response limits, redirects, and protocol checks are handled by the platform layer. No per-widget HTTP permission schema, no `metadata.skill.permissions`, no `execute.http`, and no variable UI for HTTP security settings.

**Tech Stack:** TypeScript strict mode, Vue 3, Vitest, Electron IPC, lodash-es, existing Widget protocol helpers under `types/widget.d.ts` and `src/shared/widget/protocol.ts`.

---

## Scope

This plan implements two previously open areas:

- Widget interaction script runtime: lifecycle hooks, named methods, enabled control, normalized failure, and no arbitrary global API access.
- Managed HTTP: injected `this.$http` client, platform-owned timeout/queue/redirect/response limits, and a main-process proxy.

This plan intentionally does not implement:

- User-facing HTTP permission configuration.
- Per-widget allowed origin/path/method/header config.
- Confirmation dialogs for HTTP requests.
- Custom request headers in Widget scripts.
- Full JavaScript sandbox or arbitrary `fetch`.
- Method-to-method recursive calls.

## Design Decision: No HTTP Permission Config

Widget authors should not think about HTTP security policy while designing a small component. The runtime provides one simple capability:

```ts
const weather = await this.$http.get('https://api.example.com/weather', {
  query: { city: this.$input.city }
})
```

The platform owns the hard limits:

- Allowed protocols: `http:` and `https:` only.
- Request timeout: owned by the platform request layer.
- Waiting queue length: unlimited.
- Concurrent HTTP requests in the main process: `4`.
- Redirect limit: `3`.
- Response body limit: `1MB`.
- Request headers: first version does not allow script-provided custom headers.
- Request body: JSON object, array, string, number, boolean, or null.

If a Widget needs credentials, API keys, cookies, or high-risk network permissions, that should become a separate product-level integration later, not a Widget authoring setting.

## File Structure

- Create `types/request.d.ts`
  - Add shared request/response/client types for the platform-managed request API.
- Modify `types/widget.d.ts`
  - Re-export or consume the shared request types only where Widget-specific `$http` needs them.
  - Add shared runtime error codes if they are not already present.
- Create `src/shared/request/protocol.ts`
  - Add request payload guards only if renderer and main process both need them.
- Modify `src/shared/widget/protocol.ts`
  - Keep existing submit/send-message normalization and do not add generic request logic here.
- Modify `src/components/BChat/utils/widgetRuntime.ts`
  - Add named method extraction.
  - Add async statement runner for supported statements.
  - Inject `$http`.
  - Own renderer-side `$http` method normalization and native bridge call; queue/concurrency live in the main-process request proxy.
  - Normalize runtime failures.
- Modify `src/components/BChat/components/MessageBubble/BubblePartWidget.vue`
  - Use the new runtime dependency factory when initializing and finishing a Widget part.
- Modify `src/views/widget/components/PageSetter/MethodEditor.vue`
  - Add `$http` type hints.
- Modify `src/views/widget/constants/pageSetter.ts`
  - Update default script comments to mention `$http` briefly without exposing platform limits.
- Modify `types/electron-api.d.ts`
  - Add the generic `request` API.
- Modify `electron/preload/index.mts`
  - Expose `request`.
- Create `electron/main/modules/request/core/constants.mts`
  - Define request timeout, response size, and concurrency constants.
- Create `electron/main/modules/request/core/body.mts`
  - Keep string and special fetch body values raw while JSON-stringifying ordinary objects.
- Create `electron/main/modules/request/core/queue.mts`
  - Provide a p-queue style concurrency queue with no max waiting queue size.
- Create `electron/main/modules/request/core/url.mts`
  - Validate request URL and append query parameters.
- Create `electron/main/modules/request/core/response.mts`
  - Parse text/JSON response bodies and enforce response size.
- Create `electron/main/modules/request/service.mts`
  - Execute managed requests through the main-process queue.
- Create `electron/main/modules/request/ipc.mts`
  - Register the IPC handler only.
- Modify `electron/main/modules/index.mts`
  - Register and export the request IPC handler.
- Add `test/components/BChat/widget-runtime.test.ts` cases
  - Runtime method support, disabled execute, managed HTTP waiting, and normalized failure.
- Add `test/components/BChat/widget-http-client.test.ts`
  - Renderer-side `$http` normalization/native bridge tests.
- Add `test/electron/main/modules/request-ipc.test.ts`
  - Main-process protocol, queue, redirect, response size, and error tests.
- Modify `changelog/2026-07-01.md`
  - Record the runtime and managed HTTP changes after implementation.

---

### Task 1: Add Managed Request Protocol Types

**Files:**
- Create: `types/request.d.ts`
- Modify: `types/widget.d.ts`
- Test: `test/components/BChat/widget-http-client.test.ts`

- [x] **Step 1: Write the failing protocol usage test**

Add this first test to `test/components/BChat/widget-http-client.test.ts`:

```ts
/**
 * @file widget-http-client.test.ts
 * @description BChat 小组件托管 HTTP 客户端测试。
 */
import type { RequestInput, RequestResponse } from 'types/request';
import { describe, expect, it } from 'vitest';

describe('request protocol', (): void => {
  it('uses a small request and response contract without permission config', (): void => {
    const request: RequestInput = {
      method: 'GET',
      url: 'https://api.example.com/weather',
      query: {
        city: '上海'
      }
    };

    const response: RequestResponse = {
      status: 200,
      ok: true,
      url: 'https://api.example.com/weather?city=%E4%B8%8A%E6%B5%B7',
      headers: {
        'content-type': 'application/json'
      },
      data: {
        temperature: 28
      }
    };

    expect(request).toMatchObject({ method: 'GET' });
    expect(response.ok).toBe(true);
  });
});
```

- [x] **Step 2: Run the protocol test and verify it fails**

Run:

```bash
pnpm test test/components/BChat/widget-http-client.test.ts
```

Expected: FAIL because `RequestInput` and `RequestResponse` are not defined.

- [x] **Step 3: Add shared request protocol types**

Create `types/request.d.ts`:

```ts
/**
 * @file request.d.ts
 * @description 平台托管 request 能力的跨层协议类型定义。
 */

/**
 * 托管请求方法。
 */
export type RequestMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * 托管请求查询参数。
 */
export type RequestQueryValue = string | number | boolean | null | undefined;

/**
 * 托管请求 JSON 请求体。
 */
export type RequestJsonValue = string | number | boolean | null | RequestJsonValue[] | { [key: string]: RequestJsonValue };

/**
 * 托管请求输入。
 */
export interface RequestInput {
  /** 请求方法 */
  method: RequestMethod;
  /** 请求 URL，仅支持 http/https */
  url: string;
  /** 查询参数 */
  query?: Record<string, RequestQueryValue>;
  /** JSON 请求体 */
  body?: RequestJsonValue;
}

/**
 * 托管请求响应。
 */
export interface RequestResponse {
  /** 最终响应 URL */
  url: string;
  /** HTTP 状态码 */
  status: number;
  /** 是否为 2xx 响应 */
  ok: boolean;
  /** 响应头，key 统一小写 */
  headers: Record<string, string>;
  /** 响应数据，JSON 响应为对象；其他响应为文本 */
  data: unknown;
}
```

Then add the Widget-specific `$http` client types to `types/widget.d.ts`:

```ts
import type { RequestInput, RequestResponse } from './request';

/**
 * 小组件托管 HTTP 客户端。
 */
export interface WidgetHttpClient {
  /** 发送 GET 请求 */
  get(url: string, request?: Omit<RequestInput, 'method' | 'url' | 'body'>): Promise<RequestResponse>;
  /** 发送 POST 请求 */
  post(url: string, request?: Omit<RequestInput, 'method' | 'url'>): Promise<RequestResponse>;
  /** 发送 PUT 请求 */
  put(url: string, request?: Omit<RequestInput, 'method' | 'url'>): Promise<RequestResponse>;
  /** 发送 PATCH 请求 */
  patch(url: string, request?: Omit<RequestInput, 'method' | 'url'>): Promise<RequestResponse>;
  /** 发送 DELETE 请求 */
  delete(url: string, request?: Omit<RequestInput, 'method' | 'url'>): Promise<RequestResponse>;
}
```

- [x] **Step 4: Run the protocol test and verify it passes**

Run:

```bash
pnpm test test/components/BChat/widget-http-client.test.ts
```

Expected: PASS.

---

### Task 2: Add Runtime Widget HTTP Adapter

**Files:**
- Modify: `src/components/BChat/utils/widgetRuntime.ts`
- Extend: `test/components/BChat/widget-http-client.test.ts`

- [x] **Step 1: Write failing bridge normalization test**

Append this test to `test/components/BChat/widget-http-client.test.ts`:

```ts
import type { RequestInput } from 'types/request';
import { createWidgetHttpClient } from '@/components/BChat/utils/widgetRuntime';

describe('createWidgetHttpClient', (): void => {
  it('normalizes GET query requests before calling the native bridge', async (): Promise<void> => {
    const requests: RequestInput[] = [];
    const client = createWidgetHttpClient({
      request: async (request: RequestInput) => {
        requests.push(request);
        return {
          status: 200,
          ok: true,
          url: request.url,
          headers: {},
          data: { ok: true }
        };
      }
    });

    await client.get('https://api.example.com/weather', {
      query: {
        city: '上海'
      }
    });

    expect(requests).toEqual([
      {
        method: 'GET',
        url: 'https://api.example.com/weather',
        query: {
          city: '上海'
        }
      }
    ]);
  });
});
```

- [x] **Step 2: Run the client tests and verify they fail**

Run:

```bash
pnpm test test/components/BChat/widget-http-client.test.ts
```

Expected: FAIL because `widgetRuntime` does not expose `createWidgetHttpClient`.

- [x] **Step 3: Implement the Widget HTTP adapter**

Add the `$http` adapter to `src/components/BChat/utils/widgetRuntime.ts`:

```ts
/**
 * 小组件托管 HTTP 客户端依赖。
 */
export interface WidgetHttpClientDependencies {
  /** 平台托管 request 调用，测试中可注入。 */
  request?: (request: RequestInput) => Promise<RequestResponse>;
}

/**
 * 创建小组件托管 HTTP 客户端。
 * @param dependencies - 可注入依赖
 * @returns 小组件脚本可使用的 HTTP 客户端
 */
export function createWidgetHttpClient(dependencies: WidgetHttpClientDependencies = {}): WidgetHttpClient {
  const request = dependencies.request ?? ((input: RequestInput): Promise<RequestResponse> => getElectronAPI().request(input));

  return {
    get: async (url, options = {}): Promise<RequestResponse> => request({ ...options, method: 'GET', url }),
    post: async (url, options = {}): Promise<RequestResponse> => request({ ...options, method: 'POST', url }),
    put: async (url, options = {}): Promise<RequestResponse> => request({ ...options, method: 'PUT', url }),
    patch: async (url, options = {}): Promise<RequestResponse> => request({ ...options, method: 'PATCH', url }),
    delete: async (url, options = {}): Promise<RequestResponse> => request({ ...options, method: 'DELETE', url })
  };
}
```

- [x] **Step 4: Run the client tests and verify they pass**

Run:

```bash
pnpm test test/components/BChat/widget-http-client.test.ts
```

Expected: PASS.

---

### Task 3: Add Runtime Methods, Timeout, And Failure Normalization

**Files:**
- Modify: `src/components/BChat/utils/widgetRuntime.ts`
- Extend: `test/components/BChat/widget-runtime.test.ts`

- [x] **Step 1: Write failing runtime tests**

Append these tests to `test/components/BChat/widget-runtime.test.ts`:

```ts
it('does not run disabled execute scripts', async (): Promise<void> => {
  const part = {
    ...createWidgetPart("Widget({ mounted() { this.$setState('weather.temperature', 28) } })"),
    value: {
      ...createWidgetData("Widget({ mounted() { this.$setState('weather.temperature', 28) } })"),
      execute: {
        enabled: false,
        code: "Widget({ mounted() { this.$setState('weather.temperature', 28) } })"
      }
    }
  };

  const nextPart = await initWidgetMountState(part);

  expect(nextPart).toBe(part);
  expect(nextPart.renderContext.state).toEqual({});
});

it('runs a named method without allowing method recursion', async (): Promise<void> => {
  const part = {
    ...createWidgetPart(
      [
        'Widget({',
        '  methods: {',
        '    confirm() {',
        "      this.$setState('confirmed', true)",
        "      this.$sendMessage('确认下单')",
        '    }',
        '  }',
        '})'
      ].join('\n')
    ),
    status: 'mounted' as const,
    lifecycle: {
      mountedAt: '2026-07-01T00:00:00.000Z'
    }
  };

  const result = await createWidgetRuntimeInstance(part).callMethod('confirm');

  expect(result.part.status).toBe('finished');
  expect(result.part.renderContext.state).toEqual({ confirmed: true });
  expect(result.sendMessage).toEqual({ content: '确认下单', isError: false });
});
```

- [x] **Step 2: Run the runtime tests and verify they fail**

Run:

```bash
pnpm test test/components/BChat/widget-runtime.test.ts
```

Expected: FAIL because `createWidgetRuntimeInstance` is not exported and `enabled: false` is not honored.

- [x] **Step 3: Implement runtime control metadata**

Modify `src/components/BChat/utils/widgetRuntime.ts`:

```ts
/**
 * 判断脚本是否启用。
 * @param part - 小组件消息片段
 * @returns 是否允许运行脚本
 */
function isWidgetScriptEnabled(part: ChatMessageWidgetPart): boolean {
  return part.value.execute?.enabled !== false;
}
```

Then guard both `initWidgetMountState` and `finishWidgetRuntime`:

```ts
if (!isWidgetScriptEnabled(part)) return part;
```

For `finishWidgetRuntime`, return `{ part }` when disabled.

- [x] **Step 4: Add method extraction and method runner**

Add method lookup beside lifecycle lookup in `src/components/BChat/utils/widgetRuntime.ts`:

```ts
/**
 * 从 Widget.methods 读取指定方法。
 * @param code - JS 脚本代码
 * @param methodName - 方法名
 * @returns 方法函数节点
 */
function findWidgetMethodFunction(code: string, methodName: string): WidgetFunctionNodeWithBody | undefined {
  const sourceFile = ts.createSourceFile('widget-runtime.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let methodFunction: WidgetFunctionNodeWithBody | undefined;

  function visit(node: ts.Node): void {
    if (methodFunction) return;

    if (isWidgetConfigCall(node) && ts.isObjectLiteralExpression(node.arguments[0])) {
      const methodsProperty = node.arguments[0].properties.find((property) => readPropertyName(property.name) === 'methods');
      if (!methodsProperty || !ts.isPropertyAssignment(methodsProperty) || !ts.isObjectLiteralExpression(methodsProperty.initializer)) return;

      for (const property of methodsProperty.initializer.properties) {
        if (readPropertyName(property.name) !== methodName) continue;
        if (ts.isMethodDeclaration(property) && hasBlockBody(property)) {
          methodFunction = property;
          return;
        }
        if (
          ts.isPropertyAssignment(property) &&
          (ts.isFunctionExpression(property.initializer) || ts.isArrowFunction(property.initializer)) &&
          hasBlockBody(property.initializer)
        ) {
          methodFunction = property.initializer;
          return;
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return methodFunction;
}
```

Add a shared finish helper:

```ts
/**
 * 创建小组件完成态结果。
 * @param part - 小组件消息片段
 * @param options - 生命周期执行选项
 * @param sendMessage - 可选上行消息
 * @returns 小组件运行态收尾结果
 */
function createWidgetFinishedResult(
  part: ChatMessageWidgetPart,
  options: WidgetLifecycleRunOptions = {},
  sendMessage?: WidgetRuntimeSendMessage
): WidgetRuntimeFinishResult {
  const unmountedAt = (options.now ?? (() => new Date()))().toISOString();

  return {
    part: {
      ...part,
      status: 'finished',
      lifecycle: {
        ...part.lifecycle,
        unmountedAt
      }
    },
    ...(sendMessage ? { sendMessage } : {})
  };
}
```

Then make `finishWidgetRuntime` call `createWidgetFinishedResult(nextPart, options, lifecycleResult.sendMessage)` instead of constructing the finish object inline.

Export:

```ts
/**
 * 调用小组件实例上的命名方法。
 * @param part - 小组件消息片段
 * @param methodName - 方法名
 * @param options - 生命周期执行选项
 * @returns 方法执行结果
 */
async function callWidgetInstanceMethod(part: ChatMessageWidgetPart, methodName: string, options: WidgetLifecycleRunOptions = {}): Promise<WidgetRuntimeFinishResult> {
  if (part.status !== 'mounted' || !isWidgetScriptEnabled(part)) return { part };

  const nextPart = cloneDeep(part);
  const methodFunction = findWidgetMethodFunction(nextPart.value.execute?.code ?? 'Widget({})', methodName);
  const methodResult = await runLifecycleStatements(methodFunction, nextPart, options);

  if (methodResult.sendMessage) {
    return createWidgetFinishedResult(nextPart, options, methodResult.sendMessage);
  }

  return {
    part: {
      ...nextPart,
      status: 'mounted'
    }
  };
}
```

Do not add method-to-method calls. The interpreter should ignore or fail unsupported `this.methods.*` / `this.$methods.*` calls instead of trying to resolve recursive method execution.

- [x] **Step 5: Run the runtime tests and verify they pass**

Run:

```bash
pnpm test test/components/BChat/widget-runtime.test.ts
```

Expected: PASS.

---

### Task 4: Inject Managed HTTP Into The Script Runtime

**Files:**
- Modify: `src/components/BChat/utils/widgetRuntime.ts`
- Extend: `test/components/BChat/widget-runtime.test.ts`

- [x] **Step 1: Write failing `$http` runtime test**

Append this test to `test/components/BChat/widget-runtime.test.ts`:

```ts
it('supports managed http calls and stores response data', async (): Promise<void> => {
  const part = createWidgetPart(
    [
      'Widget({',
      '  async mounted() {',
      "    const weather = await this.$http.get('https://api.example.com/weather', { query: { city: this.$input.city } })",
      "    this.$setState('weather', weather.data)",
      '  }',
      '})'
    ].join('\n')
  );

  const nextPart = await initWidgetMountState(part, {
    http: {
      get: async () => ({ status: 200, ok: true, url: 'https://api.example.com/weather', headers: {}, data: { temperature: 28 } }),
      post: async () => ({ status: 405, ok: false, url: '', headers: {}, data: '' }),
      put: async () => ({ status: 405, ok: false, url: '', headers: {}, data: '' }),
      patch: async () => ({ status: 405, ok: false, url: '', headers: {}, data: '' }),
      delete: async () => ({ status: 405, ok: false, url: '', headers: {}, data: '' })
    }
  });

  expect(nextPart.renderContext.state).toEqual({
    weather: {
      temperature: 28
    }
  });
});
```

- [x] **Step 2: Run the runtime test and verify it fails**

Run:

```bash
pnpm test test/components/BChat/widget-runtime.test.ts
```

Expected: FAIL because runtime options do not accept `http` and expression evaluation does not support awaited `$http`.

- [x] **Step 3: Extend runtime options and expression context**

Modify `WidgetLifecycleRunOptions` in `src/components/BChat/utils/widgetRuntime.ts`:

```ts
import type { WidgetHttpClient } from 'types/widget';

interface WidgetLifecycleRunOptions {
  /** 当前时间来源，测试中可注入固定时间。 */
  now?: () => Date;
  /** 小组件托管 HTTP 客户端。 */
  http?: WidgetHttpClient;
}
```

Add `http` to `WidgetExpressionEvalContext`:

```ts
interface WidgetExpressionEvalContext {
  /** Widget 启动入参。 */
  input: ChatMessageWidgetPart['renderContext']['input'];
  /** Widget 会话状态。 */
  state: ChatMessageWidgetPart['renderContext']['state'];
  /** 生命周期函数体内已经解析出的局部常量。 */
  variables: Map<string, unknown>;
  /** 托管 HTTP 客户端。 */
  http?: WidgetHttpClient;
}
```

- [x] **Step 4: Support awaited `$http` calls in the interpreter**

Convert `evaluateExpression` and `runLifecycleStatements` to async:

```ts
async function evaluateExpression(expression: ts.Expression, context: WidgetExpressionEvalContext): Promise<unknown> {
  if (ts.isAwaitExpression(expression)) {
    return evaluateExpression(expression.expression, context);
  }

  if (isHttpCall(expression)) {
    return runHttpCall(expression, context);
  }

  // Keep existing literal, this.$input, this.$state, array, object and variable behavior.
}
```

Add the call detector:

```ts
/**
 * 判断表达式是否为 this.$http.method(...) 调用。
 * @param expression - 待检查表达式
 * @returns 是否为 HTTP 调用
 */
function isHttpCall(expression: ts.Expression): expression is ts.CallExpression {
  if (!ts.isCallExpression(expression) || !ts.isPropertyAccessExpression(expression.expression)) return false;
  const methodName = expression.expression.name.text;
  if (!['get', 'post', 'put', 'patch', 'delete'].includes(methodName)) return false;

  const target = expression.expression.expression;
  return (
    ts.isPropertyAccessExpression(target) &&
    target.expression.kind === ts.SyntaxKind.ThisKeyword &&
    target.name.text === '$http'
  );
}
```

Add the HTTP runner:

```ts
/**
 * 执行托管 HTTP 调用。
 * @param expression - HTTP 调用表达式
 * @param context - 求值上下文
 * @returns HTTP 响应
 */
async function runHttpCall(expression: ts.CallExpression, context: WidgetExpressionEvalContext): Promise<unknown> {
  if (!context.http || !ts.isPropertyAccessExpression(expression.expression)) {
    throw new Error('当前环境未启用小组件 HTTP 客户端');
  }

  const methodName = expression.expression.name.text as keyof WidgetHttpClient;
  const [urlExpression, optionsExpression] = expression.arguments;
  const url = urlExpression ? await evaluateExpression(urlExpression, context) : undefined;
  if (typeof url !== 'string') {
    throw new Error('小组件 HTTP URL 必须是字符串');
  }

  const options = optionsExpression ? await evaluateExpression(optionsExpression, context) : undefined;
  const method = context.http[methodName];
  return method(url, isPlainRecord(options) ? options : undefined);
}
```

- [x] **Step 5: Run the runtime tests and verify they pass**

Run:

```bash
pnpm test test/components/BChat/widget-runtime.test.ts
```

Expected: PASS.

---

### Task 5: Add Main Process Request Proxy

**Files:**
- Modify: `types/electron-api.d.ts`
- Modify: `electron/preload/index.mts`
- Create: `electron/main/modules/request/core/constants.mts`
- Create: `electron/main/modules/request/core/body.mts`
- Create: `electron/main/modules/request/core/queue.mts`
- Create: `electron/main/modules/request/core/url.mts`
- Create: `electron/main/modules/request/core/response.mts`
- Create: `electron/main/modules/request/service.mts`
- Create: `electron/main/modules/request/ipc.mts`
- Modify: `electron/main/modules/index.mts`
- Add: `test/electron/main/modules/request-ipc.test.ts`

- [x] **Step 1: Write failing main proxy tests**

Create `test/electron/main/modules/request-ipc.test.ts`:

```ts
/**
 * @file request-ipc.test.ts
 * @description Electron 主进程托管 request 代理测试。
 */
import type { RequestInput } from 'types/request';
import { describe, expect, it, vi } from 'vitest';
import { runRequest } from '../../../electron/main/modules/request/service.mjs';

describe('runRequest', (): void => {
  it('rejects non-http protocols before fetch', async (): Promise<void> => {
    await expect(runRequest({ method: 'GET', url: 'file:///etc/passwd' })).rejects.toThrow('仅支持 http/https 请求');
  });

  it('serializes query params and parses JSON responses', async (): Promise<void> => {
    const fetchMock = vi.fn<NonNullable<typeof globalThis.fetch>>().mockResolvedValue(
      new Response(JSON.stringify({ temperature: 28 }), {
        status: 200,
        headers: {
          'content-type': 'application/json'
        }
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const request: RequestInput = {
      method: 'GET',
      url: 'https://api.example.com/weather',
      query: {
        city: '上海'
      }
    };

    const response = await runRequest(request);

    expect(fetchMock).toHaveBeenCalledWith('https://api.example.com/weather?city=%E4%B8%8A%E6%B5%B7', expect.objectContaining({ method: 'GET' }));
    expect(response.data).toEqual({ temperature: 28 });
  });
});
```

- [x] **Step 2: Run the main proxy tests and verify they fail**

Run:

```bash
pnpm test test/electron/main/modules/request-ipc.test.ts
```

Expected: FAIL because `electron/main/modules/request/service.mjs` does not exist.

- [x] **Step 3: Implement the split main process proxy**

Create focused implementation files under `electron/main/modules/request/core/`: `constants.mts`, `body.mts`, `queue.mts`, `url.mts`, and `response.mts`. Keep `electron/main/modules/request/service.mts` as the request execution entry and `electron/main/modules/request/ipc.mts` as the IPC registration entry. `body.mts` keeps string and special fetch body values raw while JSON-stringifying ordinary objects; `queue.mts` exposes a p-queue style `add()` API that only limits concurrency; `service.mts` exports `runRequest`; `ipc.mts` only registers `request:send`.

- [x] **Step 4: Expose the IPC bridge**

Add to `types/electron-api.d.ts` `ElectronAPI`:

```ts
/**
 * 执行平台托管 request。
 * @param request - 请求输入
 */
request: (request: RequestInput) => Promise<RequestResponse>;
```

Import `RequestInput` and `RequestResponse` from `types/request` at the top of `types/electron-api.d.ts`.

Add to `electron/preload/index.mts`:

```ts
request: (request) => ipcRenderer.invoke('request:send', request),
```

Modify `electron/main/modules/index.mts`:

```ts
import { registerRequestHandlers } from './request/ipc.mjs';
```

Call it in `registerAllIpcHandlers()`:

```ts
registerRequestHandlers();
```

Export it with the other handler registrations.

- [x] **Step 5: Run the main proxy tests and verify they pass**

Run:

```bash
pnpm test test/electron/main/modules/request-ipc.test.ts
```

Expected: PASS.

---

### Task 6: Wire Runtime To The Managed HTTP Client

**Files:**
- Modify: `src/components/BChat/components/MessageBubble/BubblePartWidget.vue`
- Modify: `src/components/BChat/utils/widgetRuntime.ts`
- Test: `test/components/BChat/bubble-part-widget.component.test.ts`

- [x] **Step 1: Write failing integration test**

Add `nextTick` to the Vue import and add a hoisted native mock near the top of `test/components/BChat/bubble-part-widget.component.test.ts`:

```ts
import { defineComponent, nextTick } from 'vue';

const requestMock = vi.hoisted(() => vi.fn());

vi.mock('@/shared/platform/electron-api', () => ({
  getElectronAPI: () => ({
    request: requestMock
  })
}));
```

Then append this test:

```ts
it('initializes mounted state with the managed http client', async (): Promise<void> => {
  requestMock.mockResolvedValue({
    status: 200,
    ok: true,
    url: 'https://api.example.com/weather?city=%E4%B8%8A%E6%B5%B7',
    headers: {},
    data: { temperature: 28 }
  });
  const widgetPart: ChatMessageWidgetPart = {
    ...createWidgetPart(
      [
        'Widget({',
        '  async mounted() {',
        "    const weather = await this.$http.get('https://api.example.com/weather', { query: { city: this.$input.city } })",
        "    this.$setState('weather.temperature', weather.data.temperature)",
        '  }',
        '})'
      ].join('\n')
    ),
    status: 'created',
    lifecycle: {},
    renderContext: {
      input: {
        city: '上海'
      },
      state: {}
    }
  };

  const wrapper = mountBubblePartWidget(widgetPart);
  await nextTick();
  await nextTick();

  const changedPart = wrapper.emitted('change')?.[0]?.[0] as ChatMessageWidgetPart;

  expect(requestMock).toHaveBeenCalledWith({
    method: 'GET',
    url: 'https://api.example.com/weather',
    query: {
      city: '上海'
    }
  });
  expect(changedPart).toMatchObject({
    status: 'mounted',
    renderContext: {
      state: {
        weather: {
          temperature: 28
        }
      }
    }
  });
});
```

- [x] **Step 2: Run the component test and verify it fails**

Run:

```bash
pnpm test test/components/BChat/bubble-part-widget.component.test.ts
```

Expected: FAIL because `BubblePartWidget` does not inject the managed HTTP client.

- [x] **Step 3: Inject the HTTP client**

Modify `src/components/BChat/components/MessageBubble/BubblePartWidget.vue`:

```ts
import { createWidgetHttpClient } from '../../utils/widgetRuntime';

const widgetHttpClient = createWidgetHttpClient();
```

Pass it into runtime calls:

```ts
const nextPart = await initWidgetMountState(props.part, { http: widgetHttpClient });
```

And:

```ts
const finishResult = finishWidgetRuntime(currentPart, { http: widgetHttpClient });
```

- [x] **Step 4: Run the component test and verify it passes**

Run:

```bash
pnpm test test/components/BChat/bubble-part-widget.component.test.ts
```

Expected: PASS.

---

### Task 7: Update Editor Type Hints And Defaults

**Files:**
- Modify: `src/views/widget/components/PageSetter/MethodEditor.vue`
- Modify: `src/views/widget/constants/pageSetter.ts`
- Extend: `test/views/widget/page-setter.test.ts`

- [x] **Step 1: Write failing editor hint test**

Extend `test/views/widget/page-setter.test.ts`:

```ts
it('provides managed http type hints for interaction scripts', async (): Promise<void> => {
  const dataItem = createWeatherWidgetData();
  const wrapper = mountPageSetterHost(dataItem);

  await findSectionEditButton(wrapper, 'JS 脚本').trigger('click');

  const editorProps = wrapper.findComponent({ name: 'BMonaco' }).props();

  expect(editorProps.extraLibs?.[0]?.content).toContain('$http: WidgetHttpClient');
  expect(editorProps.extraLibs?.[0]?.content).toContain('get(url: string');
  wrapper.unmount();
});
```

- [x] **Step 2: Run the editor test and verify it fails**

Run:

```bash
pnpm test test/views/widget/page-setter.test.ts
```

Expected: FAIL because `$http` is missing from the extra lib.

- [x] **Step 3: Add Monaco type declarations**

Modify `createWidgetMethodScriptExtraLibContent` in `src/views/widget/components/PageSetter/MethodEditor.vue`:

```ts
declare type WidgetHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
declare type WidgetHttpQueryValue = string | number | boolean | null | undefined
declare type WidgetHttpJsonValue = string | number | boolean | null | WidgetHttpJsonValue[] | { [key: string]: WidgetHttpJsonValue }

declare interface RequestOptions {
  /** 查询参数。 */
  query?: Record<string, WidgetHttpQueryValue>
  /** JSON 请求体。 */
  body?: WidgetHttpJsonValue
}

declare interface RequestResponse {
  /** 最终响应 URL。 */
  url: string
  /** HTTP 状态码。 */
  status: number
  /** 是否为 2xx 响应。 */
  ok: boolean
  /** 响应头。 */
  headers: Record<string, string>
  /** 响应数据。 */
  data: unknown
}

declare interface WidgetHttpClient {
  /** 发送 GET 请求。 */
  get(url: string, request?: Omit<RequestOptions, 'body'>): Promise<RequestResponse>
  /** 发送 POST 请求。 */
  post(url: string, request?: RequestOptions): Promise<RequestResponse>
  /** 发送 PUT 请求。 */
  put(url: string, request?: RequestOptions): Promise<RequestResponse>
  /** 发送 PATCH 请求。 */
  patch(url: string, request?: RequestOptions): Promise<RequestResponse>
  /** 发送 DELETE 请求。 */
  delete(url: string, request?: RequestOptions): Promise<RequestResponse>
}
```

Add `$http` to `WidgetThisContext`:

```ts
/**
 * 托管 HTTP 客户端，超时和队列由系统统一控制。
 * @example const response = await this.$http.get('https://api.example.com/weather', { query: { city: this.$input.city } })
 */
$http: WidgetHttpClient
```

- [x] **Step 4: Update default script comments**

Modify `src/views/widget/constants/pageSetter.ts` default code comments:

```ts
'// 需要请求数据时，可以使用 this.$http；请求超时和队列由系统统一控制。',
```

Do not add comments about origin/path/method/header permission config.

- [x] **Step 5: Run the editor test and verify it passes**

Run:

```bash
pnpm test test/views/widget/page-setter.test.ts
```

Expected: PASS.

---

### Task 8: Final Verification

**Files:**
- Modify: `changelog/2026-07-01.md`

- [x] **Step 1: Update changelog**

Add under `## Changed` or create the section if missing:

```md
- 小组件JS 脚本补充受控 methods 与托管 HTTP 客户端，HTTP 超时和队列由底层统一管理，不暴露权限配置。
```

- [x] **Step 2: Run focused tests**

Run:

```bash
pnpm test test/components/BChat/widget-runtime.test.ts test/components/BChat/widget-http-client.test.ts test/components/BChat/bubble-part-widget.component.test.ts test/electron/main/modules/request-ipc.test.ts test/views/widget/page-setter.test.ts
```

Expected: PASS.

- [x] **Step 3: Run type check**

Run:

```bash
pnpm exec tsc --noEmit
```

Expected: PASS.

- [x] **Step 4: Run focused lint**

Run:

```bash
pnpm exec eslint src/components/BChat src/components/BWidget src/views/widget electron/main/modules/request electron/preload/index.mts --ext .vue,.ts,.mts
```

Expected: PASS.

---

## Self-Review

- Spec coverage: this plan covers controlled script execution and managed HTTP without HTTP permission config.
- Placeholder scan: no `TBD`, `TODO`, or vague "handle edge cases" steps remain.
- Type consistency: shared request protocol types live in `types/request.d.ts`; Widget-specific `$http` types live in `types/widget.d.ts`; Electron bridge uses the same request/response types.
- Deliberate gap: HTTP confirmation and per-widget permissions are intentionally out of scope because they add authoring complexity and contradict the current product direction.
