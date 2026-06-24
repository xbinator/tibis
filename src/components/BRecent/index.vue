<template>
  <BModal v-model:open="visible" :mask-closable="true" :width="560" :main-style="{ padding: '10px 0 0 10px' }">
    <div :class="bem()">
      <div ref="inputRef" :class="bem('toolbar')">
        <AInput v-model:value="keyword" placeholder="搜索最近记录" @keydown="handleKeydown" />
      </div>

      <BScrollbar :max-height="maxHeight" inset="vertical">
        <div v-if="searchResultItems.length" ref="listRef" :class="bem('list')">
          <button
            v-for="(item, index) in searchResultItems"
            :key="item.key"
            :class="bem('item', { active: index === activeIndex })"
            @click="handleSelectItem(item)"
          >
            <BRecentIcon :record="item.record" :file-name="item.fileName" :icon="item.icon" :class="bem('item-icon')" :size="16" />

            <div :class="bem('item-main')">
              <span :class="bem('item-title')">{{ item.title }}</span>
              <span :class="bem('item-path', { unsaved: item.pathClass === 'is-unsaved' })">{{ item.pathLabel }}</span>
            </div>

            <div v-if="item.removable" :class="bem('item-delete')" @click.stop="handleRemoveItem(item)">
              <BIcon icon="ic:round-close" :size="12" />
            </div>
          </button>
        </div>

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
import { WEB_RECORD_ICON } from '@/utils/file/icons';
import { resolveFileTitle } from '@/utils/file/title';
import { createNamespace } from '@/utils/namespace';

const [, bem] = createNamespace('recent');

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
const listRef = ref<HTMLElement | null>(null);
const activeIndex = ref(-1);
const hasKeyboardActiveIndex = ref(false);
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

/** 归一化后的展示列表，模板只关心渲染，不再做类型判断 */
const searchResultItems = computed(() => {
  const candidate = absolutePathCandidate.value;
  const url = urlCandidate.value;
  const items: NormalizedItem[] = [];

  // URL 候选项排在最前
  if (url) {
    items.push({
      key: url.url,
      kind: 'url',
      title: url.host,
      url: url.url,
      icon: WEB_RECORD_ICON,
      pathLabel: url.url,
      pathClass: '',
      meta: '在 Webview 中打开',
      removable: false
    });
  }

  // 绝对路径候选项次之
  if (candidate) {
    items.push({
      key: candidate.path,
      kind: 'absolute-path',
      title: candidate.fileName,
      path: candidate.path,
      fileName: candidate.fileName,
      pathLabel: candidate.path,
      pathClass: '',
      meta: '按路径打开',
      removable: false
    });
  }

  for (const record of filteredRecords.value) {
    // 若绝对路径候选与某条文件记录路径重合，则跳过该条（避免重复）
    if (candidate && record.type === 'file' && record.path === candidate.path) continue;

    if (record.type === 'webview') {
      items.push({
        key: record.id,
        kind: 'webview',
        title: record.title,
        record,
        pathLabel: record.url,
        pathClass: '',
        meta: '',
        removable: true
      });
    } else {
      const isUnsaved = !record.path;
      const title = resolveFileTitle(record);
      items.push({
        key: record.id,
        kind: 'file',
        title,
        record,
        pathLabel: isUnsaved ? '未保存文件' : record.path!,
        pathClass: isUnsaved ? 'is-unsaved' : '',
        meta: '',
        removable: true
      });
    }
  }

  return items;
});

/**
 * 根据当前路由记录计算默认高亮项；没有命中时让键盘光标保持在 -1。
 */
const defaultActiveIndex = computed<number>(() => {
  if (!visible.value || !activeId.value) {
    return -1;
  }

  return searchResultItems.value.findIndex((item) => item.key === activeId.value);
});

// ---------- handlers ----------

function handleClose(): void {
  visible.value = false;
  keyword.value = '';
  absolutePathCandidate.value = null;
  urlCandidate.value = null;
  hasKeyboardActiveIndex.value = false;
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

/**
 * 选择归一化结果项。
 * @param item - 需要选择的结果项
 */
async function handleSelectItem(item: NormalizedItem): Promise<void> {
  if (item.kind === 'url') {
    await handleOpenUrl(item.url);
    return;
  }

  if (item.kind === 'absolute-path') {
    await handleOpenPath(item.path);
    return;
  }

  if (item.kind === 'webview') {
    await handleOpenUrl(item.record.url);
    return;
  }

  await handleSelect(item.record);
}

/**
 * 移除归一化结果项。
 * @param item - 需要移除的结果项
 */
async function handleRemoveItem(item: NormalizedItem): Promise<void> {
  if (item.kind === 'file') {
    await handleRemoveFile(item.record.id);
  } else if (item.kind === 'webview') {
    await handleRemoveWebview(item.record.id);
  }
}

/**
 * 将当前键盘高亮项滚动到可视区域内。
 */
function scrollActiveItemIntoView(): void {
  nextTick(() => {
    const item = listRef.value?.querySelectorAll<HTMLElement>('.b-recent__item')[activeIndex.value];

    item?.scrollIntoView({ block: 'nearest' });
  });
}

/**
 * 打开当前键盘高亮项；没有高亮时保留原有的候选项优先打开逻辑。
 */
async function handleEnter(): Promise<void> {
  const targetItem = searchResultItems.value[activeIndex.value] ?? searchResultItems.value[0];
  if (targetItem) {
    await handleSelectItem(targetItem);
  }
}

/**
 * 移动键盘高亮位置，并在首尾处循环。
 * @param direction - 移动方向，1 表示向下，-1 表示向上
 */
function moveActiveIndex(direction: 1 | -1): void {
  const total = searchResultItems.value.length;
  if (!total) {
    activeIndex.value = -1;
    return;
  }

  if (direction === 1) {
    activeIndex.value = activeIndex.value >= total - 1 ? 0 : activeIndex.value + 1;
  } else {
    activeIndex.value = activeIndex.value <= 0 ? total - 1 : activeIndex.value - 1;
  }

  hasKeyboardActiveIndex.value = true;
  scrollActiveItemIntoView();
}

/**
 * 统一处理输入框键盘事件：Enter 触发选择，方向键移动高亮，Esc 关闭弹窗。
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
  } else if (event.key === 'ArrowDown') {
    event.preventDefault();
    moveActiveIndex(1);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    moveActiveIndex(-1);
  }
}

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
  hasKeyboardActiveIndex.value = false;

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
  defaultActiveIndex,
  (value: number): void => {
    if (hasKeyboardActiveIndex.value) {
      const lastIndex = searchResultItems.value.length - 1;
      activeIndex.value = lastIndex >= 0 ? Math.min(activeIndex.value, lastIndex) : -1;
      return;
    }

    activeIndex.value = value;
  },
  { immediate: true }
);

watch(
  visible,
  (value) => {
    if (!value) {
      keyword.value = '';
      absolutePathCandidate.value = null;
      urlCandidate.value = null;
      activeIndex.value = -1;
      hasKeyboardActiveIndex.value = false;
      pathSearchToken += 1;
      return;
    }
    hasKeyboardActiveIndex.value = false;
    focusInput();
    recentStore.ensureLoaded();
  },
  { immediate: true }
);
</script>

<style scoped lang="less">
/* ── 容器 ──────────────────────────────────── */
.b-recent {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* ── 搜索栏 ────────────────────────────────── */
.b-recent__toolbar {
  display: flex;
  align-items: center;
  padding-right: 10px;
}

/* ── 列表 ──────────────────────────────────── */
.b-recent__list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-right: 4px;
  padding-bottom: 10px;
}

/* ── 条目 ──────────────────────────────────── */
.b-recent__item {
  display: flex;
  gap: 6px;
  align-items: center;
  width: 100%;
  height: 32px;
  padding: 6px 8px;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: none;
  border-radius: 8px;
  transition: background-color 0.15s, border-color 0.15s;
}

.b-recent__item:hover,
.b-recent__item--active {
  background: var(--bg-hover);
}

.b-recent__item-icon {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
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
  font-size: 13px;
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
  font-size: 13px;
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
  transition: background-color 0.15s, color 0.15s;
}

.b-recent__item-delete:hover {
  color: var(--text-primary);
  background: var(--bg-active);
}

.b-recent__item:hover .b-recent__item-delete {
  display: flex;
}

/* ── 空状态 ────────────────────────────────── */
.b-recent__empty {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
  padding: 48px 0;
  font-size: 13px;
  color: var(--text-secondary);
}
</style>
