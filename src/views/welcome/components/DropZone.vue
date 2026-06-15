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
/**
 * @file DropZone.vue
 * @description 为欢迎页提供拖拽文件打开能力。
 */

import { ref } from 'vue';
import { customAlphabet } from 'nanoid';
import { OPEN_FILE_EXTENSIONS } from '@/constants/extensions';
import { useOpenFile } from '@/hooks/useOpenFile';
import { native } from '@/shared/platform';
import type { StoredFile } from '@/shared/storage';
import { useFilesStore } from '@/stores/workspace/files';

/**
 * 旧版 Electron 在 File 对象上暴露的路径字段。
 */
interface DraggedFileWithPath {
  /** 本地磁盘路径。 */
  path?: string;
}

const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz_', 8);
const filesStore = useFilesStore();
const { openFile, openFileByPath } = useOpenFile();

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
 * 从拖拽文件中解析本地磁盘路径。
 * @param file - 拖拽得到的浏览器 File 对象
 * @returns 本地磁盘路径；无法获取时返回 null
 */
function resolveDroppedFilePath(file: File): string | null {
  const legacyPath = (file as unknown as DraggedFileWithPath).path;
  if (legacyPath) return legacyPath;

  return native.getPathForFile(file);
}

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
