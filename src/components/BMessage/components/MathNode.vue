<!--
  @file MathNode.vue
  @description BMessage 行内数学公式渲染组件。
-->
<template>
  <span :class="bem('math-inline')" v-html="html"></span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import katex from 'katex';
import { createNamespace } from '@/utils/namespace';

defineOptions({ name: 'MathNode' });

const [, bem] = createNamespace('message');

/**
 * MathNode 组件属性。
 */
interface Props {
  /** 公式源码 */
  text: string;
}

const props = defineProps<Props>();

const html = computed<string>(() =>
  katex.renderToString(props.text, {
    displayMode: false,
    throwOnError: false
  })
);
</script>
