<!--
  @file DrawingStylePanel.vue
  @description BDrawing 左侧节点样式配置面板。
-->
<template>
  <aside v-if="element || connector || draftStyle || draftConnector" class="b-drawing-style-panel" @pointerdown.stop>
    <!-- 层级控制区域 -->
    <section v-if="showLayerControls" class="b-drawing-style-panel__section">
      <span class="b-drawing-style-panel__label">层级</span>
      <div class="b-drawing-style-panel__segments">
        <button
          class="b-drawing-style-panel__segment-button"
          :disabled="!canBringToFront"
          aria-label="置顶"
          type="button"
          title="置顶"
          @click="handleLayerClick('bringToFront')"
        >
          <BIcon icon="lucide:arrow-up-to-line" :size="15" />
        </button>
        <button
          class="b-drawing-style-panel__segment-button"
          :disabled="!canBringForward"
          aria-label="上移一层"
          type="button"
          title="上移一层"
          @click="handleLayerClick('bringForward')"
        >
          <BIcon icon="lucide:arrow-up" :size="15" />
        </button>
        <button
          class="b-drawing-style-panel__segment-button"
          :disabled="!canSendBackward"
          aria-label="下移一层"
          type="button"
          title="下移一层"
          @click="handleLayerClick('sendBackward')"
        >
          <BIcon icon="lucide:arrow-down" :size="15" />
        </button>
        <button
          class="b-drawing-style-panel__segment-button"
          :disabled="!canSendToBack"
          aria-label="置底"
          type="button"
          title="置底"
          @click="handleLayerClick('sendToBack')"
        >
          <BIcon icon="lucide:arrow-down-to-line" :size="15" />
        </button>
      </div>
    </section>

    <section v-if="showStrokeControls" class="b-drawing-style-panel__section">
      <span class="b-drawing-style-panel__label">描边</span>
      <BColorPicker :value="strokeValue" format="hex" placement="rightTop" :align="{ offset: [20, 0] }" @change="handleColorClick('stroke', $event)" />
    </section>

    <section v-if="showFillControls" class="b-drawing-style-panel__section">
      <span class="b-drawing-style-panel__label">背景</span>
      <BColorPicker :value="fillValue" format="hex" placement="rightTop" :align="{ offset: [20, 0] }" @change="handleColorClick('fill', $event)" />
    </section>

    <section v-if="showTextControls" class="b-drawing-style-panel__section">
      <span class="b-drawing-style-panel__label">文字</span>
      <BColorPicker :value="textColorValue" format="hex" placement="rightTop" :align="{ offset: [20, 0] }" @change="handleColorClick('color', $event)" />
    </section>

    <section v-if="showTextControls" class="b-drawing-style-panel__section">
      <span class="b-drawing-style-panel__label">字号</span>
      <div class="b-drawing-style-panel__segments">
        <button
          v-for="option in fontSizeOptions"
          :key="option.value"
          class="b-drawing-style-panel__segment-button b-drawing-style-panel__segment-button--text"
          :class="{ 'is-active': fontSizeValue === option.value }"
          :aria-label="option.label"
          type="button"
          @click="handleFontSizeClick(option.value)"
        >
          {{ option.preview }}
        </button>
      </div>
    </section>

    <section v-if="showTextControls" class="b-drawing-style-panel__section">
      <span class="b-drawing-style-panel__label">对齐</span>
      <div class="b-drawing-style-panel__segments">
        <button
          v-for="option in textAlignOptions"
          :key="option.value"
          class="b-drawing-style-panel__segment-button"
          :class="{ 'is-active': textAlignValue === option.value }"
          :aria-label="option.label"
          type="button"
          @click="handleTextAlignClick(option.value)"
        >
          <BIcon :icon="option.icon" :size="15" />
        </button>
      </div>
    </section>

    <section v-if="showStrokeControls" class="b-drawing-style-panel__section">
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
  DrawingShapeElement,
  DrawingTextAlign
} from '../types';
import { computed } from 'vue';
import BColorPicker from '@/components/BColorPicker/index.vue';

/**
 * 层级操作类型。
 */
type DrawingLayerAction = 'bringToFront' | 'bringForward' | 'sendBackward' | 'sendToBack';

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
 * 字号选项。
 */
interface FontSizeOption {
  /** 字号值 */
  value: number;
  /** 访问性标签 */
  label: string;
  /** 预览文字 */
  preview: string;
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
  /** 选中元素在元素列表中的索引 */
  elementIndex?: number;
  /** 元素总数 */
  elementCount?: number;
}

const props = withDefaults(defineProps<Props>(), {
  connector: null,
  draftStyle: null,
  draftConnector: null,
  elementIndex: -1,
  elementCount: 0
});
const emit = defineEmits<{
  /** 更新元素样式 */
  change: [style: DrawingElementStyleChange];
  /** 更新连接线配置 */
  'connector-change': [options: DrawingConnectorOptionsChange];
  /** 层级变更 */
  'layer-change': [action: DrawingLayerAction];
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
/** 文本字号选项。 */
const FONT_SIZE_OPTIONS: readonly FontSizeOption[] = [
  { value: 12, label: '小字号', preview: '小' },
  { value: 14, label: '中字号', preview: '中' },
  { value: 18, label: '大字号', preview: '大' }
];
/** 文本对齐选项。 */
const TEXT_ALIGN_OPTIONS: readonly ConnectorSegmentOption<DrawingTextAlign>[] = [
  { value: 'left', label: '左对齐', icon: 'lucide:align-left' },
  { value: 'center', label: '居中对齐', icon: 'lucide:align-center' },
  { value: 'right', label: '右对齐', icon: 'lucide:align-right' }
];

/** 是否显示层级控件（选中元素时显示）。 */
const showLayerControls = computed<boolean>(() => Boolean(props.element || props.connector));

/** 是否可置顶（不在最顶层）。 */
const canBringToFront = computed<boolean>(() => props.elementIndex >= 0 && props.elementIndex < props.elementCount - 1);

/** 是否可上移一层。 */
const canBringForward = computed<boolean>(() => props.elementIndex >= 0 && props.elementIndex < props.elementCount - 1);

/** 是否可下移一层。 */
const canSendBackward = computed<boolean>(() => props.elementIndex > 0);

/** 是否可置底（不在最底层）。 */
const canSendToBack = computed<boolean>(() => props.elementIndex > 0);
/** 当前是否编辑文本元素。 */
const isTextElement = computed<boolean>(() => props.element?.shape === 'text');

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
const fontSizeOptions = computed<readonly FontSizeOption[]>(() => FONT_SIZE_OPTIONS);
const textAlignOptions = computed<readonly ConnectorSegmentOption<DrawingTextAlign>[]>(() => TEXT_ALIGN_OPTIONS);
const showFillControls = computed<boolean>(() => Boolean(props.element || props.draftStyle));
const showStrokeControls = computed<boolean>(() => !isTextElement.value);
const showTextControls = computed<boolean>(() => isTextElement.value);
const textColorValue = computed<string>(() => props.element?.style?.color ?? '#0f172a');
const fontSizeValue = computed<number>(() => props.element?.style?.fontSize ?? 13);
const textAlignValue = computed<DrawingTextAlign>(() => props.element?.style?.textAlign ?? 'center');
const showConnectorControls = computed<boolean>(() => Boolean(props.connector || props.draftConnector));
const markerStartValue = computed<DrawingConnectorMarkerType>(() => props.connector?.markerStart ?? props.draftConnector?.markerStart ?? 'none');
const markerEndValue = computed<DrawingConnectorMarkerType>(() => props.connector?.markerEnd ?? props.draftConnector?.markerEnd ?? 'arrow');
const curveValue = computed<DrawingConnectorCurveType>(() => props.connector?.curve ?? props.draftConnector?.curve ?? 'straight');

/**
 * 处理层级按钮点击。
 * @param action - 层级操作类型
 */
function handleLayerClick(action: DrawingLayerAction): void {
  emit('layer-change', action);
}

/**
 * 处理颜色按钮点击。
 * @param key - 样式字段
 * @param value - 颜色值
 */
function handleColorClick(key: 'fill' | 'stroke' | 'color', value: string): void {
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
 * 处理文字字号点击。
 * @param value - 字号
 */
function handleFontSizeClick(value: number): void {
  emit('change', {
    fontSize: value
  });
}

/**
 * 处理文本对齐点击。
 * @param value - 对齐方式
 */
function handleTextAlignClick(value: DrawingTextAlign): void {
  emit('change', {
    textAlign: value
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
  width: 28px;
}

.b-drawing-style-panel__segment-button:disabled {
  cursor: not-allowed;
  opacity: 0.35;
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
