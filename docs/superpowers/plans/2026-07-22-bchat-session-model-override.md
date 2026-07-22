# BChat Session Model Override Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让草稿态模型切换继续更新全局默认模型，而已有会话的模型切换仅在当前 `BChat` 生命周期内生效，并确保所有 ChatRuntime 请求实际使用对应会话模型。

**Architecture:** Renderer 侧由 `useModelSelection` 按 `activeSessionId` 维护临时模型覆盖，未覆盖时回退 `serviceModelStore.chatModel`。每次 Runtime 准备都把当前模型冻结到请求配置，主进程模型解析器优先解析该请求模型，没有请求模型时才读取全局 chat 默认配置。

**Tech Stack:** Vue 3 Composition API、TypeScript strict、Pinia、Vitest、Electron IPC、AI SDK v7

## Global Constraints

- 不执行 `git add`、`git commit`、`git commit --amend` 或自动提交；所有变更由用户自行检查和提交。
- 禁止使用 `any`；所有新增函数参数和返回值必须有明确类型。
- 新增或修改的函数、接口和复杂逻辑必须保留准确的文件头与 JSDoc 注释。
- B 开头组件继续使用全局自动引入；本次不修改 `InputToolbar.vue` 和 `ModelSelector.vue` 的 UI。
- 异步错误继续通过现有 `asyncTo` 路径归一化，不新增手写异步 `try/catch`。
- 不新增数据库字段，不把会话模型写入 Pinia session store，不持久化已有会话模型。
- 每个 Runtime 请求只传 `providerId` 与 `modelId`，Provider 密钥继续由主进程读取。
- 业务代码完成后更新 `changelog/2026-07-22.md`。

---

## File Map

- `src/components/BChat/hooks/useModelSelection.ts`：管理全局默认模型与会话级临时覆盖。
- `src/components/BChat/hooks/useChatComposer.ts`：把活动会话 ID 注入模型选择 hook。
- `src/components/BChat/index.vue`：同步 `activeSessionId` 到 composer，并把当前模型交给服务配置解析。
- `src/components/BCommandPanel/types.ts`：定义模型 scope 的可选调用方上下文。
- `src/stores/ui/commandPanel.ts`：在模块闭包中保存并清理模型上下文回调。
- `src/components/BCommandPanel/index.vue`：优先使用调用方模型上下文，无上下文时回退全局 store。
- `src/components/BChat/hooks/useChatServiceConfig.ts`：根据 UI 当前模型解析工具支持能力。
- `src/ai/chat/policies/runtimeRequest.ts`：把模型快照写入通用 Runtime 请求配置。
- `src/components/BChat/hooks/useRuntimeRequestConfig.ts`：从 `ServiceConfig` 构造模型快照。
- `src/components/BChat/hooks/useChatRuntime.ts`：允许 send、continue、compact、submit-user-choice IPC 传递模型。
- `src/components/BChat/hooks/useChatSubmitter.ts`：用户选择续跑配置包含模型快照。
- `types/chat-runtime.d.ts`：定义跨进程模型快照及四类 Runtime 输入字段。
- `electron/main/modules/chat/runtime/model/resolver.mts`：优先解析请求模型并保留全局回退。
- `electron/main/modules/chat/runtime/types.mts`：活动 Runtime 与依赖接口携带模型。
- `electron/main/modules/chat/runtime/runners/factory.mts`：把请求模型冻结到活动 Runtime。
- `electron/main/modules/chat/runtime/stream/index.mts`：普通模型流按活动 Runtime 模型解析。
- `electron/main/modules/chat/runtime/service.mts`：自动/手动压缩按活动 Runtime 模型解析。
- `test/components/BChat/*.test.ts`：renderer 状态与请求传递测试。
- `test/components/BCommandPanel/index.test.ts`、`test/stores/ui/command-panel.test.ts`：命令面板会话模型上下文测试。
- `test/ai/chat/runtime-request.test.ts`：请求策略模型快照测试。
- `test/electron/main/modules/chat/runtime/**/*.test.ts`：主进程解析、工厂、流执行和压缩测试。
- `changelog/2026-07-22.md`：用户可见变更记录。

---

### Task 1: Add Session-Scoped Renderer Model State

**Files:**
- Modify: `test/components/BChat/use-model-selection.test.ts`
- Modify: `src/components/BChat/hooks/useModelSelection.ts`
- Modify: `src/components/BChat/hooks/useChatComposer.ts`
- Modify: `src/components/BChat/index.vue`
- Test: `test/components/BChat/use-model-selection.test.ts`

**Interfaces:**
- Consumes: `SelectedModel` from `src/stores/ai/serviceModel.ts`; `activeSessionId: Readonly<Ref<string | null>>` from `useChatSessionRuntime`.
- Produces: `useModelSelection(activeSessionId): UseModelSelectionReturn`; `selectedModel`, `supportsVision`, and `contextWindow` derived from the active session override or global default.

- [ ] **Step 1: Extend the model-selection fixture and add failing behavior tests**

Replace the fixed provider fixture with a provider containing three enabled models, import `ref` and `vi`, then add these tests:

```typescript
/** 创建包含多个可切换模型的服务商测试数据。 */
function createProvider(options: { providerEnabled: boolean; disabledModelIds?: string[] }): AIProvider {
  const disabledModelIds = new Set(options.disabledModelIds ?? []);
  return {
    id: 'provider-1',
    name: 'Provider 1',
    description: 'Provider for tests',
    type: 'openai',
    isEnabled: options.providerEnabled,
    models: [
      { id: 'model-1', name: 'Model 1', type: 'chat', isEnabled: !disabledModelIds.has('model-1'), contextWindow: 128000, supportsVision: true },
      { id: 'model-2', name: 'Model 2', type: 'chat', isEnabled: !disabledModelIds.has('model-2'), contextWindow: 64000, supportsVision: false },
      { id: 'model-3', name: 'Model 3', type: 'chat', isEnabled: !disabledModelIds.has('model-3'), contextWindow: 32000, supportsVision: false }
    ]
  };
}

it('persists model changes only while no session is active', async (): Promise<void> => {
  const activeSessionId = ref<string | null>(null);
  const serviceModelStore = useServiceModelStore();
  const providerStore = useProviderStore();
  serviceModelStore.chatModel = { providerId: 'provider-1', modelId: 'model-1' };
  providerStore.providers = [createProvider({ providerEnabled: true })];
  const setChatModel = vi.spyOn(serviceModelStore, 'setChatModel').mockImplementation(async (model): Promise<void> => {
    serviceModelStore.chatModel = model;
  });
  const modelSelection = useModelSelection(activeSessionId);

  await modelSelection.onModelChange({ providerId: 'provider-1', modelId: 'model-2' });

  expect(setChatModel).toHaveBeenCalledOnce();
  expect(serviceModelStore.chatModel).toEqual({ providerId: 'provider-1', modelId: 'model-2' });
});

it('keeps existing-session model changes out of the service model store', async (): Promise<void> => {
  const activeSessionId = ref<string | null>('session-1');
  const serviceModelStore = useServiceModelStore();
  const providerStore = useProviderStore();
  serviceModelStore.chatModel = { providerId: 'provider-1', modelId: 'model-1' };
  providerStore.providers = [createProvider({ providerEnabled: true })];
  const setChatModel = vi.spyOn(serviceModelStore, 'setChatModel');
  const modelSelection = useModelSelection(activeSessionId);

  await modelSelection.onModelChange({ providerId: 'provider-1', modelId: 'model-2' });

  expect(setChatModel).not.toHaveBeenCalled();
  expect(serviceModelStore.chatModel).toEqual({ providerId: 'provider-1', modelId: 'model-1' });
  expect(modelSelection.selectedModel.value).toEqual({ providerId: 'provider-1', modelId: 'model-2' });
  expect(modelSelection.contextWindow.value).toBe(64000);
  expect(modelSelection.supportsVision.value).toBe(false);
});

it('isolates temporary model choices by session and returns to the global draft model', async (): Promise<void> => {
  const activeSessionId = ref<string | null>('session-1');
  const serviceModelStore = useServiceModelStore();
  const providerStore = useProviderStore();
  serviceModelStore.chatModel = { providerId: 'provider-1', modelId: 'model-1' };
  providerStore.providers = [createProvider({ providerEnabled: true })];
  const modelSelection = useModelSelection(activeSessionId);

  await modelSelection.onModelChange({ providerId: 'provider-1', modelId: 'model-2' });
  activeSessionId.value = 'session-2';
  await modelSelection.onModelChange({ providerId: 'provider-1', modelId: 'model-3' });
  expect(modelSelection.selectedModel.value?.modelId).toBe('model-3');

  activeSessionId.value = 'session-1';
  expect(modelSelection.selectedModel.value?.modelId).toBe('model-2');

  activeSessionId.value = null;
  expect(modelSelection.selectedModel.value?.modelId).toBe('model-1');
});
```

Update the three existing tests exactly as follows: call `useModelSelection(ref<string | null>(null))`; use `createProvider({ providerEnabled: false })` for the disabled Provider case; use `createProvider({ providerEnabled: true, disabledModelIds: ['model-1'] })` for the disabled model case; and use `createProvider({ providerEnabled: true })` for the enabled case.

- [ ] **Step 2: Run the focused test and verify the new cases fail**

Run:

```bash
pnpm exec vitest run test/components/BChat/use-model-selection.test.ts
```

Expected: FAIL because `useModelSelection` does not accept `activeSessionId`, and existing-session changes still call `setChatModel`.

- [ ] **Step 3: Implement the session override map in `useModelSelection`**

Add an explicit return interface and derive the model from a per-instance map:

```typescript
import type { AIProviderModel } from 'types/ai';
import type { ComputedRef, Ref } from 'vue';
import { computed, shallowRef } from 'vue';
import type { SelectedModel } from '@/stores/ai/serviceModel';

/** 模型选择 hook 返回值。 */
interface UseModelSelectionReturn {
  /** 当前可用模型。 */
  selectedModel: ComputedRef<SelectedModel | undefined>;
  /** 当前模型是否支持视觉输入。 */
  supportsVision: ComputedRef<boolean>;
  /** 当前模型上下文窗口。 */
  contextWindow: ComputedRef<number>;
  /** 加载全局 chat 默认模型。 */
  loadSelectedModel: () => Promise<void>;
  /** 切换当前草稿或会话模型。 */
  onModelChange: (model: SelectedModel) => Promise<void>;
}

export function useModelSelection(activeSessionId: Readonly<Ref<string | null>>): UseModelSelectionReturn {
  const serviceModelStore = useServiceModelStore();
  const providerStore = useProviderStore();
  const sessionModels = shallowRef<Record<string, SelectedModel>>({});

  /** 当前草稿或会话应使用的模型标识。 */
  const sourceModel = computed<SelectedModel | undefined>((): SelectedModel | undefined => {
    const sessionId = activeSessionId.value;
    return sessionId ? sessionModels.value[sessionId] ?? serviceModelStore.chatModel : serviceModelStore.chatModel;
  });

  const currentModelConfig = computed<AIProviderModel | undefined>((): AIProviderModel | undefined => {
    const model = sourceModel.value;
    if (!model) return undefined;
    const provider = providerStore.providers.find((item) => item.id === model.providerId);
    if (!provider?.isEnabled) return undefined;
    return provider.models?.find((item) => item.id === model.modelId && item.isEnabled);
  });

  const selectedModel = computed<SelectedModel | undefined>((): SelectedModel | undefined => {
    const model = sourceModel.value;
    return model && currentModelConfig.value ? model : undefined;
  });

  async function onModelChange(model: SelectedModel): Promise<void> {
    const sessionId = activeSessionId.value;
    if (!sessionId) {
      await serviceModelStore.setChatModel(model);
      return;
    }

    sessionModels.value = { ...sessionModels.value, [sessionId]: model };
  }
}
```

Keep `loadSelectedModel` and the return object. Update the remaining computed values to explicit callbacks:

```typescript
const supportsVision = computed<boolean>((): boolean => currentModelConfig.value?.supportsVision === true);
const contextWindow = computed<number>((): number => currentModelConfig.value?.contextWindow ?? 200000);
```

- [ ] **Step 4: Wire the active session into composer and `BChat`**

Add this field to `UseChatComposerOptions` and pass it into `useModelSelection`:

```typescript
/** 当前活动会话 ID；空值表示草稿。 */
activeSessionId: Readonly<Ref<string | null>>;

const model = useModelSelection(options.activeSessionId);
```

In `BChat/index.vue`, create a bridge ref before composer initialization, pass it to composer, and synchronize the authoritative runtime ID immediately after `activeSessionId` is available:

```typescript
/** 模型选择使用的活动会话 ID，包含首轮发送后创建但尚未由宿主回写的会话。 */
const modelSessionId = ref<string | null>(props.sessionId);

const composer = useChatComposer({
  containerRef,
  promptEditorRef,
  interactionAPI,
  openFile,
  openSkill,
  activeSessionId: modelSessionId
});

watch(
  activeSessionId,
  (sessionId: string | null): void => {
    modelSessionId.value = sessionId;
  },
  { immediate: true }
);
```

Place the watcher directly after destructuring `activeSessionId` from `sessionRuntime`, before hooks that consume the model.

- [ ] **Step 5: Re-run the model-selection test**

Run:

```bash
pnpm exec vitest run test/components/BChat/use-model-selection.test.ts test/components/BChat/session-id-runtime.test.ts
```

Expected: PASS. `session-id-runtime.test.ts` confirms the `BChat` setup changes preserve draft promotion and active-session behavior.

---

### Task 2: Route the `/model` Command Panel Through the Same Session Selector

**Files:**
- Modify: `src/components/BCommandPanel/types.ts`
- Modify: `src/stores/ui/commandPanel.ts`
- Modify: `src/components/BCommandPanel/index.vue`
- Modify: `src/components/BChat/index.vue`
- Modify: `test/stores/ui/command-panel.test.ts`
- Modify: `test/components/BCommandPanel/index.test.ts`
- Modify: `test/components/BChat/command-panel-model-entry.test.ts`

**Interfaces:**
- Consumes: `selectedModel` and `modelSelectionEvents.onModelChange` from Task 1.
- Produces: `CommandPanelModelContext`; `OpenModelCommandPanelOptions`; store actions `getContextModel()` and `changeContextModel(model)`.

- [ ] **Step 1: Add failing command-panel context tests**

Add this Store test:

```typescript
it('uses and clears the caller model context', async (): Promise<void> => {
  const store = useCommandPanelStore();
  const onModelChange = vi.fn<(_model: { providerId: string; modelId: string }) => Promise<void>>().mockResolvedValue(undefined);
  const currentModel = { providerId: 'provider-1', modelId: 'model-2' };

  store.openModel({
    modelContext: {
      getCurrentModel: () => currentModel,
      onModelChange
    }
  });

  expect(store.getContextModel()).toEqual(currentModel);
  await expect(store.changeContextModel({ providerId: 'provider-1', modelId: 'model-3' })).resolves.toBe(true);
  expect(onModelChange).toHaveBeenCalledWith({ providerId: 'provider-1', modelId: 'model-3' });

  store.close();
  expect(store.getContextModel()).toBeUndefined();
  await expect(store.changeContextModel(currentModel)).resolves.toBe(false);
});
```

Import `CommandPanelModelContext`, replace the `openPanel` helper with this exact signature, then add the test below:

```typescript
async function openPanel(scope: CommandPanelScope, onClose?: () => void, modelContext?: CommandPanelModelContext): Promise<void> {
  const commandPanelStore = useCommandPanelStore();
  if (scope === 'model') {
    commandPanelStore.openModel({ onClose, modelContext });
  } else {
    commandPanelStore.openRecent({ onClose });
  }

  await nextTick();
  await flushPromises();
}
```

```typescript
it('uses a caller model context instead of the global service model store', async (): Promise<void> => {
  const onModelChange = vi.fn<(_model: { providerId: string; modelId: string }) => Promise<void>>().mockResolvedValue(undefined);
  setChatModelMock.mockClear();
  const wrapper = mountCommandPanel();
  await openPanel('model', undefined, {
    getCurrentModel: () => ({ providerId: 'openai', modelId: 'gpt-4.1' }),
    onModelChange
  });

  const items = wrapper.findAll('.b-command-panel__item');
  expect(items[1].classes()).toContain('is-active');
  await items[0].trigger('click');
  await flushPromises();

  expect(onModelChange).toHaveBeenCalledWith({ providerId: 'openai', modelId: 'gpt-4o' });
  expect(setChatModelMock).not.toHaveBeenCalled();
});
```

In `command-panel-model-entry.test.ts`, add these source assertions so BChat cannot regress to opening a context-free model panel:

```typescript
expect(chatSource).toContain('modelContext: {');
expect(chatSource).toContain('getCurrentModel: (): SelectedModel | undefined => selectedModel.value');
expect(chatSource).toContain('onModelChange: modelSelectionEvents.onModelChange');
```

- [ ] **Step 2: Run the command-panel tests and verify they fail**

Run:

```bash
pnpm exec vitest run test/stores/ui/command-panel.test.ts test/components/BCommandPanel/index.test.ts test/components/BChat/command-panel-model-entry.test.ts
```

Expected: FAIL because model-scope caller context is not yet defined or consumed.

- [ ] **Step 3: Define the model context and model-specific open options**

Add these types to `src/components/BCommandPanel/types.ts`:

```typescript
import type { SelectedModel } from '@/stores/ai/serviceModel';

/** 模型 scope 的调用方运行时上下文。 */
export interface CommandPanelModelContext {
  /** 读取调用方当前模型。 */
  getCurrentModel: () => SelectedModel | undefined;
  /** 使用调用方规则切换模型。 */
  onModelChange: (model: SelectedModel) => Promise<void>;
}

/** 模型命令面板打开参数。 */
export interface OpenModelCommandPanelOptions extends OpenCommandPanelOptions {
  /** 可选的调用方模型上下文；缺失时使用全局默认模型。 */
  modelContext?: CommandPanelModelContext;
}
```

- [ ] **Step 4: Store runtime callbacks outside Pinia state and clear them on close**

In `src/stores/ui/commandPanel.ts`, add a module-closure `modelContext`, clear it whenever `open()` resets scope and after `close()`, then expose these actions:

```typescript
/** 命令面板本次打开使用的模型上下文，不进入 Pinia state。 */
let modelContext: CommandPanelModelContext | undefined;

/** 更新本次模型 scope 的调用方上下文。 */
function setModelContext(context?: CommandPanelModelContext): void {
  modelContext = context;
}

open(scope: CommandPanelScope, options: OpenCommandPanelOptions = {}): void {
  this.scope = scope;
  this.keyword = '';
  this.visible = true;
  setCloseCallback(options.onClose);
  setModelContext(undefined);
},

openModel(options: OpenModelCommandPanelOptions = {}): void {
  this.open('model', options);
  setModelContext(options.modelContext);
},

getContextModel(): SelectedModel | undefined {
  return modelContext?.getCurrentModel();
},

async changeContextModel(model: SelectedModel): Promise<boolean> {
  if (!modelContext) return false;
  await modelContext.onModelChange(model);
  return true;
},
```

Import `CommandPanelModelContext`, `OpenModelCommandPanelOptions`, and `SelectedModel` as type-only imports. Replace `close()` with the following body so runtime callbacks are released after the one-shot close callback:

```typescript
close(): void {
  if (!this.visible) return;

  this.visible = false;
  this.keyword = '';
  runCloseCallback();
  setModelContext(undefined);
}
```

- [ ] **Step 5: Make `BCommandPanel` prefer the caller context**

Replace only the model source's current-model and change-model dependencies:

```typescript
setChatModel: async (model: SelectedModel): Promise<void> => {
  const handled = await commandPanelStore.changeContextModel(model);
  if (!handled) await serviceModelStore.setChatModel(model);
},
getCurrentModel: (): SelectedModel | undefined => commandPanelStore.getContextModel() ?? serviceModelStore.chatModel,
```

Import `SelectedModel` as a type in `BCommandPanel/index.vue`. Keep `loadChatModel`, Provider loading, available model groups, and icon rendering unchanged. This preserves global command-panel behavior when no `BChat` context exists.

- [ ] **Step 6: Pass the BChat model context when opening `/model`**

Update `openModelCommandPanel` in `BChat/index.vue`:

```typescript
function openModelCommandPanel(): void {
  commandPanelStore.openModel({
    modelContext: {
      getCurrentModel: (): SelectedModel | undefined => selectedModel.value,
      onModelChange: modelSelectionEvents.onModelChange
    },
    onClose: (): void => promptEditorRef.value?.focus()
  });
}
```

Import `SelectedModel` as a type from `@/stores/ai/serviceModel`. Both the `/model` slash command and the no-model toast already call `openModelCommandPanel`, so both paths receive the same context.

- [ ] **Step 7: Re-run the command-panel and model-selection tests**

Run:

```bash
pnpm exec vitest run test/stores/ui/command-panel.test.ts test/components/BCommandPanel/index.test.ts test/components/BChat/command-panel-model-entry.test.ts test/components/BChat/use-model-selection.test.ts
```

Expected: PASS. The pre-existing context-free model selection test must still call `setChatModelMock`, proving global fallback remains intact.

---

### Task 3: Resolve Runtime Capabilities from the Current UI Model

**Files:**
- Modify: `test/components/BChat/use-chat-service-config.test.ts`
- Modify: `src/components/BChat/hooks/useChatServiceConfig.ts`
- Modify: `src/components/BChat/index.vue`
- Test: `test/components/BChat/use-chat-service-config.test.ts`

**Interfaces:**
- Consumes: `selectedModel: Readonly<Ref<SelectedModel | undefined>>` from Task 1.
- Produces: `resolveServiceConfig(): Promise<ServiceConfig | undefined>` using exactly the current UI model rather than re-reading global storage.

- [ ] **Step 1: Replace storage-based service-config tests with selected-model tests**

Remove the `useServiceModelStore` mock and add these cases:

```typescript
import type { SelectedModel } from '@/stores/ai/serviceModel';
import { ref } from 'vue';

it('returns undefined when the current UI model is missing', async (): Promise<void> => {
  const selectedModel = ref<SelectedModel>();
  const serviceConfig = useChatServiceConfig(selectedModel);

  await expect(serviceConfig.resolveServiceConfig()).resolves.toBeUndefined();
  expect(getModelToolSupportMock).not.toHaveBeenCalled();
});

it('resolves tool support from the current UI model', async (): Promise<void> => {
  const selectedModel = ref<SelectedModel>({ providerId: 'provider-1', modelId: 'model-2' });
  getModelToolSupportMock.mockResolvedValue({ supported: true });
  const serviceConfig = useChatServiceConfig(selectedModel);

  await expect(serviceConfig.resolveServiceConfig()).resolves.toEqual({
    providerId: 'provider-1',
    modelId: 'model-2',
    toolSupport: { supported: true }
  });
  expect(getModelToolSupportMock).toHaveBeenCalledWith('provider-1', 'model-2');
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm exec vitest run test/components/BChat/use-chat-service-config.test.ts
```

Expected: FAIL because `useChatServiceConfig` has no selected-model parameter and still reads the global service-model store.

- [ ] **Step 3: Implement selected-model service resolution**

Replace the store dependency with the selected-model ref:

```typescript
import type { SelectedModel } from '@/stores/ai/serviceModel';
import type { Ref } from 'vue';

/** Chat 服务配置 hook 返回值。 */
interface UseChatServiceConfigReturn {
  /** 解析当前 UI 模型及其工具支持能力。 */
  resolveServiceConfig: () => Promise<ServiceConfig | undefined>;
}

export function useChatServiceConfig(selectedModel: Readonly<Ref<SelectedModel | undefined>>): UseChatServiceConfigReturn {
  async function resolveServiceConfig(): Promise<ServiceConfig | undefined> {
    const model = selectedModel.value;
    if (!model) return undefined;

    const toolSupport = await getModelToolSupport(model.providerId, model.modelId);
    return { providerId: model.providerId, modelId: model.modelId, toolSupport };
  }

  return { resolveServiceConfig };
}
```

Update `BChat/index.vue`:

```typescript
const chatServiceConfig = useChatServiceConfig(selectedModel);
```

- [ ] **Step 4: Re-run both renderer model tests**

Run:

```bash
pnpm exec vitest run test/components/BChat/use-model-selection.test.ts test/components/BChat/use-chat-service-config.test.ts
```

Expected: PASS.

---

### Task 4: Carry a Frozen Model Snapshot Through Every Renderer Runtime Command

**Files:**
- Modify: `types/chat-runtime.d.ts`
- Modify: `src/ai/chat/policies/runtimeRequest.ts`
- Modify: `src/components/BChat/hooks/useRuntimeRequestConfig.ts`
- Modify: `src/components/BChat/hooks/useChatRuntime.ts`
- Modify: `src/components/BChat/hooks/useChatSubmitter.ts`
- Modify: `test/ai/chat/runtime-request.test.ts`
- Modify: `test/components/BChat/use-runtime-request-config.test.ts`
- Modify: `test/components/BChat/use-chat-runtime.test.ts`
- Modify: `test/components/BChat/use-chat-submitter.test.ts`

**Interfaces:**
- Consumes: `ServiceConfig.providerId` and `ServiceConfig.modelId` from Task 3.
- Produces: `ChatRuntimeModelSelection`; optional `model` on send, continue, compact, and submit-user-choice inputs; `ChatRuntimeRequestConfig.model` frozen during request preparation.

- [ ] **Step 1: Add failing request-policy and preparation assertions**

In `test/ai/chat/runtime-request.test.ts`, include a model in the first policy input and expected config:

```typescript
model: { providerId: 'provider-1', modelId: 'model-2' },
```

```typescript
expect(result.config.model).toEqual({ providerId: 'provider-1', modelId: 'model-2' });
```

Also add `model: { providerId: 'provider-1', modelId: 'model-2' }` to the second `buildRuntimeRequestConfig` input, because `RuntimeRequestPolicyInput.model` is required for every prepared request.

Add the same assertion to the first `useRuntimeRequestConfig` test:

```typescript
expect(prepared?.config.model).toEqual({ providerId: 'provider', modelId: 'model' });
```

- [ ] **Step 2: Run the request-config tests and verify they fail**

Run:

```bash
pnpm exec vitest run test/ai/chat/runtime-request.test.ts test/components/BChat/use-runtime-request-config.test.ts
```

Expected: FAIL because `RuntimeRequestPolicyInput` and `ChatRuntimeRequestConfig` do not contain `model`.

- [ ] **Step 3: Define the shared Runtime model type and input fields**

Add this type near `ChatRuntimeUserInputPart` in `types/chat-runtime.d.ts`:

```typescript
/** Renderer-selected model identity frozen for one Runtime. */
export interface ChatRuntimeModelSelection {
  /** Provider stable identifier. */
  readonly providerId: string;
  /** Model identifier within the provider. */
  readonly modelId: string;
}
```

Add this field to `ChatRuntimeSendInput`, `ChatRuntimeContinueInput`, `ChatRuntimeCompactInput`, and `ChatRuntimeSubmitUserChoiceInput`:

```typescript
/** Model selected for this Runtime; falls back to the global chat model when omitted. */
model?: ChatRuntimeModelSelection;
```

- [ ] **Step 4: Add the model to the pure request policy**

Update `ChatRuntimeRequestConfig`, `RuntimeRequestPolicyInput`, and the config result:

```typescript
export type ChatRuntimeRequestConfig = Pick<
  ChatRuntimeSendInput,
  'model' | 'contextWindow' | 'system' | 'workspaceRoot' | 'tools' | 'skillContentHashes' | 'runtimeContext' | 'tavily' | 'mcp' | 'capabilities'
>;

/** 当前 Runtime 使用的模型标识。 */
model: ChatRuntimeModelSelection;

config: {
  model: input.model,
  contextWindow: input.contextWindow,
  system: input.system,
  workspaceRoot: input.workspaceRoot,
  tools: input.toolSupport ? toTransportTools(rendererTools) : undefined,
  skillContentHashes: input.skillContentHashes,
  runtimeContext: input.runtimeContext,
  tavily: input.tavily,
  mcp: input.mcp
}
```

Import `ChatRuntimeModelSelection` from `types/chat-runtime` and pass the resolved service model in `useRuntimeRequestConfig`:

```typescript
const result = buildRuntimeRequestConfig({
  model: { providerId: serviceConfig.providerId, modelId: serviceConfig.modelId },
  contextWindow: options.contextWindow.value,
  system,
  workspaceRoot: options.workspaceRoot.value || undefined,
  candidateTools: serviceConfig.toolSupport.supported ? options.getActiveTools() : [],
  toolSupport: serviceConfig.toolSupport.supported,
  memoryMode: memorySelection?.mode,
  skillContentHashes: options.getSkillContentHashes(),
  runtimeContext,
  tavily: options.resolveRuntimeTavilyConfig(),
  mcp: options.resolveRuntimeMcpRequestConfig()
});
```

- [ ] **Step 5: Extend all renderer IPC config picks**

Add `'model'` to these type picks:

```typescript
// useChatRuntime.ts
export type BChatRuntimeSendInput = Pick<ChatRuntimeSendInput, 'runtimeId' | 'sessionId' | 'content' | 'parts' | 'files' | 'userMessageId' | 'userMessageCreatedAt' | 'model' | 'contextWindow' | 'system' | 'workspaceRoot' | 'tools' | 'skillContentHashes' | 'runtimeContext' | 'tavily' | 'mcp' | 'capabilities'>;

export type BChatRuntimeContinueInput = Pick<ChatRuntimeContinueInput, 'runtimeId' | 'sessionId' | 'model' | 'contextWindow' | 'system' | 'workspaceRoot' | 'tools' | 'skillContentHashes' | 'runtimeContext' | 'tavily' | 'mcp' | 'capabilities'> & {
  /** renderer 消息列表，发送到主进程前转换为纯快照。 */
  messages: Message[];
};

export type BChatRuntimeSubmitUserChoiceInput = Pick<ChatRuntimeSubmitUserChoiceInput, 'runtimeId' | 'sessionId' | 'model' | 'contextWindow' | 'system' | 'workspaceRoot' | 'tools' | 'skillContentHashes' | 'runtimeContext' | 'tavily' | 'mcp' | 'capabilities' | 'answer'>;
```

`BChatRuntimeCompactInput` already uses `Omit<ChatRuntimeCompactInput, 'clientId' | 'agentId'>`, so it receives `model` automatically.

Add `'model'` to the local `ChatRuntimeRequestConfig` pick in `useChatSubmitter.ts`. Existing `...runtimeConfig` spreads then carry the model through normal send, regeneration, user-choice continuation, and manual compaction without additional branching.

- [ ] **Step 6: Add IPC and user-choice propagation assertions**

Pass `model: { providerId: 'provider-1', modelId: 'model-2' }` into each `send`, `continueTurn`, `compact`, and `submitUserChoice` call in `use-chat-runtime.test.ts`, then assert each captured Electron input has the same `model` object.

In `use-chat-submitter.test.ts`, change the prepared config and add an assertion:

```typescript
config: {
  model: { providerId: 'provider-1', modelId: 'model-2' },
  contextWindow: 12_000
},
```

```typescript
expect(submitUserChoice).toHaveBeenCalledWith(
  expect.objectContaining({
    runtimeId: 'runtime-choice',
    sessionId: 'session-1',
    model: { providerId: 'provider-1', modelId: 'model-2' }
  })
);
```

- [ ] **Step 7: Run all renderer request tests**

Run:

```bash
pnpm exec vitest run test/ai/chat/runtime-request.test.ts test/components/BChat/use-runtime-request-config.test.ts test/components/BChat/use-chat-runtime.test.ts test/components/BChat/use-chat-submitter.test.ts
```

Expected: PASS, including model propagation for all four Runtime commands.

---

### Task 5: Resolve and Freeze the Requested Model in the Main Process

**Files:**
- Modify: `electron/main/modules/chat/runtime/model/resolver.mts`
- Modify: `electron/main/modules/chat/runtime/types.mts`
- Modify: `electron/main/modules/chat/runtime/runners/factory.mts`
- Modify: `electron/main/modules/chat/runtime/stream/index.mts`
- Modify: `electron/main/modules/chat/runtime/service.mts`
- Modify: `test/electron/main/modules/chat/runtime/chat-model-resolver.test.ts`
- Create: `test/electron/main/modules/chat/runtime/factory.test.ts`
- Modify: `test/electron/main/modules/chat/runtime/stream/executor.test.ts`
- Modify: `test/electron/main/modules/chat/runtime/service.test.ts`

**Interfaces:**
- Consumes: `ChatRuntimeModelSelection` from Task 4.
- Produces: `ChatModelResolver.resolve(model?)`; `ActiveChatRuntime.model`; model-aware stream and compaction resolution.

- [ ] **Step 1: Add failing resolver precedence tests**

Add these cases to `chat-model-resolver.test.ts`:

```typescript
it('prefers an explicit runtime model without reading the global chat model', async (): Promise<void> => {
  const getChatModelConfig = vi.fn().mockResolvedValue({ providerId: 'global', modelId: 'global-model' });
  const getProvider = vi.fn().mockResolvedValue({
    id: 'session-provider',
    name: 'Session Provider',
    description: 'Session provider',
    type: 'anthropic',
    isEnabled: true,
    apiKey: 'session-key',
    models: [{ id: 'session-model', name: 'Session Model', type: 'chat', isEnabled: true }]
  } satisfies AIProvider);
  const resolver = createChatModelResolver({ getChatModelConfig, getProvider });

  const result = await resolver.resolve({ providerId: 'session-provider', modelId: 'session-model' });

  expect(getChatModelConfig).not.toHaveBeenCalled();
  expect(getProvider).toHaveBeenCalledWith('session-provider');
  expect(result?.modelId).toBe('session-model');
  expect(result?.createOptions.providerId).toBe('session-provider');
});

it('does not fall back when an explicit runtime model is invalid', async (): Promise<void> => {
  const getChatModelConfig = vi.fn().mockResolvedValue({ providerId: 'global', modelId: 'global-model' });
  const resolver = createChatModelResolver({ getChatModelConfig, getProvider: vi.fn().mockResolvedValue(null) });

  await expect(resolver.resolve({ providerId: 'missing', modelId: 'missing-model' })).resolves.toBeNull();
  expect(getChatModelConfig).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the resolver test and verify it fails**

Run:

```bash
pnpm exec vitest run test/electron/main/modules/chat/runtime/chat-model-resolver.test.ts
```

Expected: FAIL because `ChatModelResolver.resolve` currently takes no model argument.

- [ ] **Step 3: Implement explicit-model precedence in the resolver**

Import `ChatRuntimeModelSelection`, update the interface, and select the source before Provider validation:

```typescript
import type { ChatRuntimeModelSelection } from 'types/chat-runtime';

export interface ChatModelResolver {
  /**
   * 解析 chat 模型调用配置。
   * @param model - 可选的 Runtime 显式模型；缺失时读取全局默认模型
   * @returns chat 模型配置，不可用时返回 null
   */
  resolve(model?: ChatRuntimeModelSelection): Promise<ChatModelResolution | null>;
}

async resolve(model?: ChatRuntimeModelSelection): Promise<ChatModelResolution | null> {
  const config = model ?? (await dependencies.getChatModelConfig());
  if (!config?.providerId || !config.modelId) return null;

  const provider = await dependencies.getProvider(config.providerId);
  if (!provider?.isEnabled || !hasEnabledModel(provider, config.modelId)) return null;

  return {
    createOptions: {
      providerId: provider.id,
      providerName: provider.name,
      apiKey: provider.apiKey ?? '',
      baseUrl: provider.baseUrl ?? '',
      providerType: provider.type
    },
    modelId: config.modelId
  };
}
```

- [ ] **Step 4: Add failing factory and stream tests**

Create `test/electron/main/modules/chat/runtime/factory.test.ts` with a focused test that asserts all four factories copy the model:

```typescript
/**
 * @file factory.test.ts
 * @description ChatRuntime 工厂冻结请求模型测试。
 */
import type { ChatRuntimeCompactInput, ChatRuntimeContinueInput, ChatRuntimeSendInput, ChatRuntimeSubmitUserChoiceInput } from 'types/chat-runtime';
import { describe, expect, it } from 'vitest';
import { createCompactRuntime, createContinuationRuntime, createSendRuntime, createUserChoiceRuntime } from '../../../../../../electron/main/modules/chat/runtime/runners/factory.mjs';

const model = { providerId: 'provider-1', modelId: 'model-2' };
const base = { clientId: 'client-1', agentId: 'primary', model };

describe('runtime factories', (): void => {
  it('copies the requested model into every active runtime', (): void => {
    const send = createSendRuntime({ ...base, runtimeId: 'send', content: 'hello' } satisfies ChatRuntimeSendInput, 'send', 'session-1');
    const continuation = createContinuationRuntime({ ...base, runtimeId: 'continue', sessionId: 'session-1', messages: [] } satisfies ChatRuntimeContinueInput, 'continue');
    const compact = createCompactRuntime({ ...base, runtimeId: 'compact', sessionId: 'session-1' } satisfies ChatRuntimeCompactInput, 'compact');
    const choice = createUserChoiceRuntime(
      {
        ...base,
        runtimeId: 'choice',
        sessionId: 'session-1',
        answer: { questionId: 'question-1', toolCallId: 'tool-1', answers: ['yes'] }
      } satisfies ChatRuntimeSubmitUserChoiceInput,
      'choice'
    );

    expect([send.model, continuation.model, compact.model, choice.model]).toEqual([model, model, model, model]);
  });
});
```

In `stream/executor.test.ts`, add a test using `{ ...runtime, model }` and assert `resolve` receives that model:

```typescript
expect(resolve).toHaveBeenCalledWith({ providerId: 'provider-1', modelId: 'model-2' });
```

- [ ] **Step 5: Add model state and use it in stream resolution**

Update `ActiveChatRuntime` and the service dependency:

```typescript
/** Renderer 在本 Runtime 启动时冻结的模型标识。 */
model?: ChatRuntimeModelSelection;

/** 解析指定 Runtime 模型，缺失时回退全局默认模型。 */
resolveModel: (model?: ChatRuntimeModelSelection) => Promise<ChatModelResolution | null>;
```

Import `ChatRuntimeModelSelection` from `types/chat-runtime` in `types.mts`; keep `ChatModelResolution` imported from the existing resolver module.

Add `'model'` to `RuntimeBaseState` in `runners/factory.mts` and copy it in `createRuntimeBase`:

```typescript
model: input.model,
```

Change the stream executor resolution in `stream/index.mts`:

```typescript
const resolution = runtime.resolvedModel ?? (await dependencies.resolver.resolve(runtime.model));
```

- [ ] **Step 6: Make context compaction use the same Runtime model**

Update the default resolver adapter and both service call sites:

```typescript
const resolveModel =
  dependencies.resolveModel ??
  ((model?: ChatRuntimeModelSelection): Promise<ChatModelResolution | null> => requestModelResolver.resolve(model));
```

```typescript
const [resolutionResult] = await Promise.allSettled([resolveModel(runtime.model)]);
```

Import `ChatRuntimeModelSelection` and `ChatModelResolution` as types. Apply the call above in both `prepareContextBeforeDeadline` and `runManualCompaction`. Keep `autoNameResolver` unchanged because auto naming remains an application-level operation using the global default model.

- [ ] **Step 7: Add service assertions for automatic and manual compaction model resolution**

In the existing automatic and manual compaction tests, change `resolveModel` to a spy accepting the optional model, pass `model` in the send/compact input, and assert:

```typescript
expect(resolveModel).toHaveBeenCalledWith({ providerId: 'provider-1', modelId: 'model-2' });
```

Use the automatic compaction test near `automatically compacts before the first model request` and the manual test near `manually compacts into a compaction-only assistant message`, so the assertions exercise both service paths rather than only the factory.

- [ ] **Step 8: Run the main-process model tests**

Run:

```bash
pnpm exec vitest run test/electron/main/modules/chat/runtime/chat-model-resolver.test.ts test/electron/main/modules/chat/runtime/factory.test.ts test/electron/main/modules/chat/runtime/stream/executor.test.ts test/electron/main/modules/chat/runtime/service.test.ts
```

Expected: PASS. The full service test may take longer, but it must confirm no compaction or user-choice behavior regressed.

---

### Task 6: Record the Change and Run Repository Verification

**Files:**
- Modify: `changelog/2026-07-22.md`
- Verify: all files modified in Tasks 1-4

**Interfaces:**
- Consumes: completed renderer and main-process implementation from Tasks 1-5.
- Produces: changelog entry and verification evidence; no Git staging or commit.

- [ ] **Step 1: Add the changelog entry**

Append this bullet under `## Changed` in `changelog/2026-07-22.md`:

```markdown
- 调整 `BChat` 模型切换边界：新会话草稿继续更新全局默认模型，已有会话改为按会话维护内存临时模型，工具栏与 `/model` 命令面板复用同一切换入口，并将模型快照随发送、重新生成、用户选择续跑及上下文压缩请求传给主进程，避免不同会话互相覆盖默认模型。
```

- [ ] **Step 2: Run the complete focused test set**

Run:

```bash
pnpm exec vitest run \
  test/components/BChat/use-model-selection.test.ts \
  test/components/BChat/use-chat-service-config.test.ts \
  test/ai/chat/runtime-request.test.ts \
  test/components/BChat/use-runtime-request-config.test.ts \
  test/components/BChat/use-chat-runtime.test.ts \
  test/components/BChat/use-chat-submitter.test.ts \
  test/components/BChat/session-id-runtime.test.ts \
  test/components/BChat/command-panel-model-entry.test.ts \
  test/components/BCommandPanel/index.test.ts \
  test/stores/ui/command-panel.test.ts \
  test/electron/main/modules/chat/runtime/chat-model-resolver.test.ts \
  test/electron/main/modules/chat/runtime/factory.test.ts \
  test/electron/main/modules/chat/runtime/stream/executor.test.ts \
  test/electron/main/modules/chat/runtime/service.test.ts
```

Expected: all listed files PASS with zero failed tests.

- [ ] **Step 3: Run TypeScript checks for renderer and Electron**

Run:

```bash
pnpm exec tsc --noEmit
pnpm exec tsc -p electron/tsconfig.json --noEmit
```

Expected: both commands exit with code 0 and no TypeScript diagnostics.

- [ ] **Step 4: Run lint checks**

Run:

```bash
pnpm lint
pnpm lint:style
```

Expected: both commands exit with code 0. Review any auto-fixes from `pnpm lint` before continuing.

- [ ] **Step 5: Run the full test suite**

Run:

```bash
pnpm test
```

Expected: all repository Vitest suites PASS.

- [ ] **Step 6: Review the final working tree without staging or committing**

Run:

```bash
git diff --check
git status --short
git diff --stat
```

Expected: `git diff --check` prints nothing; `git status --short` lists only the intended spec amendment, plan, changelog, source, and test files. Stop after reporting the diff and verification results; do not run any Git staging or commit command.
