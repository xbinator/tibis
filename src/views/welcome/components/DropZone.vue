<template>
  <div
    class="drop-zone"
    @dragenter.prevent="handleDragEnter"
    @dragover.prevent="handleDragOver"
    @drop.prevent="handleDrop"
    @dragleave.prevent="handleDragLeave"
  >
    <div v-if="isDragging" class="drag-overlay">
      <div class="drag-overlay-content"></div>
    </div>
    <slot></slot>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { customAlphabet } from 'nanoid';
import { OPEN_FILE_EXTENSIONS } from '@/constants/extensions';
import { useFilesStore } from '@/stores/workspace/files';

const router = useRouter();
const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz_', 8);
const filesStore = useFilesStore();

const isDragging = ref(false);
let dragCounter = 0;

/**
 * 处理拖拽进入。
 */
function handleDragEnter(): void {
  dragCounter++;
  isDragging.value = true;
}

/**
 * 处理拖拽悬停。
 */
function handleDragOver(): void {
  isDragging.value = true;
}

/**
 * 处理拖拽离开。
 */
function handleDragLeave(): void {
  dragCounter = Math.max(0, dragCounter - 1);
  if (dragCounter === 0) {
    isDragging.value = false;
  }
}

/**
 * 处理拖拽打开文件。
 * @param e - 拖拽事件
 */
async function handleDrop(e: DragEvent): Promise<void> {
  dragCounter = 0;
  isDragging.value = false;

  const files = e.dataTransfer?.files;
  if (!files || files.length === 0) return;

  const file = files[0];

  const ext = file.name.split('.').pop()?.toLowerCase();
  if (!ext || !OPEN_FILE_EXTENSIONS.includes(ext)) {
    return;
  }

  const filePath = (file as unknown as { path?: string }).path;

  try {
    let openedId = '';

    if (filePath) {
      const openedFile = await filesStore.openOrCreateByPath(filePath);
      if (!openedFile) return;

      openedId = openedFile.id;
    } else {
      const content = await file.text();
      const name = file.name.split('.').slice(0, -1).join('.') || file.name;
      const createdFile = await filesStore.createAndOpen({ id: nanoid(), path: null, name, ext, content, savedContent: content });

      openedId = createdFile.id;
    }

    await router.push({ name: 'editor', params: { id: openedId } });
  } catch (error) {
    console.error('Failed to drop file:', error);
  }
}
</script>

<style lang="less" scoped>
.drop-zone {
  position: relative;
  width: 100%;
  height: 100%;
}

.drag-overlay {
  position: absolute;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--bg-primary);
  opacity: 0.6;
  backdrop-filter: blur(4px);
}

.drag-overlay-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
  color: var(--color-primary);
}
</style>
