<!--
  @file index.vue
  @description BDrawing 矩形元素中间画布视图。
-->
<template>
  <div class="drawing-rect-element-view" :style="rectStyle"></div>
</template>

<script setup lang="ts">
import type { DrawingShapeElement } from '../../types';
import type { CSSProperties } from 'vue';
import { computed } from 'vue';
import { createDrawingElementStyleProperties } from '../../utils/drawingStyle';

/**
 * 矩形元素中间画布视图入参。
 */
interface Props {
  /** 当前矩形元素 */
  element?: DrawingShapeElement;
}

const props = defineProps<Props>();

/**
 * 解析文字横向对齐到 flex 对齐方式。
 * @param textAlign - 文字横向对齐
 * @returns flex 主轴对齐方式
 */
function resolveHorizontalAlign(textAlign: DrawingShapeElement['style']['textAlign']): string | undefined {
  if (textAlign === 'left') {
    return 'flex-start';
  }

  if (textAlign === 'right') {
    return 'flex-end';
  }

  if (textAlign === 'center') {
    return 'center';
  }

  return undefined;
}

/** 矩形视图样式。 */
const rectStyle = computed<CSSProperties>(() => {
  const style = props.element?.style;

  return {
    ...createDrawingElementStyleProperties(style),
    color: style?.color,
    fontSize: style?.fontSize === undefined ? undefined : `${style.fontSize}px`,
    fontWeight: style?.fontWeight,
    justifyContent: resolveHorizontalAlign(style?.textAlign),
    textAlign: style?.textAlign
  };
});
</script>

<style lang="less" scoped>
.drawing-rect-element-view {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: var(--text-primary);
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
}
</style>
