<!--
  @file HeaderTab.vue
  @description 单个标签页渲染组件，包含图标、运行状态指示和关闭按钮。
-->
<template>
  <div :data-tab-id="tab.id" class="header-tab" :class="tabClass" @click="emit('click')">
    <div class="header-tab__title">
      <span v-if="tabsStore.isDirty(tab.id)" class="header-tab__dirty-mark">*</span>
      <!-- 运行状态与最近记录图标互斥展示 -->
      <span v-if="statusVisual" :class="['header-tab__status', statusVisual.className]">
        <Icon v-if="statusVisual.icon" :icon="statusVisual.icon" width="13" height="13" />
      </span>
      <BRecentIcon
        v-else
        class="header-tab__icon"
        :record="resolveTabIconRecentRecord(tab)"
        :file-name="resolveTabIconFileName(tab)"
        :icon="resolveTabIcon(tab)"
        :size="14"
      />
      <span class="header-tab__title-text">{{ tab.title }}</span>
    </div>

    <button class="header-tab__close" @pointerdown.stop @click.stop="emit('close')">
      <Icon icon="ic:round-close" width="12" height="12" />
    </button>
  </div>
</template>

<script setup lang="ts">
/**
 * @file HeaderTab.vue
 * @description 单标签页渲染逻辑：class 状态、图标优先级解析与聊天运行态指示。
 */
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { Icon } from '@iconify/vue';
import type { RecentRecord, WebviewRecord } from '@/shared/storage';
import type { ChatTabRuntimeStatus } from '@/stores/chat/tabRuntime';
import { useChatTabRuntimeStore } from '@/stores/chat/tabRuntime';
import { useRecentStore } from '@/stores/workspace/recent';
import type { Tab } from '@/stores/workspace/tabs';
import { useTabsStore } from '@/stores/workspace/tabs';
import { WEB_RECORD_ICON } from '@/utils/file/icons';

/**
 * 标签页运行状态的图标和样式配置。
 */
interface StatusVisual {
  /** 可选 Iconify 图标。 */
  icon?: string;
  /** 状态附加类名。 */
  className?: string;
}

/** 非空闲运行状态的声明式视觉映射。 */
const STATUS_VISUALS: Partial<Record<ChatTabRuntimeStatus, StatusVisual>> = {
  running: { icon: 'lucide:loader-circle', className: 'is-spinning' },
  waiting: { icon: 'lucide:circle-alert', className: 'header-tab__status--waiting' },
  error: { icon: 'lucide:circle-x', className: 'header-tab__status--error' },
  completed: { className: 'header-tab__status--completed' }
};

/**
 * 组件 Props 定义。
 */
interface Props {
  /** 标签页数据 */
  tab: Tab;
  /** 是否处于拖拽中 */
  dragging?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  dragging: false
});

const emit = defineEmits<{
  (e: 'click'): void;
  (e: 'close'): void;
}>();

const route = useRoute();
const tabsStore = useTabsStore();
const recentStore = useRecentStore();
const runtimeStore = useChatTabRuntimeStore();

/** 标签页样式状态映射。 */
const tabClass = computed<Record<string, boolean>>(() => ({
  'is-active': props.tab.path === route.fullPath,
  'is-missing': tabsStore.isMissing(props.tab.id),
  'is-dragging': props.dragging ?? false
}));

/** 当前标签非空闲运行状态。 */
const chatStatus = computed<ChatTabRuntimeStatus | null>(() => {
  const status = runtimeStore.getStatus(props.tab.id);
  return status === 'idle' ? null : status;
});

/** 运行状态对应的视觉配置。 */
const statusVisual = computed<StatusVisual | undefined>(() => (chatStatus.value ? STATUS_VISUALS[chatStatus.value] : undefined));

// --------------- 图标解析 ---------------

/** 最近记录 ID 到记录的索引。 */
const recentRecordsById = computed<Map<string, RecentRecord>>(() => new Map((recentStore.recentRecords ?? []).map((record) => [record.id, record])));

/** WebView URL 到记录的索引。 */
const webviewRecordsByUrl = computed<Map<string, WebviewRecord>>(() => {
  const entries = (recentStore.recentRecords ?? [])
    .filter((record): record is WebviewRecord => record.type === 'webview')
    .map((record) => [record.url, record] as const);
  return new Map(entries);
});

/**
 * 判断标签页路径是否来自 WebView 路由。
 * @param path - 标签页路由路径
 * @returns 是否为 WebView 标签页
 */
function isWebviewTabPath(path: string): boolean {
  return path.startsWith('/webview/');
}

/**
 * 安全解码路由 query 字段。
 * @param value - query 字段值
 * @returns 解码后的字段值
 */
function decodeRouteQueryValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * 从 WebView 标签页路径中解析原始 URL。
 * @param path - 标签页路由路径
 * @returns WebView URL，非 WebView 标签或缺失 URL 时返回空字符串
 */
function resolveWebviewUrlFromTabPath(path: string): string {
  if (!isWebviewTabPath(path)) return '';
  const queryStartIndex = path.indexOf('?');
  if (queryStartIndex === -1) return '';
  const query = path.slice(queryStartIndex + 1);
  const url = new URLSearchParams(query).get('url') ?? '';
  return url ? decodeRouteQueryValue(url).trim() : '';
}

/**
 * 解析标签页对应的最近记录。
 * @param tab - 标签页
 * @returns 匹配的最近记录，未命中时返回 undefined
 */
function resolveTabRecentRecord(tab: Tab): RecentRecord | undefined {
  const record = recentRecordsById.value.get(tab.id);
  if (record) return record;
  const webviewUrl = resolveWebviewUrlFromTabPath(tab.path);
  if (!webviewUrl) return undefined;
  return webviewRecordsByUrl.value.get(webviewUrl);
}

/**
 * 解析标签页配置的显式图标。
 * @param tab - 标签页
 * @returns Iconify 图标名，未配置时返回空字符串
 */
function resolveConfiguredTabIcon(tab: Tab): string {
  return tab.icon?.trim() ?? '';
}

/**
 * 解析图标组件可使用的最近记录；显式配置图标时不再传入记录。
 * @param tab - 标签页
 * @returns 匹配的最近记录，未命中或已有配置图标时返回 undefined
 */
function resolveTabIconRecentRecord(tab: Tab): RecentRecord | undefined {
  if (resolveConfiguredTabIcon(tab)) return undefined;
  return resolveTabRecentRecord(tab);
}

/**
 * 解析标签页图标组件的文件名入参。
 * @param tab - 标签页
 * @returns 用于文件图标推断的文件名
 */
function resolveTabIconFileName(tab: Tab): string {
  if (resolveConfiguredTabIcon(tab)) return '';
  if (resolveTabRecentRecord(tab) || isWebviewTabPath(tab.path)) return '';
  return tab.title;
}

/**
 * 解析标签页图标组件的显式回退图标。
 * @param tab - 标签页
 * @returns Iconify 图标名，无需显式回退时返回空字符串
 */
function resolveTabFallbackIcon(tab: Tab): string {
  if (isWebviewTabPath(tab.path) && !resolveTabRecentRecord(tab)) return WEB_RECORD_ICON;
  return '';
}

/**
 * 解析传给图标组件的显式图标，配置图标优先于默认回退图标。
 * @param tab - 标签页
 * @returns Iconify 图标名，未命中时返回空字符串
 */
function resolveTabIcon(tab: Tab): string {
  const configuredIcon = resolveConfiguredTabIcon(tab);
  if (configuredIcon) return configuredIcon;
  return resolveTabFallbackIcon(tab);
}
</script>

<style lang="less" scoped>
.header-tab {
  position: relative;
  display: flex;
  flex-shrink: 0;
  align-items: center;
  height: 28px;
  padding: 0 4px 0 10px;
  cursor: pointer;
  background: transparent;
  border-radius: 6px;
  transition: background 0.2s, opacity 0.2s;

  /* Ensure tabs themselves are clickable (not draggable) */
  -webkit-app-region: no-drag;

  &:hover {
    background: var(--bg-hover);
  }

  &.is-active {
    font-weight: 500;
    background: var(--bg-active, var(--bg-hover));
  }

  &.is-dragging {
    opacity: 0.55;
  }

  &.is-missing .header-tab__title {
    color: var(--error-color, #ff4d4f);
  }

  &.is-missing .header-tab__title-text {
    text-decoration-line: line-through;
    text-decoration-thickness: 1px;
  }
}

.header-tab__title {
  display: flex;
  flex-shrink: 1;
  align-items: center;
  min-width: 0;
  max-width: 150px;
  font-size: 13px;
  color: var(--text-primary);
  user-select: none;
}

.header-tab__dirty-mark {
  flex-shrink: 0;
  margin-right: 2px;
  font-weight: 700;
}

.header-tab__status {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  margin-right: 4px;
}

.header-tab__status.is-spinning {
  animation: header-tab-status-spin 1s linear infinite;
}

.header-tab__status--waiting {
  color: var(--warning-color, #fa8c16);
}

.header-tab__status--error {
  color: var(--error-color, #ff4d4f);
}

.header-tab__status--completed {
  width: 7px;
  height: 7px;
  background: var(--color-primary);
  border-radius: 50%;
}

.header-tab__icon {
  margin-right: 6px;
}

.header-tab__title-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-tab__close {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  margin-left: 4px;
  color: var(--text-secondary);
  cursor: pointer;
  background: transparent;
  border: none;
  border-radius: 4px;
  opacity: 0;
  transition: all 0.2s;

  &:hover {
    color: var(--text-primary);
    background: var(--bg-hover-secondary, rgb(0 0 0 / 10%));
  }
}

.header-tab:hover .header-tab__close,
.header-tab.is-active .header-tab__close {
  opacity: 1;
}

:deep(.dark) .header-tab__close:hover {
  background: rgb(255 255 255 / 10%);
}

@keyframes header-tab-status-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
