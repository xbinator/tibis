<template>
  <Icon class="b-icon" :icon="icon" :style="wrapStyle" />
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import { isNumber } from 'lodash-es';

/**
 * 图标组件
 * 基于 Iconify 的统一图标封装，支持尺寸、颜色、旋转等常用控制
 */
interface Props {
  /** 图标名称（Iconify 图标集，如 `lucide:home`） */
  icon?: string;
  /** 图标尺寸，传入数字时自动追加 px */
  size?: number | string;
  /** 图标颜色 */
  color?: string;
  /** 旋转角度（deg），设置后自带过渡动画 */
  rotate?: number;
}

const props = withDefaults(defineProps<Props>(), {
  icon: '',
  size: '',
  color: '',
  rotate: undefined
});

/** 根据 props 动态计算内联样式 */
const wrapStyle = computed(() => {
  const style: Record<string, string> = {};

  if (props.size) {
    style.fontSize = isNumber(props.size) ? `${props.size}px` : String(props.size);
  }

  if (isNumber(props.rotate)) {
    style.transform = `rotate(${props.rotate}deg)`;
    style.transition = 'all 0.1s cubic-bezier(1, 0.5, 0.8, 1)';
  }

  if (props.color) {
    style.color = props.color;
  }

  return style;
});
</script>

<style lang="less">
.b-icon {
  display: inline-block;
  flex-shrink: 0;
  width: 1em;
  height: 1em;
  overflow: hidden;
  vertical-align: -0.15em;
  fill: currentColor;
}
</style>
