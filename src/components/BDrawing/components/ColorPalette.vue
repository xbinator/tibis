<!--
  @file ColorPalette.vue
  @description 颜色调色板组件，包含预设色按钮和自定义颜色选择器。
  仅最后一个"自定义颜色"按钮会弹出 BColorPicker 下拉面板，预设色点击直接选中。
-->
<template>
  <div class="color-palette" role="group" aria-label="快捷颜色">
    <!-- 预设色按钮 -->
    <button
      v-for="presetColor in presetColorOptions"
      :key="presetColor"
      class="color-palette__preset-button"
      :class="{ 'is-active': isPresetActive(presetColor), 'is-transparent': isTransparentColor(presetColor) }"
      :aria-label="`选择颜色 ${presetColor}`"
      :data-testid="`color-picker-preset-${presetColor}`"
      :disabled="readonly"
      type="button"
      @click.stop="handlePresetClick(presetColor)"
    >
      <span class="color-palette__preset-swatch" :style="{ backgroundColor: presetColor }"></span>
    </button>

    <!-- 分隔线 -->
    <span class="color-palette__divider" data-testid="color-palette-divider"></span>

    <!-- 自定义颜色按钮（带 BColorPicker 下拉） -->
    <BColorPicker :value="value" :format="format" :placement="placement" :align="align" :readonly="readonly" @change="handleCustomColorChange">
      <button
        class="color-palette__custom-button b-color-picker__custom-trigger"
        :class="{ 'is-transparent': isTransparentColor(value) }"
        aria-label="自定义颜色"
        data-testid="color-palette-custom-button"
        :disabled="readonly"
        type="button"
      >
        <span class="color-palette__custom-swatch" :style="{ backgroundColor: value }"></span>
      </button>
    </BColorPicker>
  </div>
</template>

<script setup lang="ts">
/**
 * @file ColorPalette.vue
 * @description 颜色调色板组件。
 * 预设色直接选中，自定义颜色通过 BColorPicker 下拉面板选择。
 */
import { computed } from 'vue';
import tinycolor from 'tinycolor2';
import BColorPicker from '@/components/BColorPicker/index.vue';
import type { BColorPickerProps } from '@/components/BColorPicker/types';
import { DRAWING_COLOR_PICKER_DEFAULT_ALIGN, DRAWING_COLOR_PICKER_DEFAULT_PLACEMENT, DRAWING_DEFAULT_PRESET_COLORS } from '../constants/style';

/** 颜色调色板属性 */
interface Props {
  /** 当前颜色值 */
  value: string;
  /** 颜色输出格式 */
  format?: BColorPickerProps['format'];
  /** 下拉菜单位置 */
  placement?: BColorPickerProps['placement'];
  /** 对齐方式 */
  align?: BColorPickerProps['align'];
  /** 是否只读 */
  readonly?: boolean;
  /** 预设颜色列表 */
  presetColors?: readonly string[];
}

const props = withDefaults(defineProps<Props>(), {
  format: 'hex',
  placement: DRAWING_COLOR_PICKER_DEFAULT_PLACEMENT,
  align: () => DRAWING_COLOR_PICKER_DEFAULT_ALIGN,
  readonly: false,
  presetColors: undefined
});

const emit = defineEmits<{
  /** 颜色变更 */
  change: [value: string];
}>();

/** 快捷预设颜色列表 */
const presetColorOptions = computed<readonly string[]>(() => (props.presetColors?.length ? props.presetColors : DRAWING_DEFAULT_PRESET_COLORS));

/**
 * 根据输出格式格式化颜色值
 * @param color - 颜色字符串
 * @returns 格式化后的颜色字符串
 */
function formatColor(color: string): string {
  const tc = tinycolor(color);
  if (!tc.isValid()) return '';

  const formatters: Record<string, () => string> = {
    rgb: () => tc.toRgbString(),
    hex: () => (tc.getAlpha() === 1 ? tc.toHexString() : tc.toHex8String())
  };

  return formatters[props.format ?? 'hex']?.() ?? '';
}

/**
 * 判断预设色是否为当前颜色
 * @param color - 预设颜色
 * @returns 当前颜色是否匹配预设色
 */
function isPresetActive(color: string): boolean {
  return formatColor(color).toLowerCase() === formatColor(props.value).toLowerCase();
}

/**
 * 判断颜色是否为透明色
 * @param color - 颜色值
 * @returns 是否为透明色
 */
function isTransparentColor(color: string): boolean {
  return tinycolor(color).getAlpha() === 0;
}

/**
 * 处理预设色点击
 * @param color - 预设颜色
 */
function handlePresetClick(color: string): void {
  if (props.readonly) return;
  emit('change', formatColor(color));
}

/**
 * 处理自定义颜色变更
 * @param value - 新颜色值
 */
function handleCustomColorChange(value: string): void {
  emit('change', value);
}
</script>

<style lang="less" scoped>
.color-palette {
  display: flex;
  gap: 6px;
  align-items: center;
  width: max-content;
}

.color-palette__preset-button,
.color-palette__custom-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  cursor: pointer;
  background: var(--bg-tertiary);
  border: 1px solid transparent;
  border-radius: 5px;
}

.color-palette__preset-button:hover,
.color-palette__custom-button:hover,
.color-palette__preset-button.is-active {
  border-color: color-mix(in srgb, var(--color-primary) 38%, transparent);
}

.color-palette__preset-button:disabled,
.color-palette__custom-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.color-palette__preset-swatch,
.color-palette__custom-swatch {
  width: 14px;
  height: 14px;
  outline: 1px solid color-mix(in srgb, var(--border-primary) 90%, transparent);
  border-radius: 3px;
}

.color-palette__preset-button.is-transparent .color-palette__preset-swatch,
.color-palette__custom-button.is-transparent .color-palette__custom-swatch {
  background-color: transparent;
  background-image: linear-gradient(45deg, #d1d5db 25%, transparent 25%), linear-gradient(-45deg, #d1d5db 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #d1d5db 75%), linear-gradient(-45deg, transparent 75%, #d1d5db 75%);
  background-position: 0 0, 0 5px, 5px -5px, -5px 0;
  background-size: 10px 10px;
}

.color-palette__divider {
  width: 1px;
  height: 18px;
  background: var(--border-primary);
}
</style>
