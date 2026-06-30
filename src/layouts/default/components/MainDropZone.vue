<template>
  <div ref="dropZoneRef" class="main-drop-zone">
    <div v-if="isDragging" class="main-drop-zone__overlay">
      <div class="main-drop-zone__overlay-content"></div>
    </div>
    <slot></slot>
  </div>
</template>

<script setup lang="ts">
/**
 * @file MainDropZone.vue
 * @description 为默认布局主内容区提供拖拽文件打开能力。
 */

import { ref } from 'vue';
import { customAlphabet } from 'nanoid';
import { OPEN_FILE_EXTENSIONS } from '@/constants/extensions';
import { resolveDroppedFilePath, useFileDrop } from '@/hooks/useFileDrop';
import { useOpenFile } from '@/hooks/useOpenFile';
import type { StoredFile } from '@/shared/storage';
import { useFilesStore } from '@/stores/workspace/files';

const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz_', 8);
const filesStore = useFilesStore();
const { openFile, openFileByPath } = useOpenFile();
const dropZoneRef = ref<HTMLElement>();

/**
 * 将无磁盘路径的拖拽文件保存为未保存草稿。
 * @param file - 拖拽得到的浏览器 File 对象
 * @param ext - 文件扩展名
 * @returns 创建后的最近文件记录
 */
async function createDroppedDraft(file: File, ext: string): Promise<StoredFile> {
  const content = await file.text();
  const name = file.name.split('.').slice(0, -1).join('.') || file.name;

  return filesStore.createAndOpen({
    type: 'file',
    id: nanoid(),
    path: null,
    name,
    ext,
    content,
    savedContent: content
  });
}

/**
 * 处理拖拽打开文件。
 * @param files - 拖拽得到的文件列表
 */
async function handleDropFiles(files: File[]): Promise<void> {
  const file = files[0];
  if (!file) return;

  const ext = file.name.split('.').pop()?.toLowerCase();
  if (!ext || !OPEN_FILE_EXTENSIONS.includes(ext)) {
    return;
  }

  try {
    const droppedFilePath = resolveDroppedFilePath(file);
    if (droppedFilePath) {
      await openFileByPath(droppedFilePath);
      return;
    }

    const createdFile = await createDroppedDraft(file, ext);
    await openFile(createdFile);
  } catch (error) {
    console.error('Failed to drop file:', error);
  }
}

/** 通用文件拖拽 hook */
const { isDragging } = useFileDrop({
  targetRef: dropZoneRef,
  onDropFiles: handleDropFiles
});
</script>

<style lang="less" scoped>
.main-drop-zone {
  position: relative;
  width: 100%;
  height: 100%;
}

.main-drop-zone__overlay {
  position: absolute;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--bg-primary);
  border-radius: 8px;
  opacity: 0.6;
  backdrop-filter: blur(4px);
}

.main-drop-zone__overlay-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
  color: var(--color-primary);
}
</style>
