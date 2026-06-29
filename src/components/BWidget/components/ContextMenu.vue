<!--
  @file ContextMenu.vue
  @description BWidget Widget右键菜单。
-->
<template>
  <div v-if="open" ref="menuRef" class="b-widget-context-menu" role="menu" :style="menuStyle" @contextmenu.prevent @pointerdown.stop>
    <template v-for="item in items" :key="item.key">
      <div v-if="item.type === 'divider'" class="b-widget-context-menu__divider" role="separator"></div>
      <button
        v-else
        type="button"
        class="b-widget-context-menu__item"
        :class="{ 'is-danger': item.danger }"
        :disabled="item.disabled"
        @click="handleItemClick(item)"
      >
        <Icon class="b-widget-context-menu__icon" :icon="item.icon" width="14" height="14" />
        <span class="b-widget-context-menu__label">{{ item.label }}</span>
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { WidgetPoint } from '../types';
import type { CSSProperties } from 'vue';
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';

/** 菜单与视口边缘之间保留的最小距离。 */
const WIDGET_CONTEXT_MENU_VIEWPORT_PADDING = 8;

/**
 * 右键菜单项。
 */
interface WidgetContextMenuItem {
  /** 菜单项类型 */
  type?: 'item';
  /** 菜单命令 */
  key: string;
  /** 展示文案 */
  label: string;
  /** 图标 */
  icon: string;
  /** 是否禁用 */
  disabled?: boolean;
  /** 是否危险操作 */
  danger?: boolean;
}

/**
 * 右键菜单分割线。
 */
interface WidgetContextMenuDivider {
  /** 菜单项类型 */
  type: 'divider';
  /** 分割线唯一标识 */
  key: string;
}

/**
 * 右键菜单条目。
 */
type WidgetContextMenuEntry = WidgetContextMenuItem | WidgetContextMenuDivider;

/**
 * 右键菜单尺寸。
 */
interface WidgetContextMenuSize {
  /** 菜单宽度 */
  width: number;
  /** 菜单高度 */
  height: number;
}

/**
 * 右键菜单入参。
 */
interface Props {
  /** 是否打开 */
  open: boolean;
  /** 菜单浏览器坐标 */
  position: WidgetPoint;
  /** 菜单项 */
  items: WidgetContextMenuEntry[];
}

const props = defineProps<Props>();
const emit = defineEmits<{
  /** 选择菜单项 */
  select: [key: string];
  /** 关闭菜单 */
  close: [];
}>();

/** 菜单根节点。 */
const menuRef = ref<HTMLElement | null>(null);
/** 菜单当前渲染尺寸。 */
const menuSize = ref<WidgetContextMenuSize>({ width: 0, height: 0 });

/**
 * 读取当前视口尺寸。
 * @returns 视口尺寸
 */
function getViewportSize(): WidgetContextMenuSize {
  if (typeof window === 'undefined') {
    return { width: Number.POSITIVE_INFINITY, height: Number.POSITIVE_INFINITY };
  }

  return {
    width: window.innerWidth,
    height: window.innerHeight
  };
}

/**
 * 将菜单单轴坐标限制在视口内部。
 * @param position - 原始坐标
 * @param size - 菜单在该轴上的尺寸
 * @param viewportSize - 视口在该轴上的尺寸
 * @returns 修正后的坐标
 */
function clampMenuAxisPosition(position: number, size: number, viewportSize: number): number {
  const minPosition = WIDGET_CONTEXT_MENU_VIEWPORT_PADDING;
  const maxPosition = Math.max(minPosition, viewportSize - size - WIDGET_CONTEXT_MENU_VIEWPORT_PADDING);

  return Math.min(Math.max(minPosition, position), maxPosition);
}

/** 菜单定位样式。 */
const menuStyle = computed<CSSProperties>(() => ({
  left: `${clampMenuAxisPosition(props.position.x, menuSize.value.width, getViewportSize().width)}px`,
  top: `${clampMenuAxisPosition(props.position.y, menuSize.value.height, getViewportSize().height)}px`
}));

/**
 * 同步菜单渲染尺寸，用于边界定位。
 */
async function syncMenuSize(): Promise<void> {
  if (!props.open) {
    menuSize.value = { width: 0, height: 0 };
    return;
  }

  await nextTick();
  const rect = menuRef.value?.getBoundingClientRect();
  if (!rect) {
    return;
  }

  menuSize.value = {
    width: rect.width,
    height: rect.height
  };
}

/**
 * 安全调度菜单尺寸同步。
 */
function scheduleMenuSizeSync(): void {
  syncMenuSize().catch((error: unknown): void => {
    console.warn('BWidget context menu size sync failed', error);
  });
}

/**
 * 处理菜单项点击。
 * @param item - 菜单项
 */
function handleItemClick(item: WidgetContextMenuItem): void {
  if (item.disabled) {
    return;
  }

  emit('select', item.key);
}

/**
 * 判断事件是否发生在菜单外部。
 * @param event - 指针事件
 * @returns 是否为外部事件
 */
function isOutsidePointerEvent(event: PointerEvent): boolean {
  const { target } = event;

  return target instanceof Node && menuRef.value !== null && !menuRef.value.contains(target);
}

/**
 * 处理外部指针按下。
 * @param event - 指针事件
 */
function handleDocumentPointerDown(event: PointerEvent): void {
  if (isOutsidePointerEvent(event)) {
    emit('close');
  }
}

/**
 * 处理键盘关闭。
 * @param event - 键盘事件
 */
function handleDocumentKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    emit('close');
  }
}

/**
 * 处理窗口尺寸变化。
 */
function handleWindowResize(): void {
  scheduleMenuSizeSync();
}

/**
 * 同步全局关闭监听。
 * @param open - 菜单是否打开
 */
function syncDocumentListeners(open: boolean): void {
  if (open) {
    document.addEventListener('pointerdown', handleDocumentPointerDown, true);
    document.addEventListener('keydown', handleDocumentKeydown, true);
    window.addEventListener('resize', handleWindowResize);
    return;
  }

  document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
  document.removeEventListener('keydown', handleDocumentKeydown, true);
  window.removeEventListener('resize', handleWindowResize);
}

watch(() => props.open, syncDocumentListeners, { immediate: true });
watch(
  () => [props.open, props.position.x, props.position.y, props.items.length],
  (): void => {
    scheduleMenuSizeSync();
  },
  { immediate: true, flush: 'post' }
);

onBeforeUnmount((): void => {
  syncDocumentListeners(false);
});
</script>

<style lang="less" scoped>
.b-widget-context-menu {
  position: fixed;
  z-index: 40;
  display: flex;
  flex-direction: column;
  min-width: 168px;
  padding: 4px;
  background: var(--dropdown-bg);
  border: 1px solid var(--dropdown-border);
  border-radius: 8px;
  box-shadow: 0 12px 32px rgb(15 23 42 / 16%);
}

.b-widget-context-menu__item {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
  height: 30px;
  padding: 0 8px;
  font-size: 12px;
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 6px;
}

.b-widget-context-menu__item:hover:not(:disabled) {
  background: var(--bg-secondary);
}

.b-widget-context-menu__item:disabled {
  color: var(--text-disabled);
  cursor: not-allowed;
}

.b-widget-context-menu__item.is-danger:not(:disabled) {
  color: var(--color-danger);
}

.b-widget-context-menu__divider {
  height: 1px;
  margin: 4px 6px;
  background: var(--border-primary);
}

.b-widget-context-menu__icon {
  flex-shrink: 0;
}

.b-widget-context-menu__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
