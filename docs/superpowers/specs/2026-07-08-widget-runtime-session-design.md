# Widget Runtime Session Design

## Goal

Make display-time Widget execution behave like a Vue component instance: create one live runtime session for a rendered widget, then call lifecycle methods and user methods on the same instance.

The target API is:

```ts
const session = createWidgetRuntimeSession(state, host);

await session.mounted();
await session.run('buttonByClick');
await session.run('selectMovie', 'movie-1');
session.dispose();
```

`onExecute` remains the model/tool pre-execution phase. It may call `this.$sendMessage`, but that message is not sent to Chat while the model is still executing. Display-time `onMounted`, button handlers, and custom events are business-layer calls and should share one session instance.

## Mental Model

The runtime has two phases:

- Tool phase: `open_widget` calls `onExecute`, captures serializable data/output, and returns model-visible execution information.
- Display phase: `BWidgetRuntime` creates one session from the tool snapshot, runs `onMounted`, then handles button/custom events by calling methods on the same instance.

The persisted source of truth is still `renderContext.data`. The live session may hold non-serializable instance state for the current display lifetime, but that state is not expected to survive reloads or history restoration.

## Public Runtime API

`src/components/BWidget/utils/widgetRuntime/index.ts` should expose:

```ts
export interface WidgetRuntimeSession {
  mounted: () => Promise<WidgetRuntimeRunResult>;
  run: (methodName: string, ...args: unknown[]) => Promise<WidgetRuntimeRunResult>;
  runInteraction: (interactionCode: string) => Promise<WidgetRuntimeRunResult>;
  dispose: () => void;
}

export function createWidgetRuntimeSession(state: WidgetRuntimeState, host?: WidgetRuntimeHost): WidgetRuntimeSession;
```

Compatibility helpers stay available:

- `executeWidgetRuntime(state, host)`
- `mountWidgetRuntime(state, host)`
- `initWidgetMountState(state, host)`
- `createWidgetRuntimeInstance(state, host)`

The old runner-shaped API is no longer the preferred mental model. Tool execution should call `executeWidgetRuntime`. Display execution should create a session.

## Button And Custom Events

Future button metadata should prefer method calls over free-form script:

```ts
{
  type: 'button',
  text: '选择电影',
  onClick: {
    method: 'buttonByClick',
    args: ['movie-1']
  }
}
```

The element calls:

```ts
useWidgetRuntime().value?.run('buttonByClick', 'movie-1');
```

The existing `runInteraction(interactionCode)` remains as a compatibility bridge for current metadata and advanced script expressions.

## Sandbox Session

The current sandbox worker is one-shot: each `runSandboxCode` call creates a Worker and terminates it when the run finishes. That cannot preserve a Widget instance.

Add a thin `createSandboxSession(options)` API that:

- keeps one Worker alive until `dispose()`,
- runs commands sequentially,
- reuses the sandbox shadow `globalThis` object between commands,
- still supports local fallback with `useWorker: false`,
- keeps `runSandboxCode` one-shot behavior unchanged.

The Widget adapter stores its live instance on the sandbox session `globalThis` shadow. This keeps user code inside the sandbox while allowing `session.mounted()` and `session.run(...)` to share one instance.

## Error Handling

- `executeWidgetRuntime` keeps the existing model-facing execution result behavior.
- Display session calls throw script errors to `BWidgetRuntime`, which marks the runtime as failed.
- `session.run(methodName)` throws when the public method does not exist or targets a TypeScript `private`/`protected` method.
- `session.dispose()` terminates the underlying sandbox session and prevents later calls.

## Tests

Add focused tests for:

- sandbox sessions preserving `globalThis` state across runs,
- widget sessions preserving instance state from `mounted()` to `run('buttonByClick')`,
- `onExecute` snapshot data hydrating a display session before `mounted()`,
- compatibility `runInteraction(code)` still working,
- `BWidgetRuntime` exposing both `run(methodName, ...args)` and `runInteraction(code)` to rendered elements,
- logger/console/patch behavior still flowing through the session host.

Final verification:

```bash
pnpm test test/utils/sandbox-core.test.ts test/components/BChat/widget-runtime.test.ts test/components/BWidget/widget-runtime-logger.test.ts test/components/BWidget/widget-runtime-view.component.test.ts test/components/BChat/use-runtime-tools.test.ts
pnpm lint
pnpm lint:style
pnpm exec tsc --noEmit
```
