<!--
  @file DrawingStylePanel.vue
  @description BDrawing 左侧节点样式配置面板。
-->
<template>
  <aside v-if="element" class="b-drawing-style-panel" data-testid="drawing-style-panel" @pointerdown.stop>
    <section class="b-drawing-style-panel__section">
      <span class="b-drawing-style-panel__label">描边</span>
      <BColorPicker :value="strokeValue" format="hex" input-test-id="drawing-style-stroke-input" @change="handleColorClick('stroke', $event)" />
    </section>

    <section class="b-drawing-style-panel__section">
      <span class="b-drawing-style-panel__label">背景</span>
      <BColorPicker :value="fillValue" format="hex" input-test-id="drawing-style-fill-input" @change="handleColorClick('fill', $event)" />
    </section>

    <section class="b-drawing-style-panel__section">
      <span class="b-drawing-style-panel__label">描边宽度</span>
      <div class="b-drawing-style-panel__stroke-widths">
        <button
          v-for="option in strokeWidthOptions"
          :key="option.id"
          class="b-drawing-style-panel__stroke-button"
          :class="{ 'is-active': strokeWidthValue === option.value }"
          :aria-label="option.label"
          :data-testid="`drawing-style-stroke-width-${option.id}`"
          type="button"
          @click="handleStrokeWidthClick(option.value)"
        >
          <span class="b-drawing-style-panel__stroke-line" :style="{ height: `${option.previewHeight}px` }"></span>
        </button>
      </div>
    </section>
  </aside>
</template>

<script setup lang="ts">
import type { DrawingElementStyleChange, DrawingShapeElement } from '../types';
import { computed } from 'vue';
import BColorPicker from '@/components/BColorPicker/index.vue';

/**
 * 描边宽度选项。
 */
interface StrokeWidthOption {
  /** 宽度 ID */
  id: string;
  /** 宽度名称 */
  label: string;
  /** 实际描边宽度 */
  value: number;
  /** 预览线条高度 */
  previewHeight: number;
}

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
const DEFAULT_FILL = 'transparent';
/** 默认边框色。 */
const DEFAULT_STROKE = '#64748b';
/** 默认边框宽度。 */
const DEFAULT_STROKE_WIDTH = 1.5;
/** 描边宽度选项。 */
const STROKE_WIDTH_OPTIONS: readonly StrokeWidthOption[] = [
  { id: 'thin', label: '细描边', value: 1.5, previewHeight: 1 },
  { id: 'medium', label: '中描边', value: 3, previewHeight: 2 },
  { id: 'bold', label: '粗描边', value: 5, previewHeight: 4 }
];

const fillValue = computed<string>(() => props.element?.style?.fill ?? DEFAULT_FILL);
const strokeValue = computed<string>(() => props.element?.style?.stroke ?? DEFAULT_STROKE);
const strokeWidthValue = computed<number>(() => props.element?.style?.strokeWidth ?? DEFAULT_STROKE_WIDTH);
const strokeWidthOptions = computed<readonly StrokeWidthOption[]>(() => STROKE_WIDTH_OPTIONS);

/**
 * 处理颜色按钮点击。
 * @param key - 样式字段
 * @param value - 颜色值
 */
function handleColorClick(key: 'fill' | 'stroke', value: string): void {
  emit('change', {
    [key]: value
  });
}

/**
 * 处理描边宽度按钮点击。
 * @param value - 描边宽度
 */
function handleStrokeWidthClick(value: number): void {
  emit('change', {
    strokeWidth: value
  });
}
</script>

<style lang="less" scoped>
.b-drawing-style-panel {
  position: absolute;
  top: 64px;
  left: 12px;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 220px;
  padding: 12px;
  pointer-events: auto;
  background: var(--bg-primary);
  border: 1px solid color-mix(in srgb, var(--border-primary) 82%, transparent);
  border-radius: 8px;
  box-shadow: 0 12px 28px rgb(0 0 0 / 10%);
  backdrop-filter: blur(12px);
}

.b-drawing-style-panel__section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.b-drawing-style-panel__label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.b-drawing-style-panel__stroke-widths {
  display: flex;
  gap: 7px;
}

.b-drawing-style-panel__stroke-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  color: var(--text-secondary);
  cursor: pointer;
  background: color-mix(in srgb, var(--bg-tertiary) 90%, transparent);
  border: 1px solid transparent;
  border-radius: 6px;
}

.b-drawing-style-panel__stroke-button.is-active {
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 14%, var(--bg-tertiary));
  border-color: color-mix(in srgb, var(--color-primary) 22%, transparent);
}

.b-drawing-style-panel__stroke-line {
  display: block;
  width: 18px;
  background: currentColor;
  border-radius: 999px;
}
</style>
