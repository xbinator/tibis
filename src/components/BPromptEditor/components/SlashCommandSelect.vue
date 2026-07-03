<template>
  <SelectDropdown
    :visible="visible && commands.length > 0"
    :items="commands"
    :active-index="activeIndex"
    :scroll-active-into-view="scrollActiveIntoView"
    @select="handleSelect"
    @update:active-index="handleMouseEnter"
  >
    <template #item="{ item }">
      <div class="slash-command-item-trigger">{{ item.trigger }}</div>
      <div class="slash-command-item-desc">{{ item.description }}</div>
    </template>
  </SelectDropdown>
</template>

<script setup lang="ts">
import type { SlashCommandOption } from '../types';
import SelectDropdown from './_SelectDropdown.vue';

/**
 * Slash 命令菜单属性
 */
interface Props {
  /** 是否显示菜单 */
  visible: boolean;
  /** 可选命令列表 */
  commands: readonly SlashCommandOption[];
  /** 当前高亮项索引 */
  activeIndex?: number;
  /** 活动项变化时是否滚动到可视区 */
  scrollActiveIntoView?: boolean;
}

withDefaults(defineProps<Props>(), {
  activeIndex: 0,
  scrollActiveIntoView: false
});

const emit = defineEmits<{
  (e: 'select', command: SlashCommandOption): void;
  (e: 'update:activeIndex', index: number): void;
}>();

/**
 * 选择指定 Slash 命令
 * @param command - 被点击的命令项
 */
function handleSelect(command: SlashCommandOption): void {
  emit('select', command);
}

/**
 * 更新当前高亮索引
 * @param index - 鼠标悬停到的新索引
 */
function handleMouseEnter(index: number): void {
  emit('update:activeIndex', index);
}
</script>

<style scoped lang="less">
.slash-command-item-trigger {
  padding: 2px 6px;
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  font-size: 12px;
  color: var(--color-primary);
  background: var(--color-primary-bg);
  border-radius: 4px;
}

.slash-command-item-desc {
  margin-left: 4px;
  font-size: 12px;
  color: var(--text-tertiary);
}
</style>
