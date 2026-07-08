<template>
  <div class="welcome-page">
    <div class="welcome-container">
      <div class="actions-section">
        <div class="action-card" @click="handleNewFile">
          <div class="action-icon">
            <Icon icon="lucide:file-plus" width="16" height="16" />
          </div>
          <span class="action-label">新建文档</span>
        </div>

        <div class="action-card" @click="handleOpenFile">
          <div class="action-icon">
            <Icon icon="lucide:folder-open" width="16" height="16" />
          </div>
          <span class="action-label">打开文件</span>
        </div>
      </div>

      <div v-if="topRecentRecords.length" class="recent-files-section">
        <div class="recent-files-title">最近记录</div>
        <div class="recent-files-list">
          <div
            v-for="record in topRecentRecords"
            :key="record.id"
            class="recent-file-item"
            @click="isDocumentRecord(record) ? handleOpenRecentFile(record.id) : handleOpenWebview(record.url)"
          >
            <div class="recent-file-icon">
              <BRecentIcon :record="record" :size="14" />
            </div>
            <div class="recent-file-info">
              <div class="recent-file-name">{{ isDocumentRecord(record) ? resolveFileTitle(record) : record.title }}</div>
              <div class="recent-file-path">{{ isDocumentRecord(record) ? record.path || '未保存文件' : record.url }}</div>
            </div>
          </div>
        </div>
        <div class="recent-files-more" @click="handleShowShortcuts">
          <span>更多</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @file index.vue
 * @description 渲染欢迎页快捷入口与最近文件列表，并支持拖拽打开文件。
 */

import { computed, onMounted } from 'vue';
import { Icon } from '@iconify/vue';
import { useNavigate } from '@/hooks/useNavigate';
import { useOpenFile } from '@/hooks/useOpenFile';
import { isDocumentRecord } from '@/shared/storage';
import { useCommandPanelStore } from '@/stores/ui/commandPanel';
import { useRecentStore } from '@/stores/workspace/recent';
import { resolveFileTitle } from '@/utils/file/title';

const { openWebview } = useNavigate();
const commandPanelStore = useCommandPanelStore();
const recentStore = useRecentStore();
const { createNewFile, openFileById, openNativeFile } = useOpenFile();

const topRecentRecords = computed(() => recentStore.topRecentRecords);

onMounted(() => recentStore.ensureLoaded());

/**
 * 创建新的未保存文件。
 */
function handleNewFile(): void {
  createNewFile();
}

/**
 * 通过欢迎页入口打开原生文件。
 */
async function handleOpenFile(): Promise<void> {
  await openNativeFile();
}

/**
 * 打开最近文件并更新 openedAt。
 * @param id - 文件 ID
 */
async function handleOpenRecentFile(id: string): Promise<void> {
  await openFileById(id);
}

/**
 * 在 webview 中打开 URL。
 * @param url - 目标 URL
 */
function handleOpenWebview(url: string): void {
  openWebview(new URL(url));
}

/**
 * 打开最近文件搜索弹窗。
 */
function handleShowShortcuts(): void {
  commandPanelStore.openRecent();
}
</script>

<style lang="less" scoped>
.welcome-page {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background-color: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
}

.welcome-container {
  display: flex;
  flex-direction: column;
  gap: 24px;
  width: 100%;
  max-width: 400px;
  padding: 32px 24px;
}

.actions-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.action-card {
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 6px 8px;
  color: var(--text-primary);
  cursor: pointer;
  user-select: none;
  background-color: var(--bg-secondary);
  border-radius: 6px;
  transition: background-color 0.2s ease;

  &:hover {
    background-color: var(--bg-active);
  }

  .action-icon {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 8px;
  }

  .action-label {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: space-between;
    font-weight: 500;
  }
}

.recent-files-section {
  margin-top: 24px;
}

.recent-files-title {
  margin-bottom: 12px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.recent-files-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.recent-file-item {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 12px;
  color: var(--text-primary);
  cursor: pointer;
  user-select: none;
  background-color: var(--bg-secondary);
  border-radius: 6px;
  transition: background-color 0.2s ease;

  &:hover {
    background-color: var(--bg-active);
  }

  .recent-file-icon {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    color: var(--text-secondary);
    border-radius: 6px;
  }

  .recent-file-info {
    flex: 1;
    min-width: 0;
  }

  .recent-file-name {
    margin-bottom: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary);
    white-space: nowrap;
  }

  .recent-file-path {
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 11px;
    color: var(--text-tertiary);
    white-space: nowrap;
  }
}

.recent-files-more {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 12px;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
  background-color: var(--bg-secondary);
  border-radius: 6px;
  transition: background-color 0.2s ease, color 0.2s ease;

  &:hover {
    color: var(--text-primary);
    background-color: var(--bg-active);
  }
}
</style>
