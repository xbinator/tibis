<template>
  <BModal v-model:open="visible" :mask-closable="true" :width="560" :main-style="{ padding: '16px' }">
    <div class="b-search-recent">
      <div ref="inputRef" class="b-search-recent-toolbar">
        <AInput v-model:value="keyword" placeholder="搜索最近文件" @keydown.enter.prevent="handleEnter" @keydown.esc.prevent="handleClose" />
      </div>

      <BScrollbar :max-height="maxHeight" inset="auto">
        <template v-if="searchResultItems.length">
          <div class="b-search-recent-list">
            <button
              v-for="item in searchResultItems"
              :key="item.key"
              class="b-search-recent-item"
              :class="{ 'is-active': item.isActive }"
              @click="item.onSelect"
            >
              <div class="b-search-recent-item-main">
                <span class="b-search-recent-item-title">{{ item.title }}</span>
                <span class="b-search-recent-item-path" :class="item.pathClass">{{ item.pathLabel }}</span>
              </div>

              <div v-if="item.removable" class="b-search-recent-item-delete" @click.stop="item.onRemove">
                <Icon icon="ic:round-close" width="16" height="16" />
              </div>
            </button>
          </div>
        </template>

        <div v-else class="b-search-recent-empty">没有匹配的最近文件</div>
      </BScrollbar>
    </div>
  </BModal>
</template>

<script setup lang="ts">
/**
 * @file index.vue
 * @description 渲染最近文件搜索弹窗，并支持按路径直接打开文件。
 */

import type { BSearchRecentProps, AbsolutePathSearchResult, NormalizedItem } from './types';
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Icon } from '@iconify/vue';
import BModal from '@/components/BModal/index.vue';
import BScrollbar from '@/components/BScrollbar/index.vue';
import { useOpenFile } from '@/hooks/useOpenFile';
import { native } from '@/shared/platform';
import type { StoredFile } from '@/shared/storage';
import { useFilesStore } from '@/stores/workspace/files';
import { useTabsStore } from '@/stores/workspace/tabs';
import { resolveFileTitle } from '@/utils/file';

// ---------- props / emits ----------

withDefaults(defineProps<BSearchRecentProps>(), {
  maxHeight: 420
});

const emit = defineEmits<{
  (e: 'select', file: StoredFile): void;
  (e: 'remove', id: string): void;
}>();

// ---------- state ----------

const route = useRoute();
const filesStore = useFilesStore();
const tabsStore = useTabsStore();
const { openFile, openFileByPath } = useOpenFile();

const visible = defineModel<boolean>('visible', { default: false });
const keyword = ref('');
const inputRef = ref<HTMLElement | null>(null);
const absolutePathCandidate = ref<AbsolutePathSearchResult | null>(null);
let pathSearchToken = 0;

// ---------- computed ----------

const activeId = computed<string>(() => (route.name === 'editor' ? (route.params.id as string) || '' : ''));

const filteredFiles = computed<StoredFile[]>(() => {
  const files = filesStore.recentFiles ?? [];
  const term = keyword.value.trim();
  if (!term) return files;

  const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  return files.filter((file) => {
    // 同时保留扩展名与路径关键字，确保用户按文件名或类型都能搜到目标文件。
    const searchable = [resolveFileTitle(file), file.name, file.ext, file.path, file.content].filter(Boolean).join('\0');
    return re.test(searchable);
  });
});

// ---------- handlers ----------

function handleClose(): void {
  visible.value = false;
  keyword.value = '';
  absolutePathCandidate.value = null;
}

async function handleSelect(file: StoredFile): Promise<void> {
  handleClose();
  await openFile(file);
  emit('select', file);
}

async function handleOpenPath(path: string): Promise<void> {
  handleClose();
  await openFileByPath(path);
}

async function handleEnter(): Promise<void> {
  if (absolutePathCandidate.value) {
    await handleOpenPath(absolutePathCandidate.value.path);
    return;
  }
  const first = filteredFiles.value[0];
  if (first) await handleSelect(first);
}

async function handleRemove(id: string): Promise<void> {
  await filesStore.removeFile(id);
  tabsStore.removeTab(id);
  emit('remove', id);
}

/** 归一化后的展示列表，模板只关心渲染，不再做类型判断 */
const searchResultItems = computed(() => {
  const candidate = absolutePathCandidate.value;
  const items: NormalizedItem[] = [];

  // 绝对路径候选项排在最前
  if (candidate) {
    items.push({
      key: candidate.path,
      title: candidate.fileName,
      pathLabel: candidate.path,
      pathClass: '',
      meta: '按路径打开',
      isActive: false,
      removable: false,
      onSelect: () => handleOpenPath(candidate.path),
      onRemove: undefined
    });
  }

  for (const file of filteredFiles.value) {
    // 若绝对路径候选与某条最近文件路径重合，则跳过该条（避免重复）
    if (candidate && file.path === candidate.path) continue;

    const isUnsaved = !file.path;
    items.push({
      key: file.id,
      title: resolveFileTitle(file),
      pathLabel: isUnsaved ? '未保存文件' : file.path!,
      pathClass: isUnsaved ? 'is-unsaved' : '',
      meta: '',
      isActive: file.id === activeId.value,
      removable: true,
      onSelect: () => handleSelect(file),
      onRemove: () => handleRemove(file.id)
    });
  }

  return items;
});

// ---------- helpers ----------

function isAbsolutePathInput(value: string): boolean {
  return value.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(value);
}

function focusInput(): void {
  nextTick(() => {
    const input = inputRef.value?.querySelector('input');
    if (!input) return;
    input.focus();
    input.select();
  });
}

// ---------- watchers ----------

watch(keyword, async (value) => {
  const normalized = value.trim();
  const token = ++pathSearchToken;

  if (!normalized || !isAbsolutePathInput(normalized)) {
    absolutePathCandidate.value = null;
    return;
  }

  const status = await native.getPathStatus(normalized);
  if (token !== pathSearchToken) return; // 过期请求丢弃

  absolutePathCandidate.value =
    status.exists && status.isFile ? { type: 'absolute-path', path: normalized, fileName: normalized.split(/[\\/]/).at(-1) || normalized } : null;
});

watch(visible, (value) => {
  if (!value) {
    keyword.value = '';
    absolutePathCandidate.value = null;
    pathSearchToken += 1;
    return;
  }
  focusInput();
  filesStore.ensureLoaded();
});
</script>

<style scoped>
.b-search-recent {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.b-search-recent-toolbar {
  display: flex;
  align-items: center;
}

.b-search-recent-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.b-search-recent-item {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 10px 12px;
  text-align: left;
  cursor: pointer;
  background: var(--bg-primary);
  border: none;
  border-radius: 10px;
  transition: background-color 0.15s ease;
}

.b-search-recent-item:hover {
  background: var(--bg-hover);
}

.b-search-recent-item.is-active {
  background: var(--bg-selected);
}

.b-search-recent-item-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.b-search-recent-item-title {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
}

.b-search-recent-item-path {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  color: var(--text-tertiary);
  white-space: nowrap;
}

.b-search-recent-item-path.is-unsaved {
  color: var(--color-orange);
}

.b-search-recent-item-meta {
  font-size: 12px;
  color: var(--text-secondary);
}

.b-search-recent-item-delete {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  color: var(--text-tertiary);
  cursor: pointer;
  background: transparent;
  border: none;
  border-radius: 6px;
  opacity: 0;
  transition: all 0.15s ease;
}

.b-search-recent-item-delete:hover {
  color: var(--text-primary);
  background: var(--bg-active);
}

.b-search-recent-item:hover .b-search-recent-item-delete {
  opacity: 1;
}

.b-search-recent-empty {
  padding: 36px 0;
  font-size: 13px;
  color: var(--text-tertiary);
  text-align: center;
}
</style>
