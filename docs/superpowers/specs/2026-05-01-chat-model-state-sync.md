# chat 模型状态同步方案

## 问题

`ModelModal` 编辑模型能力（如 `supportsVision`）后，`useModelSelection` 中的 `supportsVision` 不会更新。

### 根因

```
useModelSelection.ts 的 watch 只监听 selectedModel 字符串 "providerId:modelId"
                     ↓
编辑模型能力时，selectedModel 字符串不变
                     ↓
watch 不触发 → supportsVision 保持旧值
```

## 方案：service-model store 集中管理 chatModel

### 整体架构

```
  SQLite 层 ── serviceModelsStorage (getConfig / saveConfig)
                        │
  store 层               │
  ┌──────────────────────│──────────────────────────────┐
  │  service-model store │                              │
  │  chatModel           │  唯一入口                     │
  │  { providerId,       │                              │
  │    modelId }         │                              │
  │  loadChatModel()     │                              │
  │  setChatModel(model) │  乐观更新                     │
  └──────────────────────┴──────────────────────────────┘
  ┌─────────────────────────────────────────────────────┐
  │  providerStore.providers  (reactive)                │
  └─────────────────────────────────────────────────────┘
                         │                         │
                  useModelSelection ────────────────┘
                  computed() {
                    → selectedModel  从 service-model store 读
                    → supportsVision 从 providerStore 派生
                  }
```

**注意**：`useModelSelection` 是连接两个 store 的桥，两个 store 之间没有直接依赖。

**原则**：`ModelSelector` 不再直接操作 storage，统一走 store。

### 关键设计

`chatModel` 为结构化标识对象，`supportsVision` 从 **computed** 派生：

```ts
/** 选中的模型标识 */
interface SelectedModel {
  providerId: string;
  modelId: string;
}

/** service-model store */
chatModel: SelectedModel | undefined;

/** useModelSelection */
const supportsVision = computed(() => {
  const model = selectedModel.value;
  if (!model) return false;
  const provider = providerStore.providers.find((p) => p.id === model.providerId);
  const foundModel = provider?.models?.find((m) => m.id === model.modelId);
  return foundModel?.supportsVision === true;
});
```

- 切换模型时 → `chatModel` 变 → computed 重算 ✓
- 编辑能力时 → `providerStore.providers` 变 → computed 重算 ✓
- 无需 `parseSelectedModel`（不再需要解析字符串）
- 无需 watch、无需手动 refresh

### 初始化时机

`chatModel` 初始值为 `undefined`，`loadChatModel()` 在 `BChatSidebar` 组件 `onMounted` 时调用（通过 `useModelSelection.loadSelectedModel()` → `serviceModelStore.loadChatModel()`）。

在初始化完成前，`chatModel` 为 `undefined`，`supportsVision` computed 返回 `false`。这个初始状态可接受——侧边栏未挂载前没有消费者需要模型能力信息；挂载后立即完成加载。

如果未来有组件需要在侧边栏挂载前读取 `chatModel`，可在 `app.ts` 初始化阶段主动调用 `loadChatModel()`。本次不做此改动。

---

## 文件改动详情

### 1. `src/stores/service-model.ts`

```ts
import type { ModelServiceConfig, ModelServiceType } from 'types/model';
import { defineStore } from 'pinia';
import { serviceModelsStorage } from '@/shared/storage';
import { dispatchServiceModelUpdated } from '@/shared/storage/service-models/events';
import { local } from '@/shared/storage/base';

const STORAGE_KEY = 'service_model_settings';

/**
 * 选中的模型标识。
 */
interface SelectedModel {
  /** 服务商 ID */
  providerId: string;
  /** 模型 ID */
  modelId: string;
}

interface ServiceModelSettings {
  collapsedSections: Record<string, boolean>;
}

interface ServiceModelState {
  settings: ServiceModelSettings;
  /** 当前智能对话助手选中的模型标识 */
  chatModel: SelectedModel | undefined;
}

// ... loadSettings / saveSettings 不变

/** 持久化写入时的竞态保护版本号（模块级，不污染 state） */
let saveVersion = 0;

export const useServiceModelStore = defineStore('serviceModel', {
  state: (): ServiceModelState => ({
    settings: loadSettings(),
    chatModel: undefined
  }),

  actions: {
    // ... 现有 actions 不变（getServiceConfig、getAvailableServiceConfig 等）

    /**
     * 加载当前 chat 服务选中的模型。
     * 从 serviceModelsStorage 读取并写入 store 状态。
     */
    async loadChatModel(): Promise<void> {
      const config = await serviceModelsStorage.getConfig('chat');
      this.chatModel = config?.providerId && config?.modelId
        ? { providerId: config.providerId, modelId: config.modelId }
        : undefined;
    },

    /**
     * 设置当前 chat 服务选中的模型（乐观更新）。
     * 先更新 store 让 UI 立即响应，再异步持久化。
     * 版本号保证连续快速切换时只有最后一次完成事件。
     * @param model - 选中的模型标识
     */
    async setChatModel(model: SelectedModel): Promise<void> {
      const { providerId, modelId } = model;

      // 乐观更新
      this.chatModel = model;

      const version = ++saveVersion;
      await serviceModelsStorage.saveConfig('chat', { providerId, modelId });
      if (version === saveVersion) {
        dispatchServiceModelUpdated('chat');
      }
    },

    // ... 折叠相关 actions 不变
  }
});
```

---

### 2. `src/components/BChatSidebar/hooks/useModelSelection.ts`

```ts
/**
 * @file useModelSelection.ts
 * @description 模型选择状态管理 hook，从 service-model store 读取选中模型，
 * 从 provider store 派生视觉能力，自动响应所有数据变更。
 */
import { computed } from 'vue';
import { useServiceModelStore } from '@/stores/service-model';
import { useProviderStore } from '@/stores/provider';

/**
 * 模型选择状态管理 hook
 * @returns 模型选择状态和操作方法
 */
export function useModelSelection() {
  const serviceModelStore = useServiceModelStore();
  const providerStore = useProviderStore();

  /** 当前选中的模型标识，从 store 读取 */
  const selectedModel = computed(() => serviceModelStore.chatModel);

  /** 当前模型是否支持视觉识别，从 providerStore 响应式派生 */
  const supportsVision = computed(() => {
    const model = selectedModel.value;
    if (!model) return false;
    const provider = providerStore.providers.find((p) => p.id === model.providerId);
    const foundModel = provider?.models?.find((m) => m.id === model.modelId);
    return foundModel?.supportsVision === true;
  });

  /**
   * 初始化加载当前选中的模型配置。
   * 从 serviceModelsStorage 读取 chat 场景的默认模型并写入 store。
   */
  async function loadSelectedModel(): Promise<void> {
    await serviceModelStore.loadChatModel();
  }

  /**
   * 处理模型变更。
   * 通过 store 保存并更新状态，computed 自动派生 supportsVision。
   * @param model - 新选中的模型标识
   */
  async function onModelChange(model: { providerId: string; modelId: string }): Promise<void> {
    await serviceModelStore.setChatModel(model);
  }

  return {
    selectedModel,
    supportsVision,
    loadSelectedModel,
    onModelChange
  };
}
```

**删除的代码**：
- `import { ref, watch } from 'vue'` → 改为 `import { computed } from 'vue'`
- `import { getModelVisionSupport } from '@/ai/tools/policy'` — 不再需要
- `import { serviceModelsStorage } from '@/shared/storage'` — 不再直接操作 storage
- `ParsedModel` 接口 — 不再解析字符串
- `parseSelectedModel()` — 不再需要
- `const selectedModel = ref(...)` → 改为 `computed(() => serviceModelStore.chatModel)`
- `const supportsVision = ref(false)` → 改为 computed 派生
- `let visionCheckVersion = 0` — computed 天然无竞态
- `watch` 整个块 — 不再需要

---

### 3. `src/components/BChatSidebar/components/InputToolbar/ModelSelector.vue`

三处改动：

#### 3.1 emit 对象而非字符串

`handleModelChange` 删除持久化调用，`parseModelValue` 保留为组件内部胶水代码，将下拉字符串转为对象后 emit：

```diff
- import { serviceModelsStorage } from '@/shared/storage';
- import { dispatchServiceModelUpdated } from '@/shared/storage/service-models/events';
  import { useProviderStore } from '@/stores/provider';

- const emit = defineEmits<{
-   (e: 'update:model', value: string): void;
- }>();

+ const emit = defineEmits<{
+   (e: 'update:model', model: { providerId: string; modelId: string }): void;
+ }>();

  function handleModelChange(value: string): void {
    const parsed = parseModelValue(value);
    if (parsed) {
-     serviceModelsStorage.saveConfig('chat', parsed);
-     dispatchServiceModelUpdated('chat');
+     emit('update:model', parsed);
    }
-   emit('update:model', value);
    open.value = false;
  }
```

#### 3.2 watch 适配对象 props

```diff
- interface Props {
-   /** 当前选中的模型值，格式为 providerId:modelId。 */
-   model?: string;
- }
+ import type { SelectedModel } from '@/stores/service-model';
+
+ interface Props {
+   /** 当前选中的模型标识。 */
+   model?: SelectedModel;
+ }

  watch(
    () => props.model,
    (value) => {
-     internalModel.value = value;
+     internalModel.value = value ? `${value.providerId}:${value.modelId}` : undefined;
    },
    { immediate: true }
  );
```

#### 3.3 删除 `loadSavedConfig`

删除 `loadSavedConfig` 函数及其在 `onMounted` 中的调用（初始化由 store 统一负责）：

```diff
  onMounted(async () => {
-   await Promise.all([store.loadProviders(), loadSavedConfig()]);
+   await store.loadProviders();
  });

- async function loadSavedConfig(): Promise<void> {
-   if (internalModel.value) return;
-   const config = await serviceModelsStorage.getConfig('chat');
-   if (config?.providerId && config?.modelId) {
-     internalModel.value = `${config.providerId}:${config.modelId}`;
-   }
- }
```

**保留**：`parseModelValue` 函数（`ModelItem.value` 生成、`currentModelName` computed 仍用正则解析）。

---

### 4. 级联类型变更

`chatModel` 从 `string` 变为结构化对象后，emit 链路中相关类型需同步：

| 文件 | 变更 |
|------|------|
| `InputToolbar.vue:84` | `handleModelChange(value: string)` → `handleModelChange(model: { providerId: string; modelId: string })` |
| `BChatSidebar/index.vue:369` | `handleModelChange(value: string)` → `handleModelChange(model: { providerId: string; modelId: string })` |

---

### 5. 删除 `getModelVisionSupport`

`src/ai/tools/policy.ts:52` 中的 `getModelVisionSupport` 重构后无调用方，删除该函数及其 JSDoc（13 行）。`policy.ts` 中其他导出（`getModelToolSupport`、`getDefaultChatToolNames`）仍有调用方，保留不变。

---

## 数据流对比

### 之前

```
切换模型:
  ModelSelector → storage.saveConfig → dispatch event
  ModelSelector → emit('update:model', "providerId:modelId") → InputToolbar → emit('model-change')
  → BChatSidebar.handleModelChange() → useModelSelection.onModelChange()
  → selectedModel ref = value → watch 触发 → getModelVisionSupport(DB直读) → supportsVision ref

编辑能力:
  ModelModal → providerStore.saveProviderModels() → storage 写入 + store.loadProviders()
  → providerStore.providers 更新
  ❌ selectedModel 不变 → watch 不触发 → supportsVision 过期
```

### 之后

```
切换模型:
  ModelSelector → parseModelValue → emit('update:model', { providerId, modelId })
  → InputToolbar → emit('model-change') → BChatSidebar.handleModelChange()
  → useModelSelection.onModelChange() → serviceModelStore.setChatModel()
     ├── this.chatModel = model         ← 乐观更新，UI 立即响应
     ├── storage.saveConfig (async)
     └── dispatch event (带版本号保护)
  → chatModel 更新 → computed 重算 → supportsVision ✓

编辑能力:
  ModelModal → providerStore.saveProviderModels() → providerStore.providers 更新
  → computed 重算 → supportsVision ✓
```

---

## 改动范围汇总

| 文件 | 改动类型 | 变化 |
|------|----------|------|
| `src/stores/service-model.ts` | 新增 state + action | +22 行 |
| `src/components/BChatSidebar/hooks/useModelSelection.ts` | 重构（删 watch，改用 computed） | -40 行 |
| `src/components/BChatSidebar/components/InputToolbar/ModelSelector.vue` | 删持久化 + loadSavedConfig，emit 改对象 | -15 行 |
| `src/components/BChatSidebar/components/InputToolbar.vue` | 类型注解更新 | 1 行 |
| `src/components/BChatSidebar/index.vue` | 类型注解更新 | 1 行 |
| `src/ai/tools/policy.ts` | 删除 getModelVisionSupport | -13 行 |

**净减约 44 行**。
