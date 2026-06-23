<template>
  <BModal v-model:open="visible" :mask-closable="true" :width="560" :main-style="{ padding: '16px' }">
    <div :class="bem()">
      <div ref="inputRef" :class="bem('toolbar')">
        <AInput v-model:value="keyword" placeholder="搜索最近记录" @keydown="handleKeydown" />
      </div>

      <BScrollbar :max-height="maxHeight" inset="auto">
        <template v-if="searchResultItems.length">
          <div :class="bem('list')">
            <button v-for="item in searchResultItems" :key="item.key" :class="bem('item', { active: item.isActive })" @click="item.onSelect">
              <BRecentIcon :record="item.record" :file-name="item.fileName" :icon="item.icon" :class="bem('item-icon')" :size="14" />

              <div :class="bem('item-main')">
                <span :class="bem('item-title')">{{ item.title }}</span>
                <span :class="bem('item-path', { unsaved: item.pathClass === 'is-unsaved' })">{{ item.pathLabel }}</span>
              </div>

              <div v-if="item.removable" :class="bem('item-delete')" @click.stop="item.onRemove">
                <BIcon icon="ic:round-close" :size="12" />
              </div>
            </button>
          </div>
        </template>

        <div v-else :class="bem('empty')">没有匹配的最近记录</div>
      </BScrollbar>
    </div>
  </BModal>
</template>

<script setup lang="ts">
/**
 * @file index.vue
 * @description 渲染最近文件搜索弹窗，并支持按路径直接打开文件。
 */

import type { BRecentProps, AbsolutePathSearchResult, NormalizedItem, UrlSearchResult } from './types';
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import BModal from '@/components/BModal/index.vue';
import BScrollbar from '@/components/BScrollbar/index.vue';
import { useNavigate } from '@/hooks/useNavigate';
import { useOpenFile } from '@/hooks/useOpenFile';
import { native } from '@/shared/platform';
import type { StoredFile, RecentRecord } from '@/shared/storage';
import { useRecentStore } from '@/stores/workspace/recent';
import { useTabsStore } from '@/stores/workspace/tabs';
import { resolveFileTitle } from '@/utils/file/title';
import { createNamespace } from '@/utils/namespace';

const [, bem] = createNamespace('recent');
const WEB_RECORD_ICON = 'vscode-icons:file-type-geojson';

// ---------- props / emits ----------

withDefaults(defineProps<BRecentProps>(), {
  maxHeight: 420
});

const emit = defineEmits<{
  (e: 'select', file: StoredFile): void;
  (e: 'remove', id: string): void;
}>();

// ---------- state ----------

const route = useRoute();
const { openWebview } = useNavigate();
const recentStore = useRecentStore();
const tabsStore = useTabsStore();
const { openFile, openFileByPath } = useOpenFile();

const visible = defineModel<boolean>('visible', { default: false });
const keyword = ref('');
const inputRef = ref<HTMLElement | null>(null);
const absolutePathCandidate = ref<AbsolutePathSearchResult | null>(null);
const urlCandidate = ref<UrlSearchResult | null>(null);
let pathSearchToken = 0;

// ---------- computed ----------

const activeId = computed<string>(() => {
  if (route.name !== 'editor' && route.name !== 'drawing') {
    return '';
  }

  return (route.params.id as string) || '';
});

const filteredRecords = computed<RecentRecord[]>(() => {
  const records = recentStore.recentRecords ?? [];
  const term = keyword.value.trim();
  if (!term) return records;

  const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  return records.filter((record) => {
    if (record.type === 'file') {
      // 同时保留扩展名与路径关键字，确保用户按文件名或类型都能搜到目标文件。
      const searchable = [resolveFileTitle(record), record.name, record.ext, record.path, record.content].filter(Boolean).join('\0');
      return re.test(searchable);
    }
    // webview 记录按 url + title 搜索
    const searchable = [record.url, record.title].filter(Boolean).join('\0');
    return re.test(searchable);
  });
});

// ---------- handlers ----------

function handleClose(): void {
  visible.value = false;
  keyword.value = '';
  absolutePathCandidate.value = null;
  urlCandidate.value = null;
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

async function handleOpenUrl(url: string): Promise<void> {
  handleClose();
  openWebview(new URL(url));
}

async function handleEnter(): Promise<void> {
  // 优先处理 URL 候选项
  if (urlCandidate.value) {
    await handleOpenUrl(urlCandidate.value.url);
    return;
  }
  if (absolutePathCandidate.value) {
    await handleOpenPath(absolutePathCandidate.value.path);
    return;
  }
  const first = filteredRecords.value[0];
  if (!first) return;
  if (first.type === 'webview') {
    await handleOpenUrl(first.url);
  } else {
    await handleSelect(first);
  }
}

/**
 * 统一处理输入框键盘事件：Enter 触发选择，Esc 关闭弹窗。
 * @param event - 键盘事件
 */
function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter') {
    event.preventDefault();
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    handleEnter();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    handleClose();
  }
}

/**
 * 删除文件记录并清理关联的 tab。
 * @param id - 文件记录 ID
 */
async function handleRemoveFile(id: string): Promise<void> {
  await recentStore.removeFile(id);
  tabsStore.removeTab(id);
  emit('remove', id);
}

/**
 * 删除 webview 记录（webview id 与 tab id 体系不同，不调 tabsStore.removeTab）。
 * @param id - webview 记录 ID
 */
async function handleRemoveWebview(id: string): Promise<void> {
  await recentStore.removeFile(id);
  emit('remove', id);
}

/** 归一化后的展示列表，模板只关心渲染，不再做类型判断 */
const searchResultItems = computed(() => {
  const candidate = absolutePathCandidate.value;
  const url = urlCandidate.value;
  const items: NormalizedItem[] = [];

  // URL 候选项排在最前
  if (url) {
    items.push({
      key: url.url,
      title: url.host,
      icon: WEB_RECORD_ICON,
      pathLabel: url.url,
      pathClass: '',
      meta: '在 Webview 中打开',
      isActive: false,
      removable: false,
      onSelect: () => handleOpenUrl(url.url),
      onRemove: undefined
    });
  }

  // 绝对路径候选项次之
  if (candidate) {
    items.push({
      key: candidate.path,
      title: candidate.fileName,
      fileName: candidate.fileName,
      pathLabel: candidate.path,
      pathClass: '',
      meta: '按路径打开',
      isActive: false,
      removable: false,
      onSelect: () => handleOpenPath(candidate.path),
      onRemove: undefined
    });
  }

  for (const record of filteredRecords.value) {
    // 若绝对路径候选与某条文件记录路径重合，则跳过该条（避免重复）
    if (candidate && record.type === 'file' && record.path === candidate.path) continue;

    if (record.type === 'webview') {
      items.push({
        key: record.id,
        title: record.title,
        record,
        pathLabel: record.url,
        pathClass: '',
        meta: '',
        isActive: false,
        removable: true,
        onSelect: () => handleOpenUrl(record.url),
        onRemove: () => handleRemoveWebview(record.id)
      });
    } else {
      const isUnsaved = !record.path;
      const title = resolveFileTitle(record);
      items.push({
        key: record.id,
        title,
        record,
        pathLabel: isUnsaved ? '未保存文件' : record.path!,
        pathClass: isUnsaved ? 'is-unsaved' : '',
        meta: '',
        isActive: record.id === activeId.value,
        removable: true,
        onSelect: () => handleSelect(record),
        onRemove: () => handleRemoveFile(record.id)
      });
    }
  }

  return items;
});

// ---------- helpers ----------

/**
 * 判断输入是否为绝对路径。
 * @param value - 输入内容
 * @returns 是否为绝对路径
 */
function isAbsolutePathInput(value: string): boolean {
  return value.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(value);
}

/**
 * 判断输入是否为 http/https URL。
 * @param value - 输入内容
 * @returns 是否为 http/https URL
 */
function isHttpUrlInput(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/**
 * 弹窗打开后聚焦并选中输入框内容。
 */
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

  // 检测 http/https URL 输入
  if (isHttpUrlInput(normalized)) {
    try {
      const parsed = new URL(normalized);

      urlCandidate.value = { type: 'url', url: parsed.href, host: parsed.host };
    } catch {
      urlCandidate.value = null;
    }
    absolutePathCandidate.value = null;
    return;
  }

  urlCandidate.value = null;

  if (!normalized || !isAbsolutePathInput(normalized)) {
    absolutePathCandidate.value = null;
    return;
  }

  const status = await native.getPathStatus(normalized);
  if (token !== pathSearchToken) return; // 过期请求丢弃

  if (status.exists && status.isFile) {
    absolutePathCandidate.value = { type: 'absolute-path', path: normalized, fileName: normalized.split(/[\\/]/).at(-1) || normalized };
  } else {
    absolutePathCandidate.value = null;
  }
});

watch(
  visible,
  (value) => {
    if (!value) {
      keyword.value = '';
      absolutePathCandidate.value = null;
      urlCandidate.value = null;
      pathSearchToken += 1;
      return;
    }
    focusInput();
    recentStore.ensureLoaded();
  },
  { immediate: true }
);
</script>

<style scoped>
.b-recent {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.b-recent__toolbar {
  display: flex;
  align-items: center;
}

.b-recent__list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.b-recent__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 32px;
  padding: 0 6px;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: none;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.b-recent__item:hover {
  background: var(--bg-secondary);
}

.b-recent__item--active {
  background: var(--bg-secondary);
}

.b-recent__item-icon {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  margin-right: 8px;
}

.b-recent__item-main {
  display: flex;
  flex: 1;
  flex-direction: row;
  align-items: center;
  min-width: 0;
}

.b-recent__item-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  font-weight: 500;
  line-height: 18px;
  color: var(--text-primary);
  white-space: nowrap;
}

.b-recent__item-path {
  flex: 1;
  min-width: 0;
  margin-left: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  line-height: 16px;
  color: var(--text-tertiary);
  white-space: nowrap;
}

.b-recent__item-path--unsaved {
  color: var(--color-orange);
}

.b-recent__item-meta {
  font-size: 12px;
  color: var(--text-secondary);
}

.b-recent__item-delete {
  display: none;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  color: var(--text-tertiary);
  cursor: pointer;
  background: transparent;
  border: none;
  border-radius: 4px;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.b-recent__item-delete:hover {
  color: var(--text-primary);
  background: var(--bg-active);
}

.b-recent__item:hover .b-recent__item-delete {
  display: flex;
}

.b-recent__empty {
  padding: 36px 0;
  font-size: 13px;
  color: var(--text-tertiary);
  text-align: center;
}
</style>
