<!--
  @file MathBlockNode.vue
  @description BMessage 块级数学公式渲染组件。
-->
<template>
  <div :class="bem('math-block')" v-html="html"></div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import katex from 'katex';
import { createNamespace } from '@/utils/namespace';

defineOptions({ name: 'MathBlockNode' });

const [, bem] = createNamespace('message');

/**
 * MathBlockNode 组件属性。
 */
interface Props {
  /** 公式源码 */
  text: string;
}

const props = defineProps<Props>();

const html = computed<string>(() =>
  katex.renderToString(props.text, {
    displayMode: true,
    throwOnError: false
  })
);
</script>

<style scoped lang="less">
.b-message__math-block {
  margin: 0.6em 0;
  overflow-x: auto;
}
</style>
