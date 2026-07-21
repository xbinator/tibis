# BModelSelect 组件实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建一个通用的全局模型选择组件 BModelSelect，以模态对话框的形式展示可用模型列表，支持用户选择和切换模型。

**Architecture:** 创建独立的 BModelSelect 组件，使用 BModal 作为容器，通过 defineModel 实现双向绑定，从 useProviderStore 获取模型数据，在 BChatSidebar 中集成并通过 /model 命令触发。

**Tech Stack:** Vue 3, TypeScript, Less, vitest, @iconify/vue

---

## Task 1: 创建类型定义文件

**Files:**
- Create: `src/components/BModelSelect/types.ts`

- [ ] **Step 1: 创建类型定义文件**

创建文件 `src/components/BModelSelect/types.ts`，定义组件所需的类型：

```typescript
/**
 * @file types.ts
 * @description BModelSelect 组件类型定义。
 */
import type { SelectedModel } from '@/stores/serviceModel';

/**
 * 渲染到对话框中的单个模型项。
 */
export interface ModelItem {
  /** 组合后的选择器值（providerId:modelId）。 */
  value: string;
  /** 模型 ID。 */
  modelId: string;
  /** 模型显示名称。 */
  modelName: string;
}

/**
 * 按提供方分组后的模型集合。
 */
export interface ModelGroup {
  /** 提供方 ID。 */
  providerId: string;
  /** 提供方显示名称。 */
  providerName: string;
  /** 当前提供方下可选模型。 */
  models: ModelItem[];
}

/**
 * 解析后的模型标识。
 */
export interface ParsedModel {
  /** 提供方 ID。 */
  providerId: string;
  /** 模型 ID。 */
  modelId: string;
}

/**
 * BModelSelect 组件属性。
 */
export interface BModelSelectProps {
  /** 是否禁用。 */
  disabled?: boolean;
}

/**
 * BModelSelect 组件暴露的方法。
 */
export interface BModelSelectExpose {
  /** 程序化打开对话框。 */
  open: () => void;
}

export type { SelectedModel };
```

- [ ] **Step 2: 提交类型定义文件**

```bash
git add src/components/BModelSelect/types.ts
git commit -m "feat(BModelSelect): add type definitions"
```

---

## Task 2: 创建主组件文件

**Files:**
- Create: `src/components/BModelSelect/index.vue`

- [ ] **Step 1: 创建组件文件结构**

创建文件 `src/components/BModelSelect/index.vue`，包含模板、脚本和样式：

```vue
<!--
  @file index.vue
  @description 模型选择器组件，以模态对话框形式展示可用模型列表。
-->
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

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import BModal from '@/components/BModal/index.vue';
import BModelIcon from '@/components/BModelIcon/index.vue';
import BScrollbar from '@/components/BScrollbar/index.vue';
import { useProviderStore } from '@/stores/provider';
import type {
  BModelSelectExpose,
  BModelSelectProps,
  ModelGroup,
  ModelItem,
  ParsedModel,
  SelectedModel
} from './types';

/** 模型值解析正则表达式。 */
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

/** 组件属性。 */
const props = withDefaults(defineProps<BModelSelectProps>(), {
  disabled: false
});

/** 控制对话框显示隐藏。 */
const open = defineModel<boolean>('open', { default: false });

/** 当前选中的模型。 */
const selectedModel = defineModel<SelectedModel | undefined>('model', {
  default: undefined
});

/** 搜索关键词。 */
const searchQuery = ref<string>('');

/** 内部选中的模型值（格式：providerId:modelId）。 */
const internalModel = ref<string>();

/** 提供商数据源。 */
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

/**
 * 暴露给父组件的程序化打开入口。
 */
defineExpose<BModelSelectExpose>({
  open: (): void => {
    open.value = true;
  }
});
</script>

<style scoped lang="less">
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
</style>
```

- [ ] **Step 2: 提交组件文件**

```bash
git add src/components/BModelSelect/index.vue
git commit -m "feat(BModelSelect): implement model selector component"
```

---

## Task 3: 在 BChatSidebar 中集成组件

**Files:**
- Modify: `src/components/BChatSidebar/index.vue`

- [ ] **Step 1: 在模板中添加 BModelSelect 组件**

在 `src/components/BChatSidebar/index.vue` 的模板末尾添加 BModelSelect 组件：

找到模板的最后一个 `</div>` 标签前（即 `.b-chat-sidebar` 容器的闭合标签前），添加：

```vue
    <!-- 全局模型选择器 -->
    <BModelSelect
      ref="modelSelectRef"
      v-model:open="modelSelectOpen"
      v-model:model="selectedModel"
    />
  </div>
</template>
```

- [ ] **Step 2: 在脚本中添加组件引用和状态**

在 `src/components/BChatSidebar/index.vue` 的 `<script setup>` 部分：

1. 在 ref 定义区域添加：

```typescript
/** 模型选择器引用。 */
const modelSelectRef = ref<InstanceType<typeof BModelSelect>>();

/** 模型选择器显示状态。 */
const modelSelectOpen = ref(false);
```

2. 修改 `useSlashCommands` 的调用，更新 `openModelSelector` 回调：

找到：
```typescript
const { handleSlashCommand } = useSlashCommands({
  openModelSelector: () => modelSelectorRef.value?.open(),
```

替换为：
```typescript
const { handleSlashCommand } = useSlashCommands({
  openModelSelector: () => modelSelectRef.value?.open(),
```

- [ ] **Step 3: 提交集成修改**

```bash
git add src/components/BChatSidebar/index.vue
git commit -m "feat(BChatSidebar): integrate BModelSelect component"
```

---

## Task 4: 编写单元测试

**Files:**
- Create: `test/components/BModelSelect/index.test.ts`

- [ ] **Step 1: 创建测试文件**

创建文件 `test/components/BModelSelect/index.test.ts`：

```typescript
/**
 * @file index.test.ts
 * @description BModelSelect 组件单元测试。
 */
import { describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
import BModelSelect from '@/components/BModelSelect/index.vue';
import type { SelectedModel } from '@/stores/serviceModel';

// Mock useProviderStore
vi.mock('@/stores/provider', () => ({
  useProviderStore: () => ({
    providers: ref([
      {
        id: 'openai',
        name: 'OpenAI',
        isEnabled: true,
        models: [
          { id: 'gpt-4', name: 'GPT-4', isEnabled: true },
          { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', isEnabled: true }
        ]
      },
      {
        id: 'anthropic',
        name: 'Anthropic',
        isEnabled: true,
        models: [
          { id: 'claude-3-opus', name: 'Claude 3 Opus', isEnabled: true }
        ]
      }
    ]),
    loadProviders: vi.fn()
  })
}));

describe('BModelSelect', () => {
  it('should render model list when opened', async () => {
    const wrapper = mount(BModelSelect, {
      props: {
        open: true
      }
    });

    await nextTick();

    expect(wrapper.find('.model-search').exists()).toBe(true);
    expect(wrapper.find('.model-list').exists()).toBe(true);
    expect(wrapper.findAll('.model-group')).toHaveLength(2);
  });

  it('should filter models by search query', async () => {
    const wrapper = mount(BModelSelect, {
      props: {
        open: true
      }
    });

    await nextTick();

    const input = wrapper.find('.model-search__input');
    await input.setValue('GPT');

    expect(wrapper.findAll('.model-item')).toHaveLength(2);
  });

  it('should emit update:model when model is selected', async () => {
    const wrapper = mount(BModelSelect, {
      props: {
        open: true
      }
    });

    await nextTick();

    const firstModel = wrapper.find('.model-item');
    await firstModel.trigger('click');

    expect(wrapper.emitted('update:model')).toBeTruthy();
    expect(wrapper.emitted('update:model')![0][0]).toEqual({
      providerId: 'openai',
      modelId: 'gpt-4'
    } as SelectedModel);
  });

  it('should close dialog after model selection', async () => {
    const wrapper = mount(BModelSelect, {
      props: {
        open: true
      }
    });

    await nextTick();

    const firstModel = wrapper.find('.model-item');
    await firstModel.trigger('click');

    expect(wrapper.emitted('update:open')).toBeTruthy();
    expect(wrapper.emitted('update:open')![0][0]).toBe(false);
  });

  it('should show empty state when no models available', async () => {
    vi.doMock('@/stores/provider', () => ({
      useProviderStore: () => ({
        providers: ref([]),
        loadProviders: vi.fn()
      })
    }));

    const wrapper = mount(BModelSelect, {
      props: {
        open: true
      }
    });

    await nextTick();

    expect(wrapper.find('.model-empty').exists()).toBe(true);
    expect(wrapper.find('.model-empty').text()).toBe('暂无可用模型');
  });

  it('should expose open method', async () => {
    const wrapper = mount(BModelSelect);

    expect(typeof wrapper.vm.open).toBe('function');

    wrapper.vm.open();
    await nextTick();

    expect(wrapper.emitted('update:open')).toBeTruthy();
    expect(wrapper.emitted('update:open')![0][0]).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试**

```bash
pnpm test test/components/BModelSelect/index.test.ts
```

Expected: All tests pass

- [ ] **Step 3: 提交测试文件**

```bash
git add test/components/BModelSelect/index.test.ts
git commit -m "test(BModelSelect): add unit tests"
```

---

## Task 5: 手动测试集成

**Files:**
- None

- [ ] **Step 1: 启动开发服务器**

```bash
pnpm dev
```

- [ ] **Step 2: 测试 /model 命令**

1. 打开应用
2. 在聊天侧边栏输入 `/model`
3. 验证模型选择对话框是否打开
4. 验证模型列表是否正确显示
5. 选择一个模型，验证是否正确更新
6. 验证对话框是否关闭

- [ ] **Step 3: 测试搜索功能**

1. 打开模型选择对话框
2. 在搜索框中输入关键词
3. 验证模型列表是否正确过滤
4. 清空搜索框
5. 验证是否恢复完整列表

- [ ] **Step 4: 测试边界情况**

1. 测试无可用模型时的显示
2. 测试搜索无结果时的显示
3. 测试禁用状态的交互

---

## Task 6: 更新 changelog

**Files:**
- Create/Modify: `changelog/2026-05-08.md`

- [ ] **Step 1: 创建或更新 changelog 文件**

创建或更新文件 `changelog/2026-05-08.md`：

```markdown
# 2026-05-08

## Added
- 新增 BModelSelect 全局组件，支持以模态对话框形式选择模型
- 支持搜索过滤模型
- 支持按提供商分组展示模型列表

## Features
- `/model` 斜杠命令现在打开 BModelSelect 模态对话框
- BModelSelect 组件支持 v-model:open 和 v-model:model 双向绑定
- BModelSelect 组件支持程序化打开（ref.open()）
```

- [ ] **Step 2: 提交 changelog**

```bash
git add changelog/2026-05-08.md
git commit -m "docs: update changelog for BModelSelect feature"
```

---

## Task 7: 最终验证

**Files:**
- None

- [ ] **Step 1: 运行所有测试**

```bash
pnpm test
```

Expected: All tests pass

- [ ] **Step 2: 运行 lint 检查**

```bash
pnpm lint
```

Expected: No errors

- [ ] **Step 3: 运行样式检查**

```bash
pnpm lint:style
```

Expected: No errors

- [ ] **Step 4: 构建项目**

```bash
pnpm build
```

Expected: Build successful

---

## 注意事项

1. 所有代码必须遵循项目代码规范，包含完整的注释
2. 使用 `defineModel` 简化双向绑定
3. 样式使用完整的选择器名称，不使用 `&` 省略
4. 测试覆盖主要功能和边界情况
5. 确保与现有 `ModelSelector` 组件的独立性
