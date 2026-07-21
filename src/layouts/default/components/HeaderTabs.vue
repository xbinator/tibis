<!--
  @file HeaderTabs.vue
  @description 渲染应用顶部标签栏，并处理切换、关闭、横向滚动与拖拽排序交互。
-->
<template>
  <BDraggable
    class="header-tabs"
    :list="visibleTabs"
    direction="horizontal"
    item-key="id"
    item-class="header-tabs__item"
    @wheel="handleWheel"
    @move="handleDraggableMove"
    @drag-end="handleDragEnded"
  >
    <template #default="{ item, dragging }">
      <Dropdown
        :key="item.id"
        :open="openContextTabId === item.id"
        :trigger="['contextmenu']"
        placement="bottomLeft"
        @open-change="handleContextMenuOpenChange(item.id, $event)"
      >
        <div :data-tab-id="item.id" class="header-tab" :class="getTabClassName(item, dragging)" @click="handleClickTab(item.path)">
          <div class="header-tab__title">
            <span v-if="tabsStore.isDirty(item.id)" class="header-tab__dirty-mark">*</span>
            <BRecentIcon
              class="header-tab__icon"
              :record="resolveTabIconRecentRecord(item)"
              :file-name="resolveTabIconFileName(item)"
              :icon="resolveTabIcon(item)"
              :size="14"
            />
            <span class="header-tab__title-text">{{ item.title }}</span>
          </div>

          <button class="header-tab__close" @pointerdown.stop @click.stop="handleCloseButton(item)">
            <Icon icon="ic:round-close" width="12" height="12" />
          </button>
        </div>

        <template #overlay>
          <BDropdownMenu :value="''" :width="200" :options="getContextMenuOptions(item)" row-class="header-tab__menu-item" />
        </template>
      </Dropdown>
    </template>
  </BDraggable>
</template>

<script setup lang="ts">
/**
 * @file HeaderTabs.vue
 * @description 渲染顶部标签栏的交互逻辑，拖拽排序委托给 BDraggable 公共组件。
 */

import { computed, onMounted, onUnmounted, shallowRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { Dropdown } from 'ant-design-vue';
import type { BDraggableMoveEvent } from '@/components/BDraggable/types';
import type { DropdownOption } from '@/components/BDropdown/type';
import { getHeaderTabsWheelScrollDelta } from '@/layouts/default/utils/headerTabsScroll';
import { isMac } from '@/shared/platform/env';
import type { RecentRecord } from '@/shared/storage';
import { useSettingStore } from '@/stores/ui/setting';
import { useRecentStore } from '@/stores/workspace/recent';
import { useTabsStore } from '@/stores/workspace/tabs';
import type { Tab, TabCloseAction, TabClosePlan } from '@/stores/workspace/tabs';
import { WEB_RECORD_ICON } from '@/utils/file/icons';
import { Modal } from '@/utils/modal';

const tabsStore = useTabsStore();
const recentStore = useRecentStore();
const settingStore = useSettingStore();
const route = useRoute();
const router = useRouter();
const CONTEXT_MENU_CLOSE_DELAY_MS = 200;

/**
 * WebView 最近记录。
 */
type WebviewRecentRecord = Extract<RecentRecord, { type: 'webview' }>;

/** 拖拽结束后最近一次的时间戳，用于抑制拖后误点击 */
const lastDragEndedAt = shallowRef(0);

/** 当前已打开的右键菜单所属标签 ID。 */
const openContextTabId = shallowRef<string | null>(null);

/** 前一个菜单关闭动画结束后，准备打开的下一个标签 ID。 */
const pendingContextTabId = shallowRef<string | null>(null);

/** 当前是否处于右键菜单关闭冷却阶段。 */
const isContextMenuClosing = shallowRef(false);

let contextMenuCloseTimer: number | null = null;

/** 当前可见标签；聊天放大态下保持标签栏内容为空。 */
const visibleTabs = computed<Tab[]>((): Tab[] => (settingStore.chatSidebarExpanded ? [] : tabsStore.tabs));

/**
 * 拖拽排序回调：将 BDraggable 的排序结果传递给 store。
 * @param event - BDraggable 移动事件
 */
function handleDraggableMove(event: BDraggableMoveEvent<Tab>): void {
  tabsStore.moveTab(event.sourceKey, event.targetKey, event.position);
}

/**
 * 拖拽结束回调：记录时间戳以抑制误点击。
 */
function handleDragEnded(): void {
  lastDragEndedAt.value = Date.now();
}

/** 最近记录 ID 到记录的索引，用于文件标签直接按 tab id 命中。 */
const recentRecordsById = computed<Map<string, RecentRecord>>(() => new Map((recentStore.recentRecords ?? []).map((record) => [record.id, record])));

/** WebView URL 到记录的索引，用于从路由路径恢复 favicon。 */
const webviewRecordsByUrl = computed<Map<string, WebviewRecentRecord>>(() => {
  const entries = (recentStore.recentRecords ?? [])
    .filter((record): record is WebviewRecentRecord => record.type === 'webview')
    .map((record) => [record.url, record] as const);

  return new Map(entries);
});

/**
 * 清理右键菜单关闭冷却计时器。
 */
function clearContextMenuCloseTimer(): void {
  if (contextMenuCloseTimer !== null) {
    window.clearTimeout(contextMenuCloseTimer);
    contextMenuCloseTimer = null;
  }
}

/** 组件卸载时清理右键菜单计时器 */
onUnmounted(() => {
  clearContextMenuCloseTimer();
});

/**
 * 组件挂载后加载最近记录，让标签栏可复用 WebView favicon 和文件记录元数据。
 */
onMounted(() => recentStore.ensureLoaded());

/**
 * 判断标签页是否为当前激活状态。
 * @param tab - 待判断的标签页
 * @returns 是否与当前路由匹配
 */
function isActiveTab(tab: Pick<Tab, 'path'>): boolean {
  return tab.path === route.fullPath;
}

/**
 * 生成标签页样式状态。
 * @param tab - 当前渲染的标签页
 * @param dragging - 当前标签是否正在被 BDraggable 拖拽
 * @returns 标签页样式映射
 */
function getTabClassName(tab: Tab, dragging = false): Record<string, boolean> {
  return {
    'is-active': isActiveTab(tab),
    'is-missing': tabsStore.isMissing(tab.id),
    'is-dragging': dragging
  };
}

/**
 * 判断标签页路径是否来自 WebView 路由。
 * @param path - 标签页路由路径
 * @returns 是否为 WebView 标签页
 */
function isWebviewTabPath(path: string): boolean {
  return path.startsWith('/webview/');
}

/**
 * 安全解码路由 query 字段，保留无法解码的原始值。
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
  if (!isWebviewTabPath(path)) {
    return '';
  }

  const queryStartIndex = path.indexOf('?');
  if (queryStartIndex === -1) {
    return '';
  }

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
  if (record) {
    return record;
  }

  const webviewUrl = resolveWebviewUrlFromTabPath(tab.path);
  if (!webviewUrl) {
    return undefined;
  }

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
 * 解析图标组件可使用的最近记录；显式配置图标时不再传入记录，避免 favicon 覆盖配置图标。
 * @param tab - 标签页
 * @returns 匹配的最近记录，未命中或已有配置图标时返回 undefined
 */
function resolveTabIconRecentRecord(tab: Tab): RecentRecord | undefined {
  if (resolveConfiguredTabIcon(tab)) {
    return undefined;
  }

  return resolveTabRecentRecord(tab);
}

/**
 * 解析标签页图标组件的文件名入参。
 * @param tab - 标签页
 * @returns 用于文件图标推断的文件名
 */
function resolveTabIconFileName(tab: Tab): string {
  if (resolveConfiguredTabIcon(tab)) {
    return '';
  }

  if (resolveTabRecentRecord(tab) || isWebviewTabPath(tab.path)) {
    return '';
  }

  return tab.title;
}

/**
 * 解析标签页图标组件的显式回退图标。
 * @param tab - 标签页
 * @returns Iconify 图标名，无需显式回退时返回空字符串
 */
function resolveTabFallbackIcon(tab: Tab): string {
  if (isWebviewTabPath(tab.path) && !resolveTabRecentRecord(tab)) {
    return WEB_RECORD_ICON;
  }

  return '';
}

/**
 * 解析传给图标组件的显式图标，配置图标优先于默认回退图标。
 * @param tab - 标签页
 * @returns Iconify 图标名，未命中时返回空字符串
 */
function resolveTabIcon(tab: Tab): string {
  const configuredIcon = resolveConfiguredTabIcon(tab);
  if (configuredIcon) {
    return configuredIcon;
  }

  return resolveTabFallbackIcon(tab);
}

/** 当前激活的标签页 */
const activeTab = computed(() => tabsStore.tabs.find((tab) => tab.path === route.fullPath));

/**
 * 监听激活标签标题变化，同步更新窗口标题。
 */
watch(
  () => activeTab.value?.title,
  (title) => {
    if (title) {
      settingStore.setWindowTitle(title);
    }
  },
  { immediate: true }
);

/**
 * 监听路由变化，离开当前路由上下文时退出聊天放大态。
 */
watch(
  () => route.fullPath,
  () => {
    if (settingStore.chatSidebarExpanded) {
      settingStore.setChatSidebarExpanded(false);
    }
  }
);

/**
 * 立即关闭当前右键菜单并清空等待状态。
 */
function resetContextMenuState(): void {
  clearContextMenuCloseTimer();
  openContextTabId.value = null;
  pendingContextTabId.value = null;
  isContextMenuClosing.value = false;
}

/**
 * 启动“关闭动画完成后再打开下一个菜单”的冷却流程。
 */
function schedulePendingContextMenuOpen(): void {
  clearContextMenuCloseTimer();
  isContextMenuClosing.value = true;
  contextMenuCloseTimer = window.setTimeout(() => {
    openContextTabId.value = pendingContextTabId.value;
    pendingContextTabId.value = null;
    isContextMenuClosing.value = false;
    contextMenuCloseTimer = null;
  }, CONTEXT_MENU_CLOSE_DELAY_MS);
}

/**
 * 处理单个标签右键菜单的受控打开状态。
 * @param tabId - 对应标签 ID
 * @param nextOpen - 下一个打开状态
 */
function handleContextMenuOpenChange(tabId: string, nextOpen: boolean): void {
  if (!nextOpen) {
    if (openContextTabId.value === tabId) {
      openContextTabId.value = null;
    }

    if (!pendingContextTabId.value) {
      clearContextMenuCloseTimer();
      isContextMenuClosing.value = false;
    }
    return;
  }

  if (openContextTabId.value === tabId && !isContextMenuClosing.value) {
    return;
  }

  if (isContextMenuClosing.value) {
    pendingContextTabId.value = tabId;
    return;
  }

  if (openContextTabId.value && openContextTabId.value !== tabId) {
    pendingContextTabId.value = tabId;
    openContextTabId.value = null;
    schedulePendingContextMenuOpen();
    return;
  }

  pendingContextTabId.value = null;
  openContextTabId.value = tabId;
}

/**
 * 根据当前路由推导激活标签 ID。
 * @returns 当前激活标签 ID，不存在时返回 null
 */
function getActiveTabId(): string | null {
  return tabsStore.tabs.find((tab) => tab.path === route.fullPath)?.id ?? null;
}

/**
 * 为某个锚点标签批量生成右键菜单所需的关闭计划。
 * @param tabId - 锚点标签 ID
 * @returns 各动作对应的关闭计划
 */
function getContextClosePlans(tabId: string): Record<TabCloseAction, TabClosePlan> {
  const activeTabId = getActiveTabId();

  return {
    close: tabsStore.getClosePlan('close', { anchorTabId: tabId, activeTabId }),
    closeOthers: tabsStore.getClosePlan('closeOthers', { anchorTabId: tabId, activeTabId }),
    closeRight: tabsStore.getClosePlan('closeRight', { anchorTabId: tabId, activeTabId }),
    closeSaved: tabsStore.getClosePlan('closeSaved', { activeTabId }),
    closeAll: tabsStore.getClosePlan('closeAll', { activeTabId })
  };
}

/**
 * 执行关闭计划，按需确认并处理导航。
 * @param plan - 待执行的关闭计划
 */
async function executeClosePlan(plan: TabClosePlan): Promise<void> {
  resetContextMenuState();

  if (plan.disabled) {
    return;
  }

  if (plan.requiresConfirm) {
    const [cancelled] = await Modal.confirm(
      plan.action === 'close' ? '关闭标签' : '批量关闭标签',
      plan.action === 'close' ? '当前标签有未保存更改，确认关闭吗？' : `即将关闭 ${plan.targetTabIds.length} 个标签，其中包含未保存更改，确认继续吗？`
    );
    if (cancelled) {
      return;
    }
  }

  tabsStore.applyClosePlan(plan);

  if (!plan.requiresNavigation) {
    return;
  }

  await router.push(plan.nextActivePath ?? '/welcome');
}

/**
 * 构建某个标签的右键菜单项。
 * @param tab - 当前标签页
 * @returns 下拉菜单选项
 */
function getContextMenuOptions(tab: Tab): DropdownOption[] {
  const plans = getContextClosePlans(tab.id);

  return [
    { value: 'close', label: '关闭', disabled: plans.close.disabled, onClick: () => executeClosePlan(plans.close) },
    { value: 'closeOthers', label: '关闭其他', disabled: plans.closeOthers.disabled, onClick: () => executeClosePlan(plans.closeOthers) },
    { value: 'closeRight', label: '关闭右侧', disabled: plans.closeRight.disabled, onClick: () => executeClosePlan(plans.closeRight) },
    { value: 'closeSaved', label: '关闭已保存', disabled: plans.closeSaved.disabled, onClick: () => executeClosePlan(plans.closeSaved) },
    { value: 'closeAll', label: '全部关闭', disabled: plans.closeAll.disabled, onClick: () => executeClosePlan(plans.closeAll) }
  ];
}

/**
 * 点击标签页时切换路由。
 * @param path - 目标路由路径
 */
async function handleClickTab(path: string): Promise<void> {
  // 拖拽结束后 180ms 内抑制点击，防止拖后误触
  if (Date.now() - lastDragEndedAt.value < 180) {
    return;
  }

  if (path && route.fullPath !== path) {
    await router.push(path);
  }
}

/**
 * 顶部关闭按钮：允许关闭最后一个标签。
 * @param tab - 待关闭的标签页
 */
async function handleCloseButton(tab: Tab): Promise<void> {
  const plan = tabsStore.getClosePlan('close', {
    anchorTabId: tab.id,
    activeTabId: getActiveTabId(),
    allowCloseLastTab: true
  });

  await executeClosePlan(plan);
}

/**
 * 将滚轮输入映射为标签栏横向滚动。
 * @param event - 鼠标滚轮事件
 */
function handleWheel(event: WheelEvent): void {
  const scrollContainer = event.currentTarget;
  if (!(scrollContainer instanceof HTMLElement)) {
    return;
  }

  const scrollDelta = getHeaderTabsWheelScrollDelta({
    deltaX: event.deltaX,
    deltaY: event.deltaY,
    deltaMode: event.deltaMode,
    isMacPlatform: isMac()
  });

  if (scrollDelta === null) {
    return;
  }

  event.preventDefault();
  scrollContainer.scrollLeft += scrollDelta;
}
</script>

<style lang="less" scoped>
.header-tabs {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  height: 100%;
  padding-left: 4px;
  overflow: auto hidden;

  /* Hide scrollbar for Chrome, Safari and Opera */
  &::-webkit-scrollbar {
    display: none;
  }

  /* Hide scrollbar for IE, Edge and Firefox */
  -ms-overflow-style: none;
  scrollbar-width: none;

  /* Make the empty space draggable */
  -webkit-app-region: drag;
}

.header-tabs :deep(.header-tabs__item) {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  height: 100%;
  margin-right: 4px;
  -webkit-app-region: no-drag;
}

.header-tabs :deep(.b-draggable__indicator--horizontal) {
  top: 4px;
  bottom: 4px;
  background: var(--color-primary);
}

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
</style>
