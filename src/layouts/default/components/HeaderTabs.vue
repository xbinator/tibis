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
      <HeaderTab
        :tab="item"
        :dragging="dragging"
        :context-menu-open="openContextTabId === item.id"
        @click="handleClickTab(item.path)"
        @close="handleCloseButton(item)"
        @context-menu-open-change="handleContextMenuOpenChange"
        @context-menu-close="resetContextMenuState"
      />
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
import type { BDraggableMoveEvent } from '@/components/BDraggable/types';
import HeaderTab from '@/layouts/default/components/HeaderTab.vue';
import { useTabCloseGuard } from '@/layouts/default/hooks/useTabCloseGuard';
import { getHeaderTabsWheelScrollDelta } from '@/layouts/default/utils/headerTabsScroll';
import { createChatTabId, isChatTab } from '@/router/routes/helpers/chatRouteTab';
import { isMac } from '@/shared/platform/env';
import { useChatTabRuntimeStore } from '@/stores/chat/tabRuntime';
import type { ChatSessionTitlePayload } from '@/stores/helpers/events';
import { storeEvents } from '@/stores/helpers/events';
import { useSettingStore } from '@/stores/ui/setting';
import { useRecentStore } from '@/stores/workspace/recent';
import { useTabsStore } from '@/stores/workspace/tabs';
import type { Tab } from '@/stores/workspace/tabs';
import { asyncTo } from '@/utils/asyncTo';

const tabsStore = useTabsStore();
const recentStore = useRecentStore();
const settingStore = useSettingStore();
const runtimeStore = useChatTabRuntimeStore();
const { canClose } = useTabCloseGuard();
const route = useRoute();
const router = useRouter();
const CONTEXT_MENU_CLOSE_DELAY_MS = 200;

/** 拖拽结束后最近一次的时间戳，用于抑制拖后误点击 */
const lastDragEndedAt = shallowRef(0);

/** 当前已打开的右键菜单所属标签 ID。 */
const openContextTabId = shallowRef<string | null>(null);

/** 前一个菜单关闭动画结束后，准备打开的下一个标签 ID。 */
const pendingContextTabId = shallowRef<string | null>(null);

/** 当前是否处于右键菜单关闭冷却阶段。 */
const isContextMenuClosing = shallowRef(false);

let contextMenuCloseTimer: number | null = null;
/** 全局聊天标题事件取消订阅函数。 */
let unsubscribeChatTitle: (() => void) | undefined;

/** 当前可见标签，直接消费 store 列表。 */
const visibleTabs = computed<Tab[]>(() => tabsStore.tabs);

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
  unsubscribeChatTitle?.();
  unsubscribeChatTitle = undefined;
});

/**
 * 将自动命名结果同步到当前会话的真实拥有者标签。
 * @param payload - 会话标题事件
 */
function handleChatTitleUpdated(payload: ChatSessionTitlePayload): void {
  const owner = runtimeStore.findOwner(payload.sessionId);
  tabsStore.updateTabTitle({ id: owner?.tabId ?? createChatTabId(payload.sessionId), title: payload.title });
}

/**
 * 组件挂载后加载最近记录，并订阅聊天标题更新事件。
 */
onMounted((): void => {
  asyncTo(recentStore.ensureLoaded());
  unsubscribeChatTitle = storeEvents.onChatSessionTitleUpdated(handleChatTitleUpdated);
});

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

watch(
  () => route.fullPath,
  (): void => {
    const nextActiveTab = tabsStore.tabs.find((tab: Tab): boolean => tab.path === route.fullPath);
    if (nextActiveTab && isChatTab(nextActiveTab)) runtimeStore.markViewed(nextActiveTab.id);
  },
  { immediate: true }
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
  const activeTabId = tabsStore.tabs.find((t) => t.path === route.fullPath)?.id ?? null;
  const plan = tabsStore.getClosePlan('close', {
    anchorTabId: tab.id,
    activeTabId,
    allowCloseLastTab: true
  });

  if (!(await canClose(plan))) return;

  tabsStore.applyClosePlan(plan);
  plan.targetTabIds.filter((tabId: string): boolean => tabId.startsWith('chat:')).forEach((tabId: string): void => runtimeStore.removeTab(tabId));

  if (!plan.requiresNavigation) return;
  await router.push(plan.nextActivePath ?? '/welcome');
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
</style>
