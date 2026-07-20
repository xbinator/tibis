<!--
  @file index.vue
  @description BInputNumber 数字输入组件，封装 AInputNumber 并默认隐藏增减按钮。
  支持 defaultValue（空值兜底）和 decimalPrecision（输出小数精度）归一化。
  输入时允许自由输入，update:value 时实时归一化向外 emit。
-->
<template>
  <AInputNumber
    :value="inputValue"
    :class="name"
    :placeholder="placeholder"
    :disabled="disabled"
    :controls="controls"
    :min="min"
    :max="max"
    :step="step"
    :precision="precision"
    :size="size"
    :readonly="readonly"
    :autofocus="autofocus"
    :keyboard="keyboard"
    :status="status"
    :bordered="bordered"
    :formatter="formatter"
    :parser="parser"
    :decimal-separator="decimalSeparator"
    :string-mode="stringMode"
    v-bind="$attrs"
    @update:value="handleInputUpdate"
    @blur="handleBlur"
  >
    <template v-if="$slots.addonBefore" #addonBefore>
      <slot name="addonBefore"></slot>
    </template>
    <template v-if="$slots.addonAfter" #addonAfter>
      <slot name="addonAfter"></slot>
    </template>
    <template v-if="$slots.prefix" #prefix>
      <slot name="prefix"></slot>
    </template>
    <template v-if="$slots.upIcon" #upIcon>
      <slot name="upIcon"></slot>
    </template>
    <template v-if="$slots.downIcon" #downIcon>
      <slot name="downIcon"></slot>
    </template>
  </AInputNumber>
</template>

<script setup lang="ts">
/**
 * @file index.vue
 * @description BInputNumber 数字输入组件，封装 AInputNumber 并默认隐藏增减按钮。
 * 支持 defaultValue（空值兜底）和 decimalPrecision（输出小数精度）归一化。
 * 输入时允许自由输入，update:value 时实时归一化向外 emit。
 */
import type { BInputNumberProps as Props, ValueType } from './types';
import { ref, watch } from 'vue';
import { createNamespace } from '@/utils/namespace';
import { normalizeOutputValue } from './utils/normalize';

defineOptions({ name: 'BInputNumber', inheritAttrs: false });

const [name] = createNamespace('input-number');

const props = withDefaults(defineProps<Props>(), {
  value: undefined,
  defaultValue: undefined,
  placeholder: undefined,
  disabled: false,
  controls: false,
  min: undefined,
  max: undefined,
  step: undefined,
  precision: undefined,
  size: 'middle',
  readonly: false,
  autofocus: false,
  keyboard: true,
  status: '',
  bordered: true,
  formatter: undefined,
  parser: undefined,
  decimalSeparator: undefined,
  stringMode: false,
  decimalPrecision: undefined
});

const modelValue = defineModel<ValueType>('value', { default: undefined });

/**
 * 本地展示值，与 AInputNumber 双向同步。
 * 输入过程中允许自由输入任意内容，不受 modelValue 约束。
 * modelValue 为 undefined 时回退到 defaultValue 作为显示兜底。
 */
const inputValue = ref<ValueType | undefined>(modelValue.value ?? props.defaultValue);

/**
 * 标记当前 modelValue 变化是否由内部 handleInputUpdate 触发。
 * 内部触发时跳过 watch 同步，避免覆盖用户正在输入的中间状态。
 */
let isInternalUpdate = false;

// 外部 modelValue 变化时同步到本地展示值；内部触发的变化跳过；undefined 时回退到 defaultValue
watch(modelValue, (value: ValueType | undefined): void => {
  if (isInternalUpdate) {
    isInternalUpdate = false;
    return;
  }

  inputValue.value = value ?? props.defaultValue;
});

/**
 * 处理 AInputNumber 的 update:value 事件。
 * 1. 更新本地展示值为原始值，允许用户自由输入。
 * 2. 归一化后写入 modelValue 向外 emit。
 * 通过 isInternalUpdate 标记跳过 watch 同步，避免归一化值覆盖用户输入。
 * @param value - AInputNumber 输入过程中的值
 */
function handleInputUpdate(value: ValueType | null): void {
  // 本地展示值使用原始值，允许用户自由输入
  inputValue.value = (value ?? undefined) as ValueType;

  // 标记内部更新，避免 watch 重置 inputValue
  isInternalUpdate = true;

  // 向外 emit 归一化后的值
  modelValue.value = normalizeOutputValue(value, {
    defaultValue: props.defaultValue,
    decimalPrecision: props.decimalPrecision
  });
}

/**
 * 处理 AInputNumber 的 blur 事件。
 * 用户清空输入时 inputValue 为空但 modelValue 已写入 defaultValue，
 * 失焦时把展示值同步回 modelValue，让 UI 与对外值一致。
 * 未配置 defaultValue 且 modelValue 为 undefined 时保持空展示。
 */
function handleBlur(): void {
  inputValue.value = modelValue.value ?? props.defaultValue;
}
</script>

<style lang="less" scoped>
.b-input-number {
  width: 100%;
}
</style>
