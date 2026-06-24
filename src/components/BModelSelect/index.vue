<!--
  @file index.vue
  @description 模型选择器组件，以模态对话框形式展示可用模型列表。
-->
<template>
  <BModal v-model:open="open" :closable="false" main-style="padding: 16px;">
    <!-- 搜索框 -->
    <div class="model-search">
      <input ref="searchInputRef" v-model="searchQuery" placeholder="搜索模型..." class="model-search__input" @keydown="handleKeydown" />
    </div>

    <!-- 模型列表 -->
    <BScrollbar max-height="400px">
      <div class="model-list">
        <div v-for="(group, groupIndex) in filteredGroups" :key="group.providerId" class="model-group">
          <div class="model-group__header">{{ group.providerName }}</div>
          <div
            v-for="(item, modelIndex) in group.models"
            :key="item.value"
            :ref="(el) => setItemRef(el, groupIndex, modelIndex)"
            class="model-item"
            :class="{
              'is-focused': isFocused(groupIndex, modelIndex)
            }"
            @click="handleModelSelect(item)"
          >
            <div class="model-item__icon-wrap">
              <BModelIcon :model="item.modelId" :size="18" />
            </div>
            <div class="model-item__info">
              <div class="model-item__name">{{ item.modelName }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="!filteredGroups.length" class="model-empty">
        <BIcon icon="lucide:search-x" :size="28" class="model-empty__icon" />
        <span>未找到匹配的模型</span>
      </div>
    </BScrollbar>
  </BModal>
</template>

<script setup lang="ts">
import type { BModelSelectExpose, BModelSelectProps, ModelGroup, ModelItem, ParsedModel, SelectedModel } from './types';
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import BModal from '@/components/BModal/index.vue';
import BModelIcon from '@/components/BModelIcon/index.vue';
import BScrollbar from '@/components/BScrollbar/index.vue';
import { useProviderStore } from '@/stores/ai/provider';

// ── 常量 ────────────────────────────────────────

/** 模型值解析正则表达式。 */
const MODEL_VALUE_RE = /^([^:]+):(.+)$/;

// ── Props / Emits / Model ────────────────────────

/** 组件属性。 */
const props = withDefaults(defineProps<BModelSelectProps>(), {
  model: undefined,
  disabled: false
});

/** 组件事件。 */
const emit = defineEmits<{
  /** 模型选择变更事件。 */
  (e: 'change', model: SelectedModel): void;
}>();

/** 控制对话框显示隐藏。 */
const open = defineModel<boolean>('open', { default: false });

// ── Refs ─────────────────────────────────────────

/** 搜索框引用。 */
const searchInputRef = ref<HTMLInputElement>();

/** DOM 引用表：itemRefs[groupIndex][modelIndex] = HTMLElement */
const itemRefs = ref<HTMLElement[][]>([]);

/** 搜索关键词。 */
const searchQuery = ref<string>('');

/** 内部选中的模型值（格式：providerId:modelId）。 */
const internalModel = ref<string>();

/** 当前键盘聚焦的分组索引。 */
const focusedGroupIndex = ref<number>(0);

/** 当前键盘聚焦的模型索引。 */
const focusedModelIndex = ref<number>(0);

// ── Store ─────────────────────────────────────────

/** 提供商数据源。 */
const providerStore = useProviderStore();

// ── Computed ──────────────────────────────────────

/** 按提供商分组的模型列表。 */
const groupedModels = computed<ModelGroup[]>(() => {
  const result: ModelGroup[] = [];

  for (const provider of providerStore.providers) {
    if (!provider.isEnabled || !provider.models?.length) continue;

    const enabledModels = provider.models.filter((m) => m.isEnabled);
    if (!enabledModels.length) continue;
    const models = enabledModels.map((m) => ({ value: `${provider.id}:${m.id}`, modelId: m.id, modelName: m.name }));

    result.push({ providerId: provider.id, providerName: provider.name, models });
  }

  return result;
});

/** 根据搜索关键词过滤后的模型分组。 */
const filteredGroups = computed<ModelGroup[]>(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return groupedModels.value;

  const models = groupedModels.value.map((g) => ({ ...g, models: g.models.filter((m) => m.modelName.toLowerCase().includes(query)) }));

  return models.filter((g) => g.models.length);
});

// ── Helpers ───────────────────────────────────────

/**
 * 解析模型值字符串。
 * @param value - 模型值（格式：providerId:modelId）
 * @returns 解析后的模型标识，格式错误时返回 null
 */
function parseModelValue(value: string): ParsedModel | null {
  const [, providerId, modelId] = value.match(MODEL_VALUE_RE) ?? [];
  return providerId && modelId ? { providerId, modelId } : null;
}

/**
 * 判断指定位置是否为当前聚焦项。
 * @param groupIndex - 分组索引
 * @param modelIndex - 模型索引
 * @returns 是否聚焦
 */
function isFocused(groupIndex: number, modelIndex: number): boolean {
  return groupIndex === focusedGroupIndex.value && modelIndex === focusedModelIndex.value;
}

/**
 * 获取当前聚焦的模型项。
 * @returns 当前聚焦的模型项，不存在时返回 undefined
 */
function getFocusedModel(): ModelItem | undefined {
  return filteredGroups.value[focusedGroupIndex.value]?.models[focusedModelIndex.value];
}

/**
 * 将 DOM 节点写入 itemRefs 二维数组。
 * @param el - DOM 元素
 * @param groupIndex - 分组索引
 * @param modelIndex - 模型索引
 */
function setItemRef(el: unknown, groupIndex: number, modelIndex: number): void {
  if (!itemRefs.value[groupIndex]) itemRefs.value[groupIndex] = [];
  if (el instanceof HTMLElement) {
    itemRefs.value[groupIndex][modelIndex] = el;
  }
}

/**
 * 将当前 focused item 滚动到视口内。
 */
function scrollFocusedIntoView(): void {
  nextTick(() => {
    const el = itemRefs.value[focusedGroupIndex.value]?.[focusedModelIndex.value];
    el?.scrollIntoView({ block: 'nearest' });
  });
}

/**
 * 打开时将焦点定位到当前 active 模型，找不到则回退到第一项。
 */
function initFocusToActiveModel(): void {
  if (!internalModel.value) {
    focusedGroupIndex.value = 0;
    focusedModelIndex.value = 0;
    return;
  }

  for (const [gi, group] of filteredGroups.value.entries()) {
    const mi = group.models.findIndex((m) => m.value === internalModel.value);
    if (mi !== -1) {
      focusedGroupIndex.value = gi;
      focusedModelIndex.value = mi;
      scrollFocusedIntoView();
      return;
    }
  }

  focusedGroupIndex.value = 0;
  focusedModelIndex.value = 0;
}

// ── Event handlers ────────────────────────────────

/**
 * 处理模型选择。
 * @param item - 选中的模型项
 */
function handleModelSelect(item: ModelItem): void {
  const parsed = parseModelValue(item.value);
  if (parsed) {
    emit('change', parsed);
  }
  open.value = false;
}

/**
 * 处理键盘导航。
 * @param event - 键盘事件
 */
function handleKeydown(event: KeyboardEvent): void {
  const groups = filteredGroups.value;
  if (!groups.length) return;

  /**
   * 移动聚焦位置（支持循环导航）。
   * @param delta - 移动方向（1: 向下, -1: 向上）
   */
  function move(delta: -1 | 1): void {
    const currentGroup = groups[focusedGroupIndex.value];
    if (!currentGroup) return;

    if (delta === 1) {
      if (focusedModelIndex.value < currentGroup.models.length - 1) {
        focusedModelIndex.value++;
      } else if (focusedGroupIndex.value < groups.length - 1) {
        focusedGroupIndex.value++;
        focusedModelIndex.value = 0;
      } else {
        focusedGroupIndex.value = 0;
        focusedModelIndex.value = 0;
      }
    } else if (focusedModelIndex.value > 0) {
      focusedModelIndex.value--;
    } else if (focusedGroupIndex.value > 0) {
      focusedGroupIndex.value--;
      focusedModelIndex.value = groups[focusedGroupIndex.value].models.length - 1;
    } else {
      focusedGroupIndex.value = groups.length - 1;
      focusedModelIndex.value = groups[focusedGroupIndex.value].models.length - 1;
    }

    scrollFocusedIntoView();
  }

  const handlers: Record<string, () => void> = {
    ArrowDown: () => move(1),
    ArrowUp: () => move(-1),
    Enter: () => {
      const m = getFocusedModel();
      if (m) handleModelSelect(m);
    },
    Escape: () => {
      open.value = false;
    }
  };

  const handler = handlers[event.key];
  if (handler) {
    event.preventDefault();
    handler();
  }
}

// ── Watchers ──────────────────────────────────────

/**
 * 同步外部传入的 model 值到内部状态。
 */
watch(
  () => props.model,
  (value) => {
    internalModel.value = value ? `${value.providerId}:${value.modelId}` : undefined;
  },
  { immediate: true }
);

/**
 * 监听对话框打开状态，自动聚焦搜索框并初始化焦点位置。
 */
watch(open, (isOpen) => {
  if (isOpen) {
    searchQuery.value = '';
    itemRefs.value = [];
    nextTick(() => {
      searchInputRef.value?.focus();
      initFocusToActiveModel();
    });
  }
});

/**
 * 监听搜索关键词变化，重置聚焦状态。
 */
watch(searchQuery, () => {
  focusedGroupIndex.value = 0;
  focusedModelIndex.value = 0;
  itemRefs.value = [];
});

// ── Lifecycle ─────────────────────────────────────

/**
 * 组件挂载时加载提供商数据。
 */
onMounted(async () => {
  try {
    await providerStore.loadProviders();
  } catch (err) {
    console.error('[BModelSelect] 加载提供商失败:', err);
  }
});

// ── Expose ────────────────────────────────────────

defineExpose<BModelSelectExpose>({
  open: (): void => {
    open.value = true;
  }
});
</script>

<style scoped lang="less">
/* ── 搜索框 ─────────────────────────────────── */
.model-search {
  position: relative;
  display: flex;
  align-items: center;
  margin-bottom: 12px;
}

.model-search__input {
  width: 100%;
  height: 36px;
  padding: 0 12px;
  font-size: 13px;
  color: var(--text-primary);
  outline: none;
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: 8px;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.model-search__input:focus {
  border-color: var(--input-focus-border);
  box-shadow: 0 0 0 3px var(--input-focus-shadow);
}

.model-search__input::placeholder {
  color: var(--text-placeholder);
}

/* ── 模型列表 ────────────────────────────────── */
.model-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* ── 分组标题 ────────────────────────────────── */
.model-group__header {
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 0 4px 6px;
  margin-bottom: 2px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.6px;
}

/* ── 模型条目 ────────────────────────────────── */
.model-item {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 6px 8px;
  margin-top: 4px;
  cursor: pointer;
  border-radius: 8px;
  transition: background-color 0.15s, border-color 0.15s;
}

.model-item:hover,
.model-item.is-focused {
  background: var(--bg-hover);
}

.model-item__icon-wrap {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
}

.model-item__info {
  flex: 1;
  min-width: 0;
}

.model-item__name {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13.5px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
}

/* ── 空状态 ─────────────────────────────────── */
.model-empty {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
  padding: 48px 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.model-empty__icon {
  opacity: 0.35;
}
</style>
