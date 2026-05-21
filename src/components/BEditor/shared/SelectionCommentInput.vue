<!--
  @file SelectionCommentInput.vue
  @description 选区评论输入面板，定位逻辑参考 SelectionAIInput，当前仅包含输入框。
-->
<template>
  <div v-if="visible" ref="wrapperRef" :class="name" :style="wrapperStyle">
    <AInput v-model:value="inputValue" v-focus size="large" placeholder="输入评论..." @keydown="onKeydown" />
  </div>
</template>

<script setup lang="ts">
/**
 * @file SelectionCommentInput.vue
 * @description 选区评论输入面板，定位逻辑参考 SelectionAIInput，当前仅包含输入框。
 */
import type { SelectionAssistantPosition } from '../adapters/selectionAssistant';
import type { CSSProperties } from 'vue';
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useEventListener, useResizeObserver } from '@vueuse/core';
import { vFocus } from '@/directives/focus';
import { createNamespace } from '@/utils/namespace';

const [name] = createNamespace('', 'b-markdown-selcomment');

interface Props {
  /** 面板是否可见 */
  visible?: boolean;
  /** 面板定位信息（由编排层注入） */
  position?: SelectionAssistantPosition | null;
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  position: null
});

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'submit', content: string): void;
}>();

const inputValue = ref('');
const wrapperRef = ref<HTMLElement | null>(null);
const wrapperStyle = ref<CSSProperties>({});
const hasMeasuredPosition = ref(false);

/**
 * 评论面板与锚点之间的垂直间距。
 */
const PANEL_GAP = 6;

/**
 * 评论面板相对容器的最小安全边距。
 */
const PANEL_PADDING = 16;

/**
 * 评论面板的期望宽度。
 */
const PREFERRED_PANEL_WIDTH = 500;

/**
 * 构造隐藏态面板样式，横向始终保持容器居中。
 * @param width - 面板宽度
 * @returns 隐藏态样式对象
 */
function createHiddenWrapperStyle(width: number): CSSProperties {
  return {
    top: '0px',
    left: '50%',
    transform: 'translateX(-50%)',
    visibility: 'hidden',
    width: `${width}px`
  };
}

/**
 * 读取面板当前尺寸。
 * @param element - 面板宿主节点
 * @returns 面板宽高
 */
function getWrapperSize(element: HTMLElement): { width: number; height: number } {
  const width = element.offsetWidth || element.getBoundingClientRect().width;
  const height = element.offsetHeight || element.getBoundingClientRect().height;
  return { width, height };
}

/**
 * 根据容器宽度计算面板最终宽度。
 * @param containerWidth - 浮层容器宽度
 * @returns 受安全边距约束后的面板宽度
 */
function resolvePanelWidth(containerWidth: number): number {
  const maxWidth = Math.max(0, containerWidth - PANEL_PADDING * 2);
  return Math.min(PREFERRED_PANEL_WIDTH, maxWidth);
}

/**
 * 当横向居中后，若面板宽度超出容器可用区域，则回退为左侧贴边。
 * @param containerRect - 浮层容器矩形
 * @param wrapperWidth - 面板宽度
 * @returns 横向定位样式
 */
function resolveHorizontalStyle(containerRect: SelectionAssistantPosition['containerRect'], wrapperWidth: number): CSSProperties {
  if (!containerRect) {
    return {
      left: '50%',
      transform: 'translateX(-50%)'
    };
  }

  const minLeft = containerRect.left + PANEL_PADDING;
  const maxLeft = containerRect.left + containerRect.width - wrapperWidth - PANEL_PADDING;
  const centeredLeft = containerRect.left + containerRect.width / 2 - wrapperWidth / 2;
  const clampedLeft = Math.min(Math.max(centeredLeft, minLeft), maxLeft);

  if (Math.abs(clampedLeft - centeredLeft) < 0.5) {
    return {
      left: '50%',
      transform: 'translateX(-50%)'
    };
  }

  return {
    left: `${clampedLeft}px`,
    transform: 'none'
  };
}

/**
 * 计算面板纵向位置，优先显示在选区下方，空间不足时回退到上方。
 * @param position - 编排层注入的锚点信息
 * @param containerRect - 浮层容器矩形
 * @param wrapperHeight - 面板高度
 * @returns 纵向像素值
 */
function resolvePanelTop(
  position: SelectionAssistantPosition,
  containerRect: NonNullable<SelectionAssistantPosition['containerRect']>,
  wrapperHeight: number
): number {
  const preferredTop = position.anchorRect.top + position.lineHeight + PANEL_GAP;
  const fallbackTop = position.anchorRect.top - wrapperHeight - PANEL_GAP;
  const maxTop = containerRect.top + containerRect.height - wrapperHeight - PANEL_PADDING;
  return preferredTop <= maxTop ? preferredTop : Math.max(containerRect.top + PANEL_PADDING, fallbackTop);
}

/**
 * 根据编排层注入的 position 更新面板定位。
 */
function syncFloatPosition(): void {
  const { position } = props;
  const wrapperElement = wrapperRef.value;
  if (!position || !wrapperElement) return;

  const containerRect = position.containerRect ?? {
    top: 0,
    left: 0,
    width: window.innerWidth,
    height: window.innerHeight
  };

  const width = resolvePanelWidth(containerRect.width);
  const { width: wrapperWidth, height: wrapperHeight } = getWrapperSize(wrapperElement);

  if (wrapperWidth <= 0 || wrapperHeight <= 0) {
    hasMeasuredPosition.value = false;
    wrapperStyle.value = createHiddenWrapperStyle(width);
    return;
  }

  const top = resolvePanelTop(position, containerRect, wrapperHeight);
  const horizontalStyle = resolveHorizontalStyle(position.containerRect ?? containerRect, wrapperWidth);

  wrapperStyle.value = {
    top: `${top}px`,
    visibility: 'visible',
    width: `${width}px`,
    ...horizontalStyle
  };
  hasMeasuredPosition.value = true;
}

/**
 * 提交批注内容。
 */
function submitComment(): void {
  const trimmed = inputValue.value.trim();
  if (!trimmed) return;
  emit('submit', trimmed);
  inputValue.value = '';
  emit('update:visible', false);
}

/**
 * 关闭评论面板。
 */
function closePanel(): void {
  inputValue.value = '';
  emit('update:visible', false);
}

/**
 * 键盘事件处理。
 * @param event - 键盘事件
 */
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    closePanel();
  } else if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    submitComment();
  }
}

watch(
  () => props.visible,
  (isVisible) => {
    if (isVisible) {
      hasMeasuredPosition.value = false;
      wrapperStyle.value = createHiddenWrapperStyle(PREFERRED_PANEL_WIDTH);
      nextTick(syncFloatPosition);
    } else {
      hasMeasuredPosition.value = false;
      inputValue.value = '';
    }
  },
  { immediate: true }
);

watch(
  () => props.position,
  () => {
    if (!props.visible) return;
    if (!hasMeasuredPosition.value) {
      wrapperStyle.value = createHiddenWrapperStyle(PREFERRED_PANEL_WIDTH);
    }
    nextTick(syncFloatPosition);
  }
);

useResizeObserver(wrapperRef, () => {
  syncFloatPosition();
});

useEventListener(window, 'resize', () => {
  if (props.visible) syncFloatPosition();
});

onBeforeUnmount(() => {
  wrapperStyle.value = {};
});
</script>

<style lang="less" scoped>
.b-markdown-selcomment {
  position: absolute;
  z-index: 1000;
  max-width: calc(100% - 32px);

  &__input-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }
}
</style>
