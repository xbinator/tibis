<template>
  <div v-if="visible && files.length" class="file-mention-menu" :style="menuStyle" data-testid="file-mention-menu" @mousedown.prevent>
    <div class="file-mention-menu__list">
      <div
        v-for="(file, index) in files"
        :key="file.id"
        class="file-mention-menu__item"
        :class="{ active: activeIndex === index }"
        data-testid="file-mention-item"
        @click="handleSelect(file)"
        @mouseenter="handleMouseEnter(index)"
      >
        <span class="file-mention-item__name">{{ file.name }}</span>
        <span class="file-mention-item__path"> {{ file.path }} </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { FileMentionOption } from '../types';
import type { CSSProperties } from 'vue';
import { computed } from 'vue';

interface Props {
  // 是否可见
  visible: boolean;
  // 文件列表
  files: readonly FileMentionOption[];
  // 当前选中项索引
  activeIndex?: number;
}

withDefaults(defineProps<Props>(), {
  activeIndex: 0
});

const emit = defineEmits<{
  (e: 'select', file: FileMentionOption): void;
  (e: 'update:activeIndex', index: number): void;
}>();

const menuStyle = computed<CSSProperties>(() => ({
  position: 'absolute',
  bottom: 'calc(100% + 8px)',
  left: '0px',
  width: '100%',
  zIndex: 10
}));

function handleSelect(file: FileMentionOption): void {
  emit('select', file);
}

function handleMouseEnter(index: number): void {
  emit('update:activeIndex', index);
}
</script>

<style scoped lang="less">
.file-mention-menu {
  min-width: 0;
  max-height: 320px;
  overflow: auto;
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
}

.file-mention-menu__list {
  max-height: 280px;
  overflow-y: auto;
}

.file-mention-menu__item {
  display: flex;
  align-items: center;
  padding: 8px 12px;

  &:hover,
  &.active {
    background: var(--bg-secondary);
  }
}

.file-mention-item__content {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
