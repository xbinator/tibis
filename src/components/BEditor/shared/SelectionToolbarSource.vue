<template>
  <Teleport v-if="overlayRoot" :to="overlayRoot">
    <div v-if="visible" ref="toolbarRef" :class="name" :style="style">
      <SelectionToolbar
        :format-buttons="formatButtons"
        @ai="$emit('ai')"
        @reference="$emit('reference')"
        @comment="$emit('comment')"
        @format="$emit('format', $event)"
      />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * @file SelectionToolbarSource.vue
 * @description Source 模式选区工具栏宿主，使用绝对定位浮层承载内容组件。
 */
import type { SelectionAssistantPosition, SelectionToolbarAction } from '../adapters/selectionAssistant';
import type { CSSProperties } from 'vue';
import { nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { useEventListener, useResizeObserver } from '@vueuse/core';
import { createNamespace } from '@/utils/namespace';
import { resolveToolbarContainerRect, resolveToolbarLeft } from '../utils/selectionToolbarPosition';
import SelectionToolbar from './SelectionToolbar.vue';

const [name] = createNamespace('', 'b-markdown-selsource');

/**
 * 格式按钮定义（source 模式下无格式按钮，此接口保留以兼容内容组件）。
 */
interface FormatButton {
  command: SelectionToolbarAction;
  icon: string;
  active?: boolean;
}

interface Props {
  /** 工具栏是否可见 */
  visible?: boolean;
  /** 工具栏定位信息 */
  position?: SelectionAssistantPosition | null;
  /** 浮层根容器 DOM 元素 */
  overlayRoot?: HTMLElement | null;
  /** 需要展示的格式按钮列表（source 模式下为空） */
  formatButtons?: FormatButton[];
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  position: null,
  overlayRoot: null,
  formatButtons: () => []
});

defineEmits<{
  (e: 'ai'): void;
  (e: 'reference'): void;
  (e: 'comment'): void;
  (e: 'format', command: SelectionToolbarAction): void;
}>();

// ─── 常量 ────────────────────────────────────────────────────────────────────

/**
 * 工具栏浮层与选区之间的间距。
 */
const TOOLBAR_GAP = 8;

/**
 * 工具栏相对容器的最小安全边距。
 */
const TOOLBAR_PADDING = 8;

const TOOLBAR_Z_INDEX = 100;

/** 隐藏时复用同一个对象，避免重复创建 */
const HIDDEN_STYLE: CSSProperties = { display: 'none' };

/** DOM 未测量时占位，visibility:hidden 保证不可见但可测量尺寸 */
const MEASURING_STYLE: CSSProperties = {
  position: 'absolute',
  top: '0px',
  left: '0px',
  visibility: 'hidden',
  zIndex: TOOLBAR_Z_INDEX
};

// ─── 状态 ────────────────────────────────────────────────────────────────────

const toolbarRef = ref<HTMLElement | null>(null);
const style = shallowRef<CSSProperties>(HIDDEN_STYLE);
const hasMeasuredPosition = ref(false);
const pointerPressActive = ref(false);
let cleanupOverlayPointerListeners: (() => void) | null = null;

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

/**
 * 判断是否应该隐藏工具栏。
 * @returns 是否应该隐藏
 */
function shouldHide(): boolean {
  return pointerPressActive.value || !props.visible || !props.position;
}

/**
 * 隐藏工具栏。
 */
function hide(): void {
  hasMeasuredPosition.value = false;
  style.value = HIDDEN_STYLE;
}

// ─── 定位计算 ─────────────────────────────────────────────────────────────────

/**
 * 基于当前锚点、工具栏尺寸和容器边界同步最终定位。
 * 顶部空间不足时翻转到选区下方；若上下两种位置都不在当前视图内，则固定贴到视图底边。
 */
function syncStyle(): void {
  if (shouldHide()) {
    hide();
    return;
  }

  const { position } = props;
  const toolbarEl = toolbarRef.value;
  const toolbarRect = toolbarEl?.getBoundingClientRect();
  const toolbarWidth = toolbarRect?.width ?? toolbarEl?.offsetWidth ?? 0;
  const toolbarHeight = toolbarRect?.height ?? toolbarEl?.offsetHeight ?? 0;

  // 尚未挂载或尺寸未就绪：切换到占位样式等待下一次测量
  if (toolbarWidth <= 0 || toolbarHeight <= 0) {
    hasMeasuredPosition.value = false;
    style.value = MEASURING_STYLE;
    return;
  }

  const containerRect = resolveToolbarContainerRect(position!, props.overlayRoot);
  const belowRect = position!.selectionRect ?? position!.anchorRect;
  const topBelow = belowRect.top + belowRect.height + TOOLBAR_GAP;
  const preferBelow = position!.anchorRect.top < containerRect.top;

  // 水平：居中对齐锚点，并约束在容器内
  const left = resolveToolbarLeft(position!.anchorRect, containerRect, toolbarWidth, TOOLBAR_PADDING);

  // 垂直：优先显示在选区上方，空间不足时翻转到下方
  const topAbove = position!.anchorRect.top - toolbarHeight - TOOLBAR_GAP;
  const minTop = containerRect.top + TOOLBAR_PADDING;
  const maxTop = containerRect.top + containerRect.height - toolbarHeight - TOOLBAR_PADDING;
  let top = topBelow;
  if (!preferBelow && topAbove >= minTop) {
    top = topAbove;
  } else if (topBelow < minTop || topBelow > maxTop) {
    top = maxTop;
  }

  style.value = {
    position: 'absolute',
    top: `${top}px`,
    left: `${left}px`,
    visibility: 'visible',
    zIndex: TOOLBAR_Z_INDEX
  };
  hasMeasuredPosition.value = true;
}

/**
 * 等 DOM 更新后重新测量并同步定位。
 * 适用于显隐切换、锚点变化、内容尺寸变化后的重排。
 */
function syncStyleOnNextTick(): void {
  if (shouldHide()) {
    hide();
    return;
  }

  if (!hasMeasuredPosition.value) {
    style.value = MEASURING_STYLE;
  }

  nextTick(syncStyle);
}

// ─── 指针监听 ─────────────────────────────────────────────────────────────────

/**
 * 绑定 overlayRoot 上的指针按下/抬起监听。
 * 按下编辑区时立即隐藏 toolbar，避免拖拽开始瞬间闪现。
 */
function bindOverlayPointerListeners(): void {
  cleanupOverlayPointerListeners?.();
  const { overlayRoot } = props;
  if (!overlayRoot) return;

  const onPointerDown = (event: PointerEvent): void => {
    if (toolbarRef.value?.contains(event.target as Node)) return;
    pointerPressActive.value = true;
    hide();
  };

  const onPointerUp = (): void => {
    if (!pointerPressActive.value) return;
    pointerPressActive.value = false;
    syncStyleOnNextTick();
  };

  overlayRoot.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('pointerup', onPointerUp, true);

  cleanupOverlayPointerListeners = (): void => {
    overlayRoot.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('pointerup', onPointerUp, true);
  };
}

// ─── 侦听器 & 生命周期 ────────────────────────────────────────────────────────

watch([() => props.visible, () => props.position, () => props.formatButtons], syncStyleOnNextTick, {
  deep: true,
  immediate: true
});

watch(() => props.overlayRoot, bindOverlayPointerListeners, { immediate: true });

useResizeObserver(toolbarRef, syncStyle);
useEventListener(window, 'resize', syncStyle);

onBeforeUnmount((): void => {
  cleanupOverlayPointerListeners?.();
  cleanupOverlayPointerListeners = null;
  style.value = HIDDEN_STYLE;
});
</script>
