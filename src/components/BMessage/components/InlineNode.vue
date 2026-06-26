<!--
  @file InlineNode.vue
  @description BMessage 行内节点递归渲染组件。
-->
<template>
  <template v-if="node.type === 'text'">{{ node.text }}</template>

  <strong v-else-if="node.type === 'strong'">
    <InlineNode v-for="(child, index) in node.children" :key="index" :node="child" />
  </strong>

  <em v-else-if="node.type === 'em'">
    <InlineNode v-for="(child, index) in node.children" :key="index" :node="child" />
  </em>

  <del v-else-if="node.type === 'del'">
    <InlineNode v-for="(child, index) in node.children" :key="index" :node="child" />
  </del>

  <mark v-else-if="node.type === 'mark'">
    <InlineNode v-for="(child, index) in node.children" :key="index" :node="child" />
  </mark>

  <sup v-else-if="node.type === 'sup'">
    <InlineNode v-for="(child, index) in node.children" :key="index" :node="child" />
  </sup>

  <sub v-else-if="node.type === 'sub'">
    <InlineNode v-for="(child, index) in node.children" :key="index" :node="child" />
  </sub>

  <code v-else-if="node.type === 'code'">{{ node.text }}</code>

  <MathNode v-else-if="node.type === 'math'" :text="node.text" />

  <a v-else-if="node.type === 'link'" :href="node.href" :title="node.title || undefined" @click="handleLinkClick">
    <InlineNode v-for="(child, index) in node.children" :key="index" :node="child" />
  </a>

  <ImageNode v-else-if="node.type === 'image'" :node="node" />

  <br v-else-if="node.type === 'break'" />

  <component :is="node.tag" v-else-if="node.type === 'htmlInline'" :title="node.title">
    <InlineNode v-for="(child, index) in node.children" :key="index" :node="child" />
  </component>

  <span v-else-if="node.type === 'cursor'" :class="bem('cursor')" aria-hidden="true"></span>
</template>

<script setup lang="ts">
import type { InlineNode } from '../types';
import { inject } from 'vue';
import { createNamespace } from '@/utils/namespace';
import { MESSAGE_NODE_RENDER_CONTEXT_KEY } from '../types';
import ImageNode from './ImageNode.vue';
import MathNode from './MathNode.vue';

defineOptions({ name: 'InlineNode' });

const [, bem] = createNamespace('message');

interface Props {
  /** 待渲染的行内节点 */
  node: InlineNode;
}

defineProps<Props>();

const renderContext = inject(MESSAGE_NODE_RENDER_CONTEXT_KEY, null);

/**
 * 处理链接点击。
 * @param event - 鼠标点击事件
 */
function handleLinkClick(event: MouseEvent): void {
  renderContext?.navigateLink(event);
}
</script>
