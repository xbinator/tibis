<!--
  @file DrawingStylePanel.vue
  @description BDrawing 左侧节点样式配置面板。
-->
<template>
  <aside class="b-drawing-style-panel" data-testid="drawing-style-panel">
    <template v-if="element">
      <div class="b-drawing-style-panel__header">
        <span class="b-drawing-style-panel__title">样式</span>
        <span class="b-drawing-style-panel__meta">{{ element.shape }}</span>
      </div>

      <label class="b-drawing-style-panel__field">
        <span class="b-drawing-style-panel__label">填充</span>
        <input
          class="b-drawing-style-panel__color"
          data-testid="drawing-style-fill"
          type="color"
          :value="fillValue"
          @input="handleColorInput('fill', $event)"
        />
      </label>

      <label class="b-drawing-style-panel__field">
        <span class="b-drawing-style-panel__label">边框</span>
        <input class="b-drawing-style-panel__color" type="color" :value="strokeValue" @input="handleColorInput('stroke', $event)" />
      </label>

      <label class="b-drawing-style-panel__field">
        <span class="b-drawing-style-panel__label">文字</span>
        <input class="b-drawing-style-panel__color" type="color" :value="textValue" @input="handleColorInput('color', $event)" />
      </label>

      <label class="b-drawing-style-panel__field">
        <span class="b-drawing-style-panel__label">线宽</span>
        <input
          class="b-drawing-style-panel__number"
          min="0"
          max="12"
          step="1"
          type="number"
          :value="strokeWidthValue"
          @input="handleNumberInput('strokeWidth', $event)"
        />
      </label>

      <label class="b-drawing-style-panel__field b-drawing-style-panel__field--stacked">
        <span class="b-drawing-style-panel__label">透明度 {{ opacityPercent }}</span>
        <input
          class="b-drawing-style-panel__range"
          min="0.1"
          max="1"
          step="0.05"
          type="range"
          :value="opacityValue"
          @input="handleNumberInput('opacity', $event)"
        />
      </label>
    </template>
    <div v-else class="b-drawing-style-panel__empty">未选中节点</div>
  </aside>
</template>

<script setup lang="ts">
import type { DrawingElementStyleChange, DrawingShapeElement } from '../types';
import { computed } from 'vue';

/**
 * 样式面板入参。
 */
interface Props {
  /** 当前可编辑的形状元素 */
  element: DrawingShapeElement | null;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  /** 更新元素样式 */
  change: [style: DrawingElementStyleChange];
}>();

/** 默认填充色。 */
const DEFAULT_FILL = '#ffffff';
/** 默认边框色。 */
const DEFAULT_STROKE = '#64748b';
/** 默认文字色。 */
const DEFAULT_TEXT = '#111827';
/** 默认边框宽度。 */
const DEFAULT_STROKE_WIDTH = 1.5;
/** 默认透明度。 */
const DEFAULT_OPACITY = 1;

const fillValue = computed<string>(() => props.element?.style?.fill ?? DEFAULT_FILL);
const strokeValue = computed<string>(() => props.element?.style?.stroke ?? DEFAULT_STROKE);
const textValue = computed<string>(() => props.element?.style?.color ?? DEFAULT_TEXT);
const strokeWidthValue = computed<number>(() => props.element?.style?.strokeWidth ?? DEFAULT_STROKE_WIDTH);
const opacityValue = computed<number>(() => props.element?.style?.opacity ?? DEFAULT_OPACITY);
const opacityPercent = computed<string>(() => `${Math.round(opacityValue.value * 100)}%`);

/**
 * 从输入事件读取输入框元素。
 * @param event - 输入事件
 * @returns 输入框元素
 */
function getInputElement(event: Event): HTMLInputElement {
  return event.target as HTMLInputElement;
}

/**
 * 处理颜色输入变更。
 * @param key - 样式字段
 * @param event - 输入事件
 */
function handleColorInput(key: 'fill' | 'stroke' | 'color', event: Event): void {
  emit('change', {
    [key]: getInputElement(event).value
  });
}

/**
 * 处理数字输入变更。
 * @param key - 样式字段
 * @param event - 输入事件
 */
function handleNumberInput(key: 'strokeWidth' | 'opacity', event: Event): void {
  emit('change', {
    [key]: Number(getInputElement(event).value)
  });
}
</script>

<style lang="less" scoped>
.b-drawing-style-panel {
  position: absolute;
  top: 76px;
  left: 12px;
  z-index: 9;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 188px;
  padding: 12px;
  pointer-events: auto;
  background: color-mix(in srgb, var(--bg-primary) 82%, transparent);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  box-shadow: var(--shadow-md);
  backdrop-filter: blur(12px);
}

.b-drawing-style-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.b-drawing-style-panel__title {
  font-size: 13px;
  font-weight: 650;
  color: var(--text-primary);
}

.b-drawing-style-panel__meta {
  font-size: 11px;
  color: var(--text-tertiary);
}

.b-drawing-style-panel__field {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}

.b-drawing-style-panel__field--stacked {
  flex-direction: column;
  gap: 6px;
  align-items: stretch;
}

.b-drawing-style-panel__label {
  font-size: 12px;
  color: var(--text-secondary);
}

.b-drawing-style-panel__color {
  width: 28px;
  height: 24px;
  padding: 0;
  cursor: pointer;
  background: transparent;
  border: 1px solid var(--border-primary);
  border-radius: 4px;
}

.b-drawing-style-panel__number {
  width: 64px;
  height: 28px;
  padding: 0 6px;
  font-size: 12px;
  color: var(--text-primary);
  background: var(--bg-elevated);
  border: 1px solid var(--border-primary);
  border-radius: 4px;
}

.b-drawing-style-panel__range {
  width: 100%;
}

.b-drawing-style-panel__empty {
  font-size: 12px;
  color: var(--text-tertiary);
}
</style>
