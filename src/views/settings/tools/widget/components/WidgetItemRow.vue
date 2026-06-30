<!--
  @file WidgetItemRow.vue
  @description 小组件列表项行组件，展示单个小组件的名称、描述及启用开关。
-->
<template>
  <div class="widget-settings__item-row" role="button" tabindex="0" @click="handleOpen" @keydown.enter.prevent="handleOpen" @keydown.space.prevent="handleOpen">
    <div class="widget-settings__item-icon">{{ initial }}</div>
    <div class="widget-settings__item-info">
      <div class="widget-settings__item-name">
        {{ widget.name }}
        <span v-if="widget.parseError" class="widget-settings__item-error-badge" :title="widget.parseError">
          <Icon icon="lucide:alert-triangle" :width="12" />
        </span>
      </div>
      <div class="widget-settings__desc">{{ description }}</div>
      <div v-if="widget.parseError" class="widget-settings__item-parse-error">{{ widget.parseError }}</div>
    </div>
    <div class="widget-settings__item-actions" @click.stop>
      <ASwitch :checked="widget.enabled" size="small" :disabled="!!widget.parseError" @change="handleToggle" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import type { WidgetDefinition } from '@/ai/widget';

/**
 * 小组件列表项属性。
 */
interface Props {
  /** 小组件定义 */
  widget: WidgetDefinition;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  /** 切换小组件启用状态 */
  toggle: [id: string];
  /** 打开小组件只读详情 */
  open: [id: string];
}>();

/** 小组件名称首字母，用于图标展示。 */
const initial = computed<string>(() => props.widget.name.charAt(0).toUpperCase());
/** 展示描述，无描述时回退到文件路径。 */
const description = computed<string>(() => props.widget.description || props.widget.filePath);

/**
 * 打开小组件详情。
 */
function handleOpen(): void {
  emit('open', props.widget.id);
}

/**
 * 切换小组件启用状态。
 */
function handleToggle(): void {
  emit('toggle', props.widget.id);
}
</script>

<style scoped lang="less">
.widget-settings__item-row {
  display: flex;
  gap: 12px;
  align-items: center;
  cursor: pointer;
  outline: none;
}

.widget-settings__item-icon {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  background: var(--bg-tertiary);
  border-radius: 6px;
}

.widget-settings__item-info {
  flex: 1;
  min-width: 0;
}

.widget-settings__item-name {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  user-select: text;
}

.widget-settings__item-error-badge {
  display: inline-flex;
  align-items: center;
  color: var(--color-warning, #faad14);
}

.widget-settings__desc {
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.widget-settings__item-parse-error {
  margin-top: 4px;
  font-size: 11px;
  color: var(--color-danger, #ff4d4f);
}

.widget-settings__item-actions {
  flex-shrink: 0;
}
</style>
