<!--
  @file index.vue
  @description BColorPicker 颜色选择器组件，支持 SV 面板、色相条、透明度条拖拽选择。
-->
<template>
  <BDropdown v-model:open="visible" :disabled="readonly">
    <slot>
      <div class="b-color-picker__trigger" :class="{ 'is-readonly': readonly }">
        <AInput
          v-model:value="inputColor"
          class="b-color-picker__input"
          :readonly="readonly"
          :bordered="bordered"
          :allow-clear="allowClear"
          :placeholder="placeholder"
          @blur="handleInputBlur"
        >
          <template #suffix>
            <div class="b-color-picker__color-block" :style="{ background: currentColor }"></div>
          </template>
        </AInput>
      </div>
    </slot>

    <template #overlay>
      <div class="b-color-picker__panel">
        <!-- SV 面板 + 色相条 -->
        <div class="b-color-picker__main">
          <!-- 饱和度/明度面板 -->
          <div ref="svPanelRef" class="b-color-picker__sv-panel" :style="{ background: bgColor }" @pointerdown="onSvPanelDown">
            <div class="b-color-picker__sv-white"></div>
            <div class="b-color-picker__sv-black"></div>
            <div class="b-color-picker__sv-cursor" :style="cursorStyle">
              <div></div>
            </div>
          </div>

          <!-- 色相条 -->
          <div ref="hueBarRef" class="b-color-picker__hue-bar" @pointerdown="onHueBarDown">
            <div class="b-color-picker__hue-thumb" :style="hueThumbStyle"></div>
          </div>
        </div>

        <!-- 透明度条 -->
        <div ref="alphaBarRef" class="b-color-picker__alpha-bar" @pointerdown="onAlphaBarDown">
          <div class="b-color-picker__alpha-thumb" :style="alphaThumbStyle"></div>
        </div>
      </div>
    </template>
  </BDropdown>
</template>

<script setup lang="ts">
/**
 * @file index.vue
 * @description BColorPicker 颜色选择器组件。
 * 基于 tinycolor2 做颜色格式转换，使用 VueUse usePointer 实现拖拽交互。
 */
import type { BColorPickerProps } from './types';
import type { CSSProperties } from 'vue';
import { computed, nextTick, reactive, ref, watch } from 'vue';
import { usePointer } from '@vueuse/core';
import { clamp } from 'lodash-es';
import tinycolor from 'tinycolor2';

defineOptions({ name: 'BColorPicker' });

const props = withDefaults(defineProps<BColorPickerProps>(), {
  value: '',
  format: 'rgb',
  bordered: true,
  defaultValue: '',
  allowClear: false,
  placeholder: '请输入',
  readonly: false
});

const emit = defineEmits<{
  /** 颜色值更新（v-model） */
  'update:value': [value: string];
  /** 颜色变更 */
  change: [value: string];
}>();

/** SV 面板尺寸常量 */
const SV_PANEL_SIZE = { width: 280, height: 180 } as const;
/** 滑块指示点尺寸 */
const THUMB_SIZE = { width: 4, height: 4 } as const;

/** 弹出层可见状态 */
const visible = ref<boolean>(false);
/** 当前颜色（rgb 字符串） */
const currentColor = ref<string>('');
/** 输入框显示值 */
const inputColor = ref<string>('');
/** HSV + Alpha 状态 */
const hsva = reactive({ h: 0, s: 0, v: 0, a: 1 });

/** SV 面板 DOM 引用 */
const svPanelRef = ref<HTMLElement | null>(null);
/** 色相条 DOM 引用 */
const hueBarRef = ref<HTMLElement | null>(null);
/** 透明度条 DOM 引用 */
const alphaBarRef = ref<HTMLElement | null>(null);

/** 光标样式 */
const cursorStyle = reactive<CSSProperties>({});
/** 色相滑块样式 */
const hueThumbStyle = reactive<CSSProperties>({});
/** 透明度滑块样式 */
const alphaThumbStyle = reactive<CSSProperties>({});

/** VueUse 指针状态 */
const pointer = usePointer();

/** 拖拽状态标记 */
let dragging: 'sv' | 'hue' | 'alpha' | null = null;

/** SV 面板背景色（纯色相） */
const bgColor = computed<string>(() => `hsl(${hsva.h}, 100%, 50%)`);

/**
 * 根据输出格式格式化颜色值
 * @param value - 颜色字符串
 * @returns 格式化后的颜色字符串
 */
function formatColor(value: string): string {
  const color = tinycolor(value);
  if (!color.isValid()) return '';

  const formatters: Record<string, () => string> = {
    rgb: () => color.toRgbString(),
    hex: () => (color.getAlpha() === 1 ? color.toHexString() : color.toHex8String())
  };

  return formatters[props.format]?.() ?? '';
}

/**
 * 更新内部颜色显示值
 */
function updateInnerColor(): void {
  inputColor.value = formatColor(currentColor.value);
}

/**
 * 更新颜色并触发事件
 * @param color - 颜色源（HSVA 对象或颜色字符串）
 */
function updateColor(color: { h: number; s: number; v: number; a: number } | string): void {
  currentColor.value = color ? tinycolor(color).toRgbString() : '';
  emit('update:value', formatColor(currentColor.value));
  emit('change', currentColor.value);
}

/**
 * 获取元素相对指针的本地坐标
 * @param el - 目标 DOM 元素
 * @returns 本地坐标 { x, y } 和容器尺寸 { width, height }
 */
function getLocalPosition(el: HTMLElement): { x: number; y: number; width: number; height: number } {
  const rect = el.getBoundingClientRect();
  return {
    x: clamp(pointer.x.value - rect.left, 0, rect.width),
    y: clamp(pointer.y.value - rect.top, 0, rect.height),
    width: rect.width,
    height: rect.height
  };
}

// ==================== SV 面板拖拽 ====================

/**
 * 处理 SV 面板移动，更新饱和度和明度
 */
function handleSvMove(): void {
  if (!svPanelRef.value) return;
  const { x, y, width, height } = getLocalPosition(svPanelRef.value);

  cursorStyle.left = `${x}px`;
  cursorStyle.top = `${y}px`;

  hsva.s = x / width;
  hsva.v = clamp(-(y / height) + 1, 0, 1);

  updateColor(hsva);
  updateInnerColor();
}

/**
 * 处理 SV 面板指针按下
 */
function onSvPanelDown(): void {
  if (!svPanelRef.value) return;
  dragging = 'sv';
  handleSvMove();

  const onMove = (): void => {
    if (dragging === 'sv') handleSvMove();
  };
  const onUp = (): void => {
    dragging = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

// ==================== 色相条拖拽 ====================

/**
 * 处理色相条移动，更新色相值
 */
function handleHueMove(): void {
  if (!hueBarRef.value) return;
  const { y, height } = getLocalPosition(hueBarRef.value);

  hueThumbStyle.top = `${y}px`;

  if (y <= 0) {
    hsva.h = 360;
  } else if (y >= height) {
    hsva.h = 0;
  } else {
    hsva.h = (y / height) * 360;
  }

  updateColor(hsva);
  updateInnerColor();
}

/**
 * 处理色相条指针按下
 */
function onHueBarDown(): void {
  if (!hueBarRef.value) return;
  dragging = 'hue';
  handleHueMove();

  const onMove = (): void => {
    if (dragging === 'hue') handleHueMove();
  };
  const onUp = (): void => {
    dragging = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

// ==================== 透明度条拖拽 ====================

/**
 * 处理透明度条移动，更新透明度值
 */
function handleAlphaMove(): void {
  if (!alphaBarRef.value) return;
  const { x, width } = getLocalPosition(alphaBarRef.value);

  alphaThumbStyle.left = `${x}px`;

  if (x <= 0) {
    hsva.a = 0;
  } else if (x >= width) {
    hsva.a = 1;
  } else {
    hsva.a = +(x / width).toFixed(1);
  }

  updateColor(hsva);
  updateInnerColor();
}

/**
 * 处理透明度条指针按下
 */
function onAlphaBarDown(): void {
  if (!alphaBarRef.value) return;
  dragging = 'alpha';
  handleAlphaMove();

  const onMove = (): void => {
    if (dragging === 'alpha') handleAlphaMove();
  };
  const onUp = (): void => {
    dragging = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

// ==================== 位置计算 ====================

/**
 * 计算 SV 面板光标位置
 */
function getCursorLeft(): number {
  return SV_PANEL_SIZE.width * hsva.s;
}

/**
 * 计算 SV 面板光标纵向位置
 */
function getCursorTop(): number {
  return (hsva.v - 1) * SV_PANEL_SIZE.height * -1;
}

/**
 * 计算色相滑块纵向位置
 */
function getHueThumbTop(): number {
  if (hsva.h === 0) return SV_PANEL_SIZE.height;
  if (hsva.h === 360) return 0;
  return (hsva.h / 360) * SV_PANEL_SIZE.height - THUMB_SIZE.height / 2;
}

/**
 * 计算透明度滑块横向位置
 */
function getAlphaThumbLeft(): number {
  if (hsva.a === 0) return 0;
  if (hsva.a === 1) return SV_PANEL_SIZE.width;
  return hsva.a * SV_PANEL_SIZE.width - THUMB_SIZE.width / 2;
}

/**
 * 同步所有指示器位置
 */
function syncIndicatorPositions(): void {
  cursorStyle.top = `${getCursorTop()}px`;
  cursorStyle.left = `${getCursorLeft()}px`;
  hueThumbStyle.top = `${getHueThumbTop()}px`;
  alphaThumbStyle.left = `${getAlphaThumbLeft()}px`;
}

/**
 * 从当前颜色更新 HSVA 状态和指示器位置
 */
function updatePositionFromColor(): void {
  const { h, s, v, a } = tinycolor(currentColor.value || '#ffffff').toHsv();
  hsva.h = h;
  hsva.s = s;
  hsva.v = v;
  hsva.a = a;
  syncIndicatorPositions();
}

/**
 * 输入框失焦处理，解析输入值
 */
function handleInputBlur(): void {
  const color = tinycolor(inputColor.value);
  updateColor(color.isValid() ? color.toHex8() : props.defaultValue);
  updateInnerColor();
  updatePositionFromColor();
}

/** 弹出层打开时同步位置 */
watch(
  () => visible.value,
  (val) => val && nextTick(updatePositionFromColor)
);

/** 外部 value 变化时同步内部状态 */
watch(
  () => props.value,
  () => {
    const color = props.value || props.defaultValue;
    const value = tinycolor(color).isValid() ? tinycolor(color).toRgbString() : '';
    currentColor.value = value;
    updateInnerColor();
    updatePositionFromColor();
  },
  { immediate: true }
);
</script>

<style lang="less">
.b-color-picker__trigger {
  display: inline-flex;

  &.is-readonly {
    pointer-events: none;
  }
}

.b-color-picker__input {
  .ant-input {
    border-radius: 0;
  }
}

.b-color-picker__color-block {
  width: 14px;
  height: 14px;
  outline: 1px solid var(--border-color-a);
  border-radius: 3px;
}

.b-color-picker__panel {
  padding: 10px;
  background-color: var(--color-bg-5);
  border-radius: 4px;
  box-shadow: var(--shadow-special-a);
}

.b-color-picker__main {
  display: flex;
  margin-bottom: 10px;
}

.b-color-picker__sv-panel {
  position: relative;
  width: 280px;
  height: 180px;
  margin-right: 10px;
  touch-action: none;
  cursor: crosshair;
  user-select: none;
}

.b-color-picker__sv-white {
  position: absolute;
  inset: 0;
  background: linear-gradient(to right, #fff, rgb(255 255 255 / 0%));
}

.b-color-picker__sv-black {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, #000, transparent);
}

.b-color-picker__sv-cursor {
  position: absolute;

  div {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    box-shadow: 0 0 0 1.5px #fff, inset 0 0 1px 1px #0000004d, 0 0 1px 2px #0006;
    transform: translate(-2px, -2px);
  }
}

.b-color-picker__hue-bar {
  position: relative;
  width: 12px;
  height: 180px;
  touch-action: none;
  cursor: pointer;
  user-select: none;
  background: linear-gradient(to bottom, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%);
}

.b-color-picker__hue-thumb {
  position: absolute;
  width: 100%;
  height: 4px;
  cursor: pointer;
  background: #fff;
  border: 1px solid #f0f0f0;
  box-shadow: 0 0 2px #0009;
  transform: translateY(-50%);
}

.b-color-picker__alpha-bar {
  position: relative;
  width: 280px;
  height: 12px;
  touch-action: none;
  cursor: pointer;
  user-select: none;
  background: linear-gradient(45deg, #eee 25%, transparent 0, transparent 75%, #eee 0, #eee), linear-gradient(45deg, #eee 25%, #fff 0, #fff 75%, #eee 0, #eee);
  background-position: 0 0, 6px 6px;
  background-size: 12px 12px;
}

.b-color-picker__alpha-thumb {
  position: absolute;
  width: 4px;
  height: 100%;
  cursor: pointer;
  background: #fff;
  border: 1px solid #f0f0f0;
  box-shadow: 0 0 2px #0009;
  transform: translateX(-50%);
}
</style>
