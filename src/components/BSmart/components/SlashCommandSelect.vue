<template>
  <SelectDropdown
    :visible="visible && commands.length > 0"
    :items="commands"
    :active-index="activeIndex"
    :scroll-active-into-view="scrollActiveIntoView"
    @select="handleSelect"
    @update:active-index="handleMouseEnter"
  >
    <template #before-item="{ item, index }">
      <div v-if="isGroupTitleVisible(item, index)" class="slash-command-group-title">{{ item.groupTitle }}</div>
    </template>
    <template #item="{ item }">
      <div class="slash-command-item-content">
        <span class="slash-command-item-title">{{ item.title }}</span>
        <span class="slash-command-item-desc">{{ item.description }}</span>
      </div>
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

const props = withDefaults(defineProps<Props>(), {
  activeIndex: 0,
  scrollActiveIntoView: false
});

const emit = defineEmits<{
  (e: 'select', command: SlashCommandOption): void;
  (e: 'update:activeIndex', index: number): void;
}>();

/**
 * 判断条目是否应展示自身配置的分组标题。
 * @param command - 当前条目
 * @param index - 当前扁平索引
 * @returns 是否应在条目前展示分组标题
 */
function isGroupTitleVisible(command: SlashCommandOption, index: number): boolean {
  if (!command.groupTitle) return false;
  return index === 0 || props.commands[index - 1]?.group !== command.group;
}

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
.slash-command-group-title {
  padding: 6px 10px 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
}

.slash-command-item-content {
  display: flex;
  flex: 1;
  gap: 8px;
  align-items: center;
  min-width: 0;
}

.slash-command-item-title {
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.slash-command-item-desc {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  color: var(--text-tertiary);
  white-space: nowrap;
}
</style>
