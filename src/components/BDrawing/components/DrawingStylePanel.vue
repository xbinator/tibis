<!--
  @file DrawingStylePanel.vue
  @description BDrawing 左侧节点样式配置面板。
-->
<template>
  <aside v-if="element || connector || draftStyle || draftConnector" class="b-drawing-style-panel" @pointerdown.stop>
    <section class="b-drawing-style-panel__section">
      <span class="b-drawing-style-panel__label">描边</span>
      <BColorPicker :value="strokeValue" format="hex" placement="rightTop" :align="{ offset: [20, 0] }" @change="handleColorClick('stroke', $event)" />
    </section>

    <section v-if="showFillControls" class="b-drawing-style-panel__section">
      <span class="b-drawing-style-panel__label">背景</span>
      <BColorPicker :value="fillValue" format="hex" placement="rightTop" :align="{ offset: [20, 0] }" @change="handleColorClick('fill', $event)" />
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
          type="button"
          @click="handleStrokeWidthClick(option.value)"
        >
          <span class="b-drawing-style-panel__stroke-line" :style="{ height: `${option.previewHeight}px` }"></span>
        </button>
      </div>
    </section>

    <section v-if="showConnectorControls" class="b-drawing-style-panel__section">
      <span class="b-drawing-style-panel__label">曲线</span>
      <div class="b-drawing-style-panel__segments">
        <button
          v-for="option in curveOptions"
          :key="option.value"
          class="b-drawing-style-panel__segment-button"
          :class="{ 'is-active': curveValue === option.value }"
          :aria-label="option.label"
          type="button"
          @click="handleCurveClick(option.value)"
        >
          <BIcon :icon="option.icon" :size="15" />
        </button>
      </div>
    </section>

    <section v-if="showConnectorControls" class="b-drawing-style-panel__section">
      <span class="b-drawing-style-panel__label">起点箭头</span>
      <div class="b-drawing-style-panel__segments">
        <button
          v-for="option in markerOptions"
          :key="option.value"
          class="b-drawing-style-panel__segment-button"
          :class="{ 'is-active': markerStartValue === option.value }"
          :aria-label="`起点${option.label}`"
          type="button"
          @click="handleMarkerClick('markerStart', option.value)"
        >
          <BIcon :icon="option.icon" :rotate="getMarkerIconRotate('markerStart', option.value)" :size="15" />
        </button>
      </div>
    </section>

    <section v-if="showConnectorControls" class="b-drawing-style-panel__section">
      <span class="b-drawing-style-panel__label">终点箭头</span>
      <div class="b-drawing-style-panel__segments">
        <button
          v-for="option in markerOptions"
          :key="option.value"
          class="b-drawing-style-panel__segment-button"
          :class="{ 'is-active': markerEndValue === option.value }"
          :aria-label="`终点${option.label}`"
          type="button"
          @click="handleMarkerClick('markerEnd', option.value)"
        >
          <BIcon :icon="option.icon" :rotate="getMarkerIconRotate('markerEnd', option.value)" :size="15" />
        </button>
      </div>
    </section>
  </aside>
</template>

<script setup lang="ts">
import type {
  DrawingConnectorCurveType,
  DrawingConnectorDraftOptions,
  DrawingConnectorElement,
  DrawingConnectorMarkerType,
  DrawingConnectorOptionsChange,
  DrawingElementStyle,
  DrawingElementStyleChange,
  DrawingShapeElement
} from '../types';
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
 * 连接线分段按钮选项。
 */
interface ConnectorSegmentOption<TValue extends string> {
  /** 选项值 */
  value: TValue;
  /** 访问性标签 */
  label: string;
  /** 图标名称 */
  icon: string;
}

/**
 * 样式面板入参。
 */
interface Props {
  /** 当前可编辑的形状元素 */
  element: DrawingShapeElement | null;
  /** 当前可编辑的连接线元素 */
  connector?: DrawingConnectorElement | null;
  /** 创建工具激活时待应用到下一个元素的样式 */
  draftStyle?: DrawingElementStyle | null;
  /** 创建连接线时待应用到下一条连接线的配置 */
  draftConnector?: DrawingConnectorDraftOptions | null;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  /** 更新元素样式 */
  change: [style: DrawingElementStyleChange];
  /** 更新连接线配置 */
  'connector-change': [options: DrawingConnectorOptionsChange];
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
/** 连接线端点标记选项。 */
const MARKER_OPTIONS: readonly ConnectorSegmentOption<DrawingConnectorMarkerType>[] = [
  { value: 'none', label: '无箭头', icon: 'lucide:minus' },
  { value: 'arrow', label: '箭头', icon: 'lucide:arrow-right' }
];
/** 连接线路径选项。 */
const CURVE_OPTIONS: readonly ConnectorSegmentOption<DrawingConnectorCurveType>[] = [
  { value: 'straight', label: '直线', icon: 'lucide:minus' },
  { value: 'bezier', label: '贝塞尔曲线', icon: 'lucide:spline' }
];

const fillValue = computed<string>(() => (props.element ? props.element.style?.fill : props.draftStyle?.fill) ?? DEFAULT_FILL);
const strokeValue = computed<string>(() => {
  if (props.connector) {
    return props.connector.style?.stroke ?? DEFAULT_STROKE;
  }
  if (props.draftConnector) {
    return props.draftConnector.style?.stroke ?? DEFAULT_STROKE;
  }

  return (props.element ? props.element.style?.stroke : props.draftStyle?.stroke) ?? DEFAULT_STROKE;
});
const strokeWidthValue = computed<number>(() => {
  if (props.connector) {
    return props.connector.style?.strokeWidth ?? DEFAULT_STROKE_WIDTH;
  }
  if (props.draftConnector) {
    return props.draftConnector.style?.strokeWidth ?? DEFAULT_STROKE_WIDTH;
  }

  return (props.element ? props.element.style?.strokeWidth : props.draftStyle?.strokeWidth) ?? DEFAULT_STROKE_WIDTH;
});
const strokeWidthOptions = computed<readonly StrokeWidthOption[]>(() => STROKE_WIDTH_OPTIONS);
const markerOptions = computed<readonly ConnectorSegmentOption<DrawingConnectorMarkerType>[]>(() => MARKER_OPTIONS);
const curveOptions = computed<readonly ConnectorSegmentOption<DrawingConnectorCurveType>[]>(() => CURVE_OPTIONS);
const showFillControls = computed<boolean>(() => Boolean(props.element || props.draftStyle));
const showConnectorControls = computed<boolean>(() => Boolean(props.connector || props.draftConnector));
const markerStartValue = computed<DrawingConnectorMarkerType>(() => props.connector?.markerStart ?? props.draftConnector?.markerStart ?? 'none');
const markerEndValue = computed<DrawingConnectorMarkerType>(() => props.connector?.markerEnd ?? props.draftConnector?.markerEnd ?? 'arrow');
const curveValue = computed<DrawingConnectorCurveType>(() => props.connector?.curve ?? props.draftConnector?.curve ?? 'straight');

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

/**
 * 处理连接线端点标记点击。
 * @param key - 连接线标记字段
 * @param value - 标记类型
 */
function handleMarkerClick(key: 'markerStart' | 'markerEnd', value: DrawingConnectorMarkerType): void {
  emit('connector-change', {
    [key]: value
  });
}

/**
 * 处理连接线路径类型点击。
 * @param value - 路径类型
 */
function handleCurveClick(value: DrawingConnectorCurveType): void {
  emit('connector-change', {
    curve: value
  });
}

/**
 * 读取箭头按钮图标旋转角度。
 * @param key - 连接线标记字段
 * @param value - 标记类型
 * @returns 图标旋转角度
 */
function getMarkerIconRotate(key: 'markerStart' | 'markerEnd', value: DrawingConnectorMarkerType): number {
  if (value !== 'arrow') {
    return 0;
  }

  return key === 'markerStart' ? 180 : 0;
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
  width: fit-content;
  padding: 12px;
  pointer-events: auto;
  background: var(--bg-primary);
  border: 1px solid color-mix(in srgb, var(--border-primary) 82%, transparent);
  border-radius: 8px;
  box-shadow: 0 12px 28px rgb(0 0 0 / 10%);
  backdrop-filter: blur(12px);
}

.b-drawing-style-panel :deep(.b-color-picker__trigger),
.b-drawing-style-panel :deep(.b-color-picker__presets) {
  width: max-content;
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

.b-drawing-style-panel__stroke-button,
.b-drawing-style-panel__segment-button {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 28px;
  padding: 0;
  color: var(--text-secondary);
  cursor: pointer;
  background: color-mix(in srgb, var(--bg-tertiary) 90%, transparent);
  border: 1px solid transparent;
  border-radius: 6px;
}

.b-drawing-style-panel__stroke-button {
  width: 28px;
}

.b-drawing-style-panel__segment-button {
  width: 32px;
}

.b-drawing-style-panel__stroke-button.is-active,
.b-drawing-style-panel__segment-button.is-active {
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 14%, var(--bg-tertiary));
  border-color: color-mix(in srgb, var(--color-primary) 22%, transparent);
}

.b-drawing-style-panel__segments {
  display: flex;
  gap: 7px;
}

.b-drawing-style-panel__stroke-line {
  display: block;
  width: 18px;
  background: currentColor;
  border-radius: 999px;
}
</style>
