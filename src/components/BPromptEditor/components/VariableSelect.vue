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
      <div class="variable-item" :class="{ 'is-without-toggle': !hasToggleSlot(item) }" :style="getVariableItemStyle(item)">
        <BButton
          v-if="item.hasChildren"
          type="ghost"
          size="mini"
          square
          :icon="item.expanded ? 'lucide:chevron-down' : 'lucide:chevron-right'"
          @click.stop="handleToggle(item)"
          @mousedown.stop.prevent
        />
        <span v-else-if="item.showTogglePlaceholder" class="variable-item__toggle-placeholder"></span>
        <div class="variable-item-main">
          <span class="variable-item-label">{{ item.label }}</span>
          <span class="variable-item-value">{{ item.value }}</span>
        </div>
        <div v-if="item.description" class="variable-item-desc">
          {{ item.description }}
        </div>
      </div>
    </template>
  </SelectDropdown>
</template>

<script setup lang="ts">
import type { Variable } from '../types';
import type { CSSProperties } from 'vue';
import SelectDropdown from './_SelectDropdown.vue';

/**
 * 变量选择菜单项。
 */
interface VariableSelectItem extends Variable {
  /** 变量树深度 */
  depth?: number;
  /** 是否存在子级变量 */
  hasChildren?: boolean;
  /** 子级变量是否展开 */
  expanded?: boolean;
  /** 是否需要展示折叠按钮占位 */
  showTogglePlaceholder?: boolean;
}

/**
 * 带变量深度 CSS 自定义属性的样式。
 */
type VariableItemStyle = CSSProperties & {
  /** 变量树深度 */
  '--variable-depth': string;
};

/**
 * VariableSelect 组件属性定义
 */
interface Props {
  /** 是否显示菜单 */
  visible: boolean;
  /** 可选变量列表 */
  variables: VariableSelectItem[];
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
  (e: 'toggle', variable: VariableSelectItem): void;
  (e: 'update:activeIndex', index: number): void;
}>();

/**
 * 获取变量项缩进样式。
 * @param item - 变量选择菜单项
 * @returns 变量项样式
 */
function getVariableItemStyle(item: VariableSelectItem): VariableItemStyle {
  return {
    '--variable-depth': String(item.depth ?? 0)
  };
}

/**
 * 判断变量项是否需要预留折叠控制列。
 * @param item - 变量选择菜单项
 * @returns 存在折叠按钮或同层占位时返回 true
 */
function hasToggleSlot(item: VariableSelectItem): boolean {
  return Boolean(item.hasChildren || item.showTogglePlaceholder);
}

/**
 * 处理变量选择
 * @param variable - 被选中的变量
 */
function handleSelect(variable: Variable): void {
  emit('select', variable);
}

/**
 * 处理变量树节点展开状态切换。
 * @param variable - 被切换的变量节点
 */
function handleToggle(variable: VariableSelectItem): void {
  emit('toggle', variable);
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

.variable-item {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  column-gap: 4px;
  width: 100%;
  min-width: 0;
  padding-left: calc(var(--variable-depth, 0) * 24px);
}

.variable-item.is-without-toggle {
  grid-template-columns: minmax(0, 1fr);
  padding-left: calc(var(--variable-depth, 0) * 24px + 28px);
}

.variable-item.is-without-toggle .variable-item-main,
.variable-item.is-without-toggle .variable-item-desc {
  grid-column: 1;
}

.variable-item__toggle-placeholder {
  grid-row: 1 / span 2;
  width: 24px;
  height: 24px;
}

.variable-item-main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 2px;
  align-items: center;
  width: 100%;
  min-width: 0;
}

.variable-item-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 14px;
  color: var(--text-primary);
  white-space: nowrap;
}

.variable-item-value {
  max-width: 150px;
  padding: 2px 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  font-size: 12px;
  color: var(--color-primary);
  white-space: nowrap;
  background: var(--color-primary-bg);
  border-radius: 4px;
}

.variable-item-desc {
  grid-column: 2;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-tertiary);
  overflow-wrap: anywhere;
}

.variable-empty-state {
  padding: 16px 12px;
  font-size: 13px;
  color: var(--text-tertiary);
  text-align: center;
}
</style>
