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
        :status="item.status"
        @click="handleClickTab(item.path)"
        @close="handleCloseButton(item)"
        @contextmenu="handleTabContextMenu(item, $event)"
      />
    </template>
  </BDraggable>
  <HeaderTabMenu
    :key="tabMenuState.renderKey"
    :open="tabMenuState.open"
    :position="tabMenuState.position"
    :items="tabMenuItems"
    @select="handleTabMenuSelect"
    @close="closeTabMenu"
  />
</template>

<script setup lang="ts">
/**
 * @file HeaderTabs.vue
 * @description 渲染顶部标签栏的交互逻辑，拖拽排序委托给 BDraggable 公共组件。
 */

import { computed, nextTick, onMounted, onUnmounted, reactive, shallowRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { BDraggableMoveEvent } from '@/components/BDraggable/types';
import { useClipboard } from '@/hooks/useClipboard';
import HeaderTab from '@/layouts/default/components/HeaderTab.vue';
import HeaderTabMenu from '@/layouts/default/components/HeaderTabMenu.vue';
import { useTabCloseGuard } from '@/layouts/default/hooks/useTabCloseGuard';
import type { HeaderTabCopyCommand, HeaderTabMenuCommand } from '@/layouts/default/utils/headerTabMenu';
import { getHeaderTabCopyAction } from '@/layouts/default/utils/headerTabMenu';
import { getHeaderTabsWheelScrollDelta } from '@/layouts/default/utils/headerTabsScroll';
import { isBlockingNavigationFailure } from '@/router/navigation';
import { createChatTabId } from '@/router/routes/helpers/chatRouteTab';
import { isMac } from '@/shared/platform/env';
import type { ChatSessionTitlePayload } from '@/stores/helpers/events';
import { storeEvents } from '@/stores/helpers/events';
import { useSettingStore } from '@/stores/ui/setting';
import { useRecentStore } from '@/stores/workspace/recent';
import { useTabsStore } from '@/stores/workspace/tabs';
import type { Tab, TabCloseAction } from '@/stores/workspace/tabs';
import { asyncTo } from '@/utils/asyncTo';

const tabsStore = useTabsStore();
const recentStore = useRecentStore();
const settingStore = useSettingStore();
const { canClose, cleanupClosedTabs, cancelClose } = useTabCloseGuard();
const route = useRoute();
const router = useRouter();
const { clipboard } = useClipboard();

/**
 * 顶部标签菜单项。
 */
interface HeaderTabMenuItem {
  /** 菜单项类型。 */
  type?: 'item';
  /** 菜单命令。 */
  key: HeaderTabMenuCommand;
  /** 展示文案。 */
  label: string;
  /** 是否禁用当前项。 */
  disabled?: boolean;
  /** 是否使用危险态样式。 */
  danger?: boolean;
}

/**
 * 顶部标签菜单分割线。
 */
interface HeaderTabMenuDivider {
  /** 菜单项类型。 */
  type: 'divider';
  /** 分割线唯一标识。 */
  key: string;
}

/**
 * 顶部标签菜单条目。
 */
type HeaderTabMenuEntry = HeaderTabMenuItem | HeaderTabMenuDivider;

/**
 * 顶部标签菜单支持的关闭动作。
 */
type HeaderTabCloseCommand = Extract<TabCloseAction, HeaderTabMenuCommand>;

/**
 * 顶部标签菜单浏览器坐标。
 */
interface HeaderTabMenuPosition {
  /** 横向坐标。 */
  x: number;
  /** 纵向坐标。 */
  y: number;
}

/**
 * 顶部标签菜单状态。
 */
interface HeaderTabMenuState {
  /** 是否打开菜单。 */
  open: boolean;
  /** 当前右键命中的标签 ID。 */
  tabId: string | null;
  /** 菜单浏览器坐标。 */
  position: HeaderTabMenuPosition;
  /** 菜单渲染版本，用于重新右键时强制新实例在新位置出现。 */
  renderKey: number;
}

/**
 * 标签关闭菜单配置。
 */
interface CloseMenuConfig {
  /** 关闭动作。 */
  action: HeaderTabCloseCommand;
  /** 展示文案。 */
  label: string;
  /** 是否使用危险态样式。 */
  danger?: boolean;
}

/** 标签关闭菜单的固定顺序。 */
const CLOSE_MENU_CONFIGS: CloseMenuConfig[] = [
  { action: 'close', label: '关闭' },
  { action: 'closeOthers', label: '关闭其他' },
  { action: 'closeRight', label: '关闭右侧' },
  { action: 'closeAll', label: '关闭全部', danger: true }
];

/** 顶部标签菜单支持的关闭动作集合。 */
const HEADER_TAB_CLOSE_COMMANDS: readonly HeaderTabCloseCommand[] = ['close', 'closeOthers', 'closeRight', 'closeAll'];

/** 顶部标签菜单支持的复制动作集合。 */
const HEADER_TAB_COPY_COMMANDS: readonly HeaderTabCopyCommand[] = ['copyPath', 'copyAddress'];

/** 顶部标签菜单支持的全部命令集合。 */
const HEADER_TAB_MENU_COMMANDS: readonly HeaderTabMenuCommand[] = [...HEADER_TAB_CLOSE_COMMANDS, ...HEADER_TAB_COPY_COMMANDS];

/** 拖拽结束后最近一次的时间戳，用于抑制拖后误点击 */
const lastDragEndedAt = shallowRef(0);

/** 全局聊天标题事件取消订阅函数。 */
let unsubscribeChatTitle: (() => void) | undefined;

/** 当前可见标签，直接消费 store 列表。 */
const visibleTabs = computed<Tab[]>(() => tabsStore.tabs);

/** 顶部标签右键菜单状态。 */
const tabMenuState = reactive<HeaderTabMenuState>({
  open: false,
  tabId: null,
  position: { x: 0, y: 0 },
  renderKey: 0
});

/** 最近一次打开菜单请求 ID，避免快速连续右键时旧请求覆盖新请求。 */
let tabMenuOpenRequestId = 0;

/** 当前右键菜单绑定的标签。 */
const activeMenuTab = computed<Tab | null>(() => tabsStore.tabs.find((tab: Tab): boolean => tab.id === tabMenuState.tabId) ?? null);

/**
 * 判断命令是否为关闭动作。
 * @param command - 菜单命令
 * @returns 是否为关闭动作
 */
function isCloseActionCommand(command: HeaderTabMenuCommand): command is HeaderTabCloseCommand {
  return HEADER_TAB_CLOSE_COMMANDS.includes(command as HeaderTabCloseCommand);
}

/**
 * 判断命令是否为复制动作。
 * @param command - 菜单命令
 * @returns 是否为复制动作
 */
function isCopyActionCommand(command: HeaderTabMenuCommand): command is HeaderTabCopyCommand {
  return HEADER_TAB_COPY_COMMANDS.includes(command as HeaderTabCopyCommand);
}

/**
 * 判断字符串是否为有效菜单命令。
 * @param value - 原始菜单命令
 * @returns 是否为有效菜单命令
 */
function isHeaderTabMenuCommand(value: string): value is HeaderTabMenuCommand {
  return HEADER_TAB_MENU_COMMANDS.includes(value as HeaderTabMenuCommand);
}

/**
 * 获取当前激活标签 ID。
 * @returns 当前激活标签 ID，未命中时返回 null
 */
function getActiveTabId(): string | null {
  return tabsStore.tabs.find((tab: Tab): boolean => tab.path === route.fullPath)?.id ?? null;
}

/**
 * 构建单个关闭菜单项。
 * @param tab - 菜单目标标签
 * @param config - 关闭菜单配置
 * @returns 关闭菜单项
 */
function createCloseMenuItem(tab: Tab, config: CloseMenuConfig): HeaderTabMenuItem {
  const plan = tabsStore.getClosePlan(config.action, {
    anchorTabId: tab.id,
    activeTabId: getActiveTabId(),
    allowCloseLastTab: true
  });

  return {
    key: config.action,
    label: config.label,
    disabled: plan.disabled,
    ...(config.danger ? { danger: true } : {})
  };
}

/**
 * 构建资源复制菜单项。
 * @param tab - 菜单目标标签
 * @returns 资源复制菜单项；当前标签没有复制能力时返回 null
 */
function createCopyMenuItem(tab: Tab): HeaderTabMenuItem | null {
  const copyAction = getHeaderTabCopyAction(tab, recentStore.recentRecords ?? []);
  if (!copyAction) return null;

  return {
    key: copyAction.command,
    label: copyAction.command === 'copyPath' ? '复制路径' : '复制地址'
  };
}

/** 当前右键菜单条目。 */
const tabMenuItems = computed<HeaderTabMenuEntry[]>(() => {
  const tab = activeMenuTab.value;
  if (!tab) return [];

  const items: HeaderTabMenuEntry[] = CLOSE_MENU_CONFIGS.map((config: CloseMenuConfig): HeaderTabMenuItem => createCloseMenuItem(tab, config));
  const copyItem = createCopyMenuItem(tab);
  if (copyItem) {
    items.push({ type: 'divider', key: 'resource-divider' }, copyItem);
  }

  return items;
});

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
 * 关闭顶部标签右键菜单。
 */
function closeTabMenu(): void {
  tabMenuState.open = false;
  tabMenuState.tabId = null;
}

/**
 * 打开指定标签的右键菜单。
 * @param tab - 右键命中的标签
 * @param event - 鼠标右键事件
 */
async function handleTabContextMenu(tab: Tab, event: MouseEvent): Promise<void> {
  event.preventDefault();
  const requestId = ++tabMenuOpenRequestId;
  const position = { x: event.clientX, y: event.clientY };

  // 已打开时先提交关闭状态，再以新 key 在新位置重新挂载，避免坐标变化产生平移动画。
  if (tabMenuState.open) {
    tabMenuState.open = false;
    tabMenuState.tabId = null;
    const [tickError] = await asyncTo(nextTick());
    if (tickError || requestId !== tabMenuOpenRequestId) return;
  }

  tabMenuState.tabId = tab.id;
  tabMenuState.position = position;
  tabMenuState.renderKey += 1;
  tabMenuState.open = true;
}

/** 组件卸载时清理事件订阅 */
onUnmounted(() => {
  unsubscribeChatTitle?.();
  unsubscribeChatTitle = undefined;
});

/**
 * 将自动命名结果同步到持久化会话标签。
 * @param payload - 会话标题事件
 */
function handleChatTitleUpdated(payload: ChatSessionTitlePayload): void {
  tabsStore.updateTabTitle({ id: createChatTabId(payload.sessionId), title: payload.title });
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

/**
 * 菜单目标标签被移除后自动关闭菜单。
 */
watch(
  () => activeMenuTab.value,
  (tab) => {
    if (tabMenuState.open && !tab) {
      closeTabMenu();
    }
  }
);

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
    await asyncTo(router.push(path));
  }
}

/**
 * 执行标签关闭动作。
 * @param action - 标签关闭动作
 * @param tab - 关闭动作锚点标签
 */
async function executeCloseAction(action: TabCloseAction, tab: Tab): Promise<void> {
  const plan = tabsStore.getClosePlan(action, {
    anchorTabId: tab.id,
    activeTabId: getActiveTabId(),
    allowCloseLastTab: true
  });

  if (!(await canClose(plan))) return;

  // 活动标签先完成回退导航，避免导航失败后当前路由指向已被移除的页面。
  if (plan.requiresNavigation) {
    const [navigationError, navigationResult] = await asyncTo(router.push(plan.nextActivePath ?? '/welcome'));
    if (navigationError || isBlockingNavigationFailure(navigationResult)) {
      cancelClose(plan.targetTabIds);
      return;
    }
  }

  tabsStore.applyClosePlan(plan);
  cleanupClosedTabs(plan.targetTabIds);
}

/**
 * 顶部关闭按钮：允许关闭最后一个标签。
 * @param tab - 待关闭的标签页
 */
async function handleCloseButton(tab: Tab): Promise<void> {
  await executeCloseAction('close', tab);
}

/**
 * 执行资源复制动作。
 * @param command - 资源复制命令
 * @param tab - 菜单目标标签
 */
async function executeCopyAction(command: HeaderTabCopyCommand, tab: Tab): Promise<void> {
  const copyAction = getHeaderTabCopyAction(tab, recentStore.recentRecords ?? []);
  if (!copyAction || copyAction.command !== command) return;

  await asyncTo(
    clipboard(copyAction.content, {
      successMessage: copyAction.successMessage,
      trim: false
    })
  );
}

/**
 * 处理右键菜单命令选择。
 * @param key - 菜单命令
 */
async function handleTabMenuSelect(key: string): Promise<void> {
  const tab = activeMenuTab.value;
  closeTabMenu();
  if (!tab || !isHeaderTabMenuCommand(key)) return;

  if (isCloseActionCommand(key)) {
    await executeCloseAction(key, tab);
    return;
  }

  if (isCopyActionCommand(key)) {
    await executeCopyAction(key, tab);
  }
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
