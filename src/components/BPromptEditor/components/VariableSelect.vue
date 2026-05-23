<template>
  <SelectDropdown
    :visible="visible"
    :items="variables"
    :active-index="activeIndex"
    teleport
    :position="position"
    :dropdown-width="300"
    @select="handleSelect"
    @update:active-index="handleMouseEnter"
  >
    <template #item="{ item }">
      <div class="variable-item-main">
        <span class="variable-item-label">{{ item.label }}</span>
        <span class="variable-item-value">{{ item.value }}</span>
      </div>
      <div v-if="item.description" class="variable-item-desc">
        {{ item.description }}
      </div>
    </template>
  </SelectDropdown>
</template>

<script setup lang="ts">
import type { Variable } from '../types';
import SelectDropdown from './_SelectDropdown.vue';

/**
 * VariableSelect 组件属性定义
 */
interface Props {
  /** 是否显示菜单 */
  visible: boolean;
  /** 可选变量列表 */
  variables: Variable[];
  /** 锚点位置，用于 Teleport 定位计算 */
  position: { top: number; left: number; bottom: number };
  /** 当前高亮项索引 */
  activeIndex?: number;
}

withDefaults(defineProps<Props>(), {
  activeIndex: 0
});

const emit = defineEmits<{
  (e: 'select', variable: Variable): void;
  (e: 'update:activeIndex', index: number): void;
}>();

/**
 * 处理变量选择
 * @param variable - 被选中的变量
 */
function handleSelect(variable: Variable): void {
  emit('select', variable);
}

/**
 * 处理鼠标悬停，更新高亮索引
 * @param index - 鼠标悬停项的索引
 */
function handleMouseEnter(index: number): void {
  emit('update:activeIndex', index);
}
</script>

<style scoped lang="less">
.variable-header-icon {
  width: 14px;
  height: 14px;
}

.variable-item-main {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.variable-item-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.variable-item-value {
  padding: 2px 6px;
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  font-size: 12px;
  color: var(--color-primary);
  background: var(--color-primary-bg);
  border-radius: 4px;
}

.variable-item-desc {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.variable-empty-state {
  padding: 16px 12px;
  font-size: 13px;
  color: var(--text-tertiary);
  text-align: center;
}
</style>
