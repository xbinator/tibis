<!--
  @file HeaderEditorActions.vue
  @description 默认布局 Header 中的动态编辑器工具栏渲染组件。
-->
<template>
  <div v-if="toolbarStore.visibleItems.length > 0" class="header-editor-actions">
    <template v-for="item in toolbarStore.visibleItems" :key="item.key">
      <div v-if="item.type === 'divider'" class="header-editor-actions__divider"></div>

      <span v-else-if="item.type === 'action'" class="header-editor-actions__button" :class="{ 'is-active': item.active }">
        <BButton square size="small" type="secondary" :disabled="item.disabled" :icon="item.icon" :tooltip="item.tooltip" @click="handleActionClick(item)" />
      </span>

      <BDropdown v-else-if="item.type === 'select'" :disabled="item.disabled">
        <BButton size="small" type="secondary" :disabled="item.disabled" :tooltip="item.tooltip" @click.stop>
          <span class="header-editor-actions__select-content">
            <BIcon v-if="resolveSelectOption(item)?.icon" :icon="resolveSelectOption(item)?.icon ?? ''" :size="14" />
            <span class="header-editor-actions__select-label">{{ resolveSelectOption(item)?.label ?? item.value }}</span>
            <BIcon icon="lucide:chevron-down" :size="12" />
          </span>
        </BButton>

        <template #overlay>
          <BDropdownMenu :options="buildSelectOptions(item)" :width="item.width ?? 120" />
        </template>
      </BDropdown>

      <BDropdown v-else :disabled="item.disabled">
        <BButton square size="small" type="secondary" :disabled="item.disabled" :icon="item.icon" :tooltip="item.tooltip" @click.stop />

        <template #overlay>
          <BDropdownMenu :options="buildMenuOptions(item.options)" :width="item.width ?? 180" />
        </template>
      </BDropdown>
    </template>

    <div class="header-editor-actions__trailing-divider"></div>
  </div>
</template>

<script setup lang="ts">
import type { DropdownOption } from '@/components/BDropdown/type';
import type { HeaderToolbarAction, HeaderToolbarMenuItem, HeaderToolbarSelect, HeaderToolbarSelectOption } from '@/stores/ui/headerToolbar';
import { useHeaderToolbarStore } from '@/stores/ui/headerToolbar';

const toolbarStore = useHeaderToolbarStore();

/**
 * 执行普通按钮动作。
 * @param item - Header 工具栏普通按钮
 */
function handleActionClick(item: HeaderToolbarAction): void {
  item.onClick();
}

/**
 * 解析单选下拉当前选项。
 * @param item - Header 工具栏单选下拉
 * @returns 当前选中的选项；未匹配时返回 null
 */
function resolveSelectOption(item: HeaderToolbarSelect): HeaderToolbarSelectOption | null {
  return item.options.find((option) => option.value === item.value) ?? null;
}

/**
 * 将单选下拉配置转换为通用下拉菜单选项。
 * @param item - Header 工具栏单选下拉
 * @returns BDropdownMenu 可渲染的选项
 */
function buildSelectOptions(item: HeaderToolbarSelect): DropdownOption[] {
  return item.options.map((option) => ({
    value: option.value,
    label: option.label,
    icon: option.icon,
    checked: option.value === item.value,
    onClick: (): void => item.onChange(option.value)
  }));
}

/**
 * 将 Header 工具栏菜单配置转换为通用下拉菜单选项。
 * @param items - Header 工具栏菜单条目
 * @returns BDropdownMenu 可渲染的选项
 */
function buildMenuOptions(items: HeaderToolbarMenuItem[]): DropdownOption[] {
  return items.map((item) => {
    if (item.type === 'divider') {
      return { type: 'divider' };
    }

    return {
      value: item.value,
      label: item.label,
      icon: item.icon,
      disabled: item.disabled,
      checked: item.checked,
      onClick: item.onClick,
      children: item.children ? buildMenuOptions(item.children) : undefined
    };
  });
}
</script>

<style lang="less" scoped>
.header-editor-actions {
  display: flex;
  flex-shrink: 0;
  gap: 4px;
  align-items: center;
  height: 100%;
}

.header-editor-actions__divider {
  width: 1px;
  height: 16px;
  margin: 0 2px;
  background-color: var(--border-secondary);
}

.header-editor-actions__trailing-divider {
  width: 1px;
  height: 16px;
  margin: 0 2px;
  background-color: var(--border-secondary);
}

.header-editor-actions__button {
  display: inline-flex;
}

.header-editor-actions__button.is-active :deep(.b-button) {
  color: var(--color-primary);
  background-color: var(--color-primary-bg);
}

.header-editor-actions__select-content {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  min-width: 0;
  max-width: 96px;
}

.header-editor-actions__select-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
