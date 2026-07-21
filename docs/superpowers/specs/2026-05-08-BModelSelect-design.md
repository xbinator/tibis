# BModelSelect 组件设计文档

## 概述

创建一个通用的全局模型选择组件 `BModelSelect`，以模态对话框的形式展示可用模型列表，支持用户选择和切换模型。

## 背景

### 现状
- 项目中已有 `ModelSelector` 组件（位于 `src/components/BChatSidebar/components/InputToolbar/ModelSelector.vue`）
- `ModelSelector` 是一个下拉菜单式的模型选择器，嵌入在 InputToolbar 中
- 通过 `/model` 斜杠命令可以打开该选择器

### 需求
- 创建一个独立的全局组件 `BModelSelect`
- 使用模态对话框形式，而非下拉菜单
- 保持现有的 `ModelSelector` 组件不变
- 主要用于聊天侧边栏的 `/model` 命令

## 设计目标

1. **通用性**：作为全局组件，可在多个场景复用
2. **易用性**：简洁的 API 设计，使用 `defineModel` 简化双向绑定
3. **一致性**：参考 nexivo 项目的 `BModelSelect` 实现
4. **可维护性**：遵循项目代码规范，完整的类型定义和注释

## 组件结构

### 文件组织

```
src/components/BModelSelect/
├── index.vue          # 主组件
└── types.ts           # 类型定义
```

### 依赖关系

- **BModal**：模态对话框容器
- **BModelIcon**：模型图标组件
- **Icon**（@iconify/vue）：图标库
- **useProviderStore**：提供商数据源

## API 设计

### Props

```typescript
interface BModelSelectProps {
  /** 是否禁用 */
  disabled?: boolean;
}
```

### v-model

```typescript
/** 控制对话框显示隐藏 */
const open = defineModel<boolean>('open', { default: false });

/** 当前选中的模型 */
const selectedModel = defineModel<SelectedModel | undefined>('model', { default: undefined });
```

### Emits

通过 `defineModel` 自动处理：
- `update:open` - 对话框显示状态变更
- `update:model` - 模型选择变更

### Expose

```typescript
defineExpose({
  /** 程序化打开对话框 */
  open: (): void => {
    open.value = true;
  }
});
```

## 组件实现

### 模板结构

```vue
<template>
  <BModal v-model:open="open" title="选择模型" width="480px">
    <!-- 搜索框 -->
    <div class="model-search">
      <input 
        v-model="searchQuery" 
        placeholder="搜索模型..." 
        class="model-search__input"
      />
    </div>

    <!-- 模型列表 -->
    <BScrollbar max-height="400px">
      <div class="model-list">
        <div 
          v-for="group in filteredGroups" 
          :key="group.providerId" 
          class="model-group"
        >
          <div class="model-group__header">{{ group.providerName }}</div>
          <div
            v-for="item in group.models"
            :key="item.value"
            class="model-item"
            :class="{ 'is-active': item.value === internalModel }"
            @click="handleModelSelect(item)"
          >
            <BModelIcon :model="item.modelId" :size="20" />
            <div class="model-item__info">
              <div class="model-item__name">{{ item.modelName }}</div>
            </div>
            <Icon 
              v-if="item.value === internalModel" 
              icon="lucide:check" 
              width="16"
              height="16"
            />
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="!filteredGroups.length" class="model-empty">
        暂无可用模型
      </div>
    </BScrollbar>
  </BModal>
</template>
```

### 数据结构

```typescript
/**
 * 渲染到对话框中的单个模型项。
 */
interface ModelItem {
  /** 组合后的选择器值（providerId:modelId） */
  value: string;
  /** 模型 ID */
  modelId: string;
  /** 模型显示名称 */
  modelName: string;
}

/**
 * 按提供方分组后的模型集合。
 */
interface ModelGroup {
  /** 提供方 ID */
  providerId: string;
  /** 提供方显示名称 */
  providerName: string;
  /** 当前提供方下可选模型 */
  models: ModelItem[];
}

/**
 * 解析后的模型标识。
 */
interface ParsedModel {
  /** 提供方 ID */
  providerId: string;
  /** 模型 ID */
  modelId: string;
}
```

### 核心逻辑

```typescript
const MODEL_VALUE_RE = /^([^:]+):(.+)$/;

/**
 * 解析模型值字符串。
 * @param value - 模型值（格式：providerId:modelId）
 * @returns 解析后的模型标识，格式错误时返回 null
 */
function parseModelValue(value: string): ParsedModel | null {
  const match = value.match(MODEL_VALUE_RE);
  if (!match) return null;
  return { providerId: match[1], modelId: match[2] };
}

/** 搜索关键词 */
const searchQuery = ref<string>('');

/** 内部选中的模型值（格式：providerId:modelId） */
const internalModel = ref<string>();

/** 提供商数据源 */
const providerStore = useProviderStore();
const providers = computed(() => providerStore.providers);

/**
 * 按提供商分组的模型列表。
 */
const groupedModels = computed<ModelGroup[]>(() => {
  const result: ModelGroup[] = [];

  for (const provider of providers.value) {
    if (!provider.isEnabled || !provider.models?.length) continue;

    const models = provider.models
      .filter((m) => m.isEnabled)
      .map((m) => ({
        value: `${provider.id}:${m.id}`,
        modelId: m.id,
        modelName: m.name
      }));

    if (!models.length) continue;

    result.push({
      providerId: provider.id,
      providerName: provider.name,
      models
    });
  }

  return result;
});

/**
 * 根据搜索关键词过滤后的模型分组。
 */
const filteredGroups = computed<ModelGroup[]>(() => {
  if (!searchQuery.value.trim()) {
    return groupedModels.value;
  }

  const query = searchQuery.value.toLowerCase();
  
  return groupedModels.value
    .map((group) => ({
      ...group,
      models: group.models.filter((model) =>
        model.modelName.toLowerCase().includes(query)
      )
    }))
    .filter((group) => group.models.length > 0);
});

/**
 * 处理模型选择。
 * @param item - 选中的模型项
 */
function handleModelSelect(item: ModelItem): void {
  const parsed = parseModelValue(item.value);
  if (parsed) {
    selectedModel.value = parsed;
  }
  open.value = false;
}

/**
 * 同步外部传入的 model 值到内部状态。
 */
watch(
  () => selectedModel.value,
  (value) => {
    internalModel.value = value 
      ? `${value.providerId}:${value.modelId}` 
      : undefined;
  },
  { immediate: true }
);

/**
 * 组件挂载时加载提供商数据。
 */
onMounted(async () => {
  await providerStore.loadProviders();
});
```

## 样式设计

```less
.model-search {
  margin-bottom: 16px;
}

.model-search__input {
  width: 100%;
  height: 36px;
  padding: 0 12px;
  font-size: 13px;
  background: var(--input-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  outline: none;
  transition: border-color 0.2s;
}

.model-search__input:focus {
  border-color: var(--primary-color);
}

.model-search__input::placeholder {
  color: var(--text-placeholder);
}

.model-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.model-group__header {
  padding: 8px 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.model-item {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 12px;
  cursor: pointer;
  border-radius: 8px;
  transition: background 0.2s;
}

.model-item:hover {
  background: var(--bg-hover);
}

.model-item.is-active {
  background: var(--bg-active);
}

.model-item__info {
  flex: 1;
  min-width: 0;
}

.model-item__name {
  overflow: hidden;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-empty {
  padding: 40px 0;
  font-size: 14px;
  color: var(--text-secondary);
  text-align: center;
}
```

## 集成方式

### 在 BChatSidebar 中使用

```vue
<!-- src/components/BChatSidebar/index.vue -->
<template>
  <div class="b-chat-sidebar">
    <!-- 现有代码 -->
    
    <!-- 新增：全局模型选择器 -->
    <BModelSelect
      ref="modelSelectRef"
      v-model:open="modelSelectOpen"
      v-model:model="selectedModel"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import BModelSelect from '@/components/BModelSelect/index.vue';

/** 模型选择器引用 */
const modelSelectRef = ref<InstanceType<typeof BModelSelect>>();

/** 模型选择器显示状态 */
const modelSelectOpen = ref(false);

/** 斜杠命令处理 hook */
const { handleSlashCommand } = useSlashCommands({
  openModelSelector: () => modelSelectRef.value?.open(),
  openUsagePanel: () => usagePanel.openPanel(currentSession.value?.id),
  createNewSession,
  clearInput: () => inputEvents.clear(),
  compactContext: handleCompactContext,
  isBusy: () => loading.value,
  onBusyCommandRejected: (commandId: string) => {
    if (commandId === 'compact') {
      message.info('当前消息仍在生成中，请先停止或等待完成');
    }
  }
});
</script>
```

### 数据流

```
用户输入 /model 命令
  ↓
BPromptEditor 触发 @slash-command 事件
  ↓
handleSlashCommand({ id: 'model' })
  ↓
useSlashCommands 调用 openModelSelector()
  ↓
modelSelectRef.value?.open()
  ↓
BModelSelect 对话框打开
  ↓
用户选择模型
  ↓
emit('update:model', selectedModel)
  ↓
v-model:model 更新 selectedModel
  ↓
useModelSelection 自动响应变化
  ↓
对话框关闭
```

## 错误处理

1. **无可用模型**：显示空状态提示
2. **搜索无结果**：显示空状态提示
3. **提供商加载失败**：捕获异常，显示错误信息

## 测试要点

1. **基本功能**
   - 对话框能正常打开和关闭
   - 模型列表正确显示
   - 选择模型后正确更新

2. **搜索功能**
   - 搜索能正确过滤模型
   - 清空搜索后恢复完整列表

3. **边界情况**
   - 无可用模型时的显示
   - 搜索无结果时的显示
   - 禁用状态的交互

4. **集成测试**
   - `/model` 命令能正确打开对话框
   - 选择模型后正确更新到 store

## 实现计划

1. 创建 `src/components/BModelSelect/types.ts` 文件
2. 创建 `src/components/BModelSelect/index.vue` 文件
3. 在 `BChatSidebar/index.vue` 中集成组件
4. 测试 `/model` 命令功能

## 注意事项

1. 遵循项目代码规范，所有代码必须有注释
2. 使用 `defineModel` 简化双向绑定
3. 参考 nexivo 的 `BModelSelect` 实现，但适配 tibis 项目的数据结构
4. 保持与现有 `ModelSelector` 组件的独立性
5. 使用 CSS 变量实现主题化
