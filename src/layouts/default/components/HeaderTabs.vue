<!--
  @file HeaderTabs.vue
  @description 渲染应用顶部标签栏，并处理切换、关闭、横向滚动与拖拽排序交互。
-->
<template>
  <div ref="scrollContainer" class="header-tabs" @wheel="handleWheel">
    <div v-if="dropIndicatorStyle" class="header-tabs__drop-indicator" :style="dropIndicatorStyle"></div>
    <div v-if="settingStore.chatSidebarExpanded" class="header-tabs__track header-tabs__track--chat">
      <div class="header-tab header-tab--chat is-active" aria-current="page">
        <div class="header-tab__title">
          <span class="header-tab__title-text">聊天</span>
        </div>
      </div>
    </div>
    <div v-else class="header-tabs__track">
      <Dropdown
        v-for="tab in tabsStore.tabs"
        :key="tab.id"
        :open="openContextTabId === tab.id"
        :trigger="['contextmenu']"
        placement="bottomLeft"
        @open-change="handleContextMenuOpenChange(tab.id, $event)"
      >
        <div :ref="setTabRef(tab.id)" :data-tab-id="tab.id" class="header-tab" :class="getTabClassName(tab)" @click="handleClickTab(tab.path)">
          <div class="header-tab__title">
            <span v-if="tabsStore.isDirty(tab.id)" class="header-tab__dirty-mark">*</span>
            <span class="header-tab__title-text">{{ tab.title }}</span>
          </div>

          <button class="header-tab__close" @click.stop="handleCloseButton(tab)">
            <Icon icon="ic:round-close" width="12" height="12" />
          </button>
        </div>

        <template #overlay>
          <BDropdownMenu :value="''" :width="200" :options="getContextMenuOptions(tab)" row-class="header-tab__menu-item" />
        </template>
      </Dropdown>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @file HeaderTabs.vue
 * @description 渲染顶部标签栏的交互逻辑，拖拽排序委托给 useTabDragger 模块。
 */

import { computed, shallowRef, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { Dropdown } from 'ant-design-vue';
import type { DropdownOption } from '@/components/BDropdown/type';
import { getHeaderTabsWheelScrollDelta } from '@/layouts/default/utils/headerTabsScroll';
import { isMac } from '@/shared/platform/env';
import { useSettingStore } from '@/stores/ui/setting';
import { useTabsStore } from '@/stores/workspace/tabs';
import type { Tab, TabCloseAction, TabClosePlan, TabMovePosition } from '@/stores/workspace/tabs';
import { Modal } from '@/utils/modal';
import { useTabDragger } from '../hooks/useTabDragger';

const tabsStore = useTabsStore();
const settingStore = useSettingStore();
const route = useRoute();
const router = useRouter();
const CONTEXT_MENU_CLOSE_DELAY_MS = 200;

/** 横向滚动容器 ref，供拖拽模块初始化 auto-scroll */
const scrollContainer = shallowRef<HTMLElement | null>(null);

/** 拖拽结束后最近一次的时间戳，用于抑制拖后误点击 */
const lastDragEndedAt = shallowRef(0);

/** 当前已打开的右键菜单所属标签 ID。 */
const openContextTabId = shallowRef<string | null>(null);

/** 前一个菜单关闭动画结束后，准备打开的下一个标签 ID。 */
const pendingContextTabId = shallowRef<string | null>(null);

/** 当前是否处于右键菜单关闭冷却阶段。 */
const isContextMenuClosing = shallowRef(false);

let contextMenuCloseTimer: number | null = null;

/**
 * 拖拽排序回调：将拖拽结果传递给 store。
 * @param fromId - 被拖拽标签 ID
 * @param toId - 目标标签 ID
 * @param position - 插入位置
 */
function handleMoveTab(fromId: string, toId: string, position: TabMovePosition): void {
  tabsStore.moveTab(fromId, toId, position);
}

/**
 * 拖拽结束回调：记录时间戳以抑制误点击。
 */
function handleDragEnded(): void {
  lastDragEndedAt.value = Date.now();
}

/**
 * 拖拽模块：封装 draggable/dropTarget 注册、命中计算和 auto-scroll。
 */
const dragModule = useTabDragger(scrollContainer, handleMoveTab, handleDragEnded);

const { draggingTabId, dropIndicatorOffset } = dragModule.state;

/**
 * 清理右键菜单关闭冷却计时器。
 */
function clearContextMenuCloseTimer(): void {
  if (contextMenuCloseTimer !== null) {
    window.clearTimeout(contextMenuCloseTimer);
    contextMenuCloseTimer = null;
  }
}

/**
 * Vue 模板 ref 函数：将 v-for 中的 DOM 元素传给拖拽模块注册。
 * @param tabId - 标签 ID
 * @returns ref 回调函数
 */
function setTabRef(tabId: string): (el: unknown) => void {
  return (el: unknown) => {
    if (el instanceof HTMLElement) {
      dragModule.registerTabElement(tabId, el);
    } else {
      // el 为 null 时表示该标签元素已卸载，执行清理
      dragModule.unregisterTabElement(tabId);
    }
  };
}

/** 组件卸载时清理所有拖拽注册 */
onUnmounted(() => {
  dragModule.cleanup();
  clearContextMenuCloseTimer();
});

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
 * @returns 标签页样式映射
 */
function getTabClassName(tab: Tab): Record<string, boolean> {
  return {
    'is-active': isActiveTab(tab),
    'is-missing': tabsStore.isMissing(tab.id),
    'is-dragging': draggingTabId.value === tab.id
  };
}

/**
 * 生成独立插入指示线的样式。
 * @returns 指示线样式，无有效拖拽目标时返回 null
 */
function getDropIndicatorStyle(): Record<string, string> | null {
  if (dropIndicatorOffset.value === null) {
    return null;
  }

  return {
    left: `${Math.max(dropIndicatorOffset.value - 1, 0)}px`
  };
}

/** 当前独立插入指示线的样式。 */
const dropIndicatorStyle = computed(() => getDropIndicatorStyle());

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
  if (!scrollContainer.value) {
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
  scrollContainer.value.scrollLeft += scrollDelta;
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

.header-tabs__track {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  width: max-content;
  height: 100%;
  -webkit-app-region: no-drag;
}

.header-tabs__track--chat {
  pointer-events: none;
}

.header-tabs__drop-indicator {
  position: absolute;
  top: 4px;
  bottom: 4px;
  z-index: 1;
  width: 2px;
  pointer-events: none;
  background-color: var(--color-primary);
  border-radius: 999px;
}

.header-tab {
  position: relative;
  display: flex;
  flex-shrink: 0;
  align-items: center;
  height: 28px;
  padding: 0 4px 0 10px;
  margin-right: 4px;
  cursor: pointer;
  background-color: transparent;
  border-radius: 6px;
  transition: background-color 0.2s, opacity 0.2s;

  /* Ensure tabs themselves are clickable (not draggable) */
  -webkit-app-region: no-drag;

  &:hover {
    background-color: var(--bg-hover);
  }

  &.is-active {
    font-weight: 500;
    background-color: var(--bg-active, var(--bg-hover));
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

.header-tab--chat {
  padding: 0 10px;
  cursor: default;
}

.header-tab__title {
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  color: var(--text-primary);
  white-space: nowrap;
  user-select: none;
}

.header-tab__dirty-mark {
  margin-right: 2px;
  font-weight: 700;
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
    background-color: var(--bg-hover-secondary, rgb(0 0 0 / 10%));
  }
}

.header-tab:hover .header-tab__close,
.header-tab.is-active .header-tab__close {
  opacity: 1;
}

:deep(.dark) .header-tab__close:hover {
  background-color: rgb(255 255 255 / 10%);
}
</style>
