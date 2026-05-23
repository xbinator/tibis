<template>
  <SelectDropdown
    :visible="visible && files.length > 0"
    :items="files"
    :active-index="activeIndex"
    data-testid="file-mention-menu"
    @select="handleSelect"
    @update:active-index="handleMouseEnter"
  >
    <template #item="{ item }">
      <Icon :icon="getFileIcon(item.ext)" class="file-mention-item__icon" />
      <span class="file-mention-item__name">{{ item.name }}</span>
      <span class="file-mention-item__path">{{ item.path }}</span>
    </template>
  </SelectDropdown>
</template>

<script setup lang="ts">
import type { FileMentionOption } from '../types';
import { Icon } from '@iconify/vue';
import { getFileIcon } from '../utils/fileIcon';
import SelectDropdown from './_SelectDropdown.vue';

/**
 * FileMentionSelect 组件属性定义
 */
interface Props {
  /** 是否可见 */
  visible: boolean;
  /** 文件列表 */
  files: readonly FileMentionOption[];
  /** 当前选中项索引 */
  activeIndex?: number;
}

withDefaults(defineProps<Props>(), {
  activeIndex: 0
});

const emit = defineEmits<{
  (e: 'select', file: FileMentionOption): void;
  (e: 'update:activeIndex', index: number): void;
}>();

/**
 * 处理文件选择
 * @param file - 被选中的文件
 */
function handleSelect(file: FileMentionOption): void {
  emit('select', file);
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
.file-mention-item__icon {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  margin-right: 8px;
}

.file-mention-item__name {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
}

.file-mention-item__path {
  flex: 1;
  margin-left: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  color: var(--text-tertiary);
  white-space: nowrap;
}
</style>
