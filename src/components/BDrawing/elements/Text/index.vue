<!--
  @file index.vue
  @description BDrawing 文本元素中间画布视图。
-->
<template>
  <div class="drawing-text-element-view" :style="textStyle">{{ element?.title }}</div>
</template>

<script setup lang="ts">
import type { DrawingShapeElement } from '../../types';
import type { CSSProperties } from 'vue';
import { computed } from 'vue';
import { createDrawingElementStyleProperties } from '../../utils/drawingStyle';

/**
 * 文本元素中间画布视图入参。
 */
interface Props {
  /** 当前文本元素 */
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

/**
 * 解析文字纵向对齐到 flex 对齐方式。
 * @param textVerticalAlign - 文字纵向对齐
 * @returns flex 交叉轴对齐方式
 */
function resolveVerticalAlign(textVerticalAlign: DrawingShapeElement['style']['textVerticalAlign']): string | undefined {
  if (textVerticalAlign === 'top') {
    return 'flex-start';
  }

  if (textVerticalAlign === 'bottom') {
    return 'flex-end';
  }

  if (textVerticalAlign === 'middle') {
    return 'center';
  }

  return undefined;
}

/** 文本视图样式，需与内容尺寸测量逻辑保持一致。 */
const textStyle = computed<CSSProperties>(() => {
  const style = props.element?.style;

  return {
    ...createDrawingElementStyleProperties(style),
    alignItems: resolveVerticalAlign(style?.textVerticalAlign),
    color: style?.color,
    fontSize: style?.fontSize === undefined ? undefined : `${style.fontSize}px`,
    fontWeight: style?.fontWeight,
    justifyContent: resolveHorizontalAlign(style?.textAlign),
    textAlign: style?.textAlign
  };
});
</script>

<style lang="less" scoped>
.drawing-text-element-view {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 2px 3px;
  font-size: 13px;
  line-height: 1.35;
  color: var(--text-primary);
  white-space: pre;
}
</style>
