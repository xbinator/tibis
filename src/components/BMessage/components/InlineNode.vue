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

  <code v-else-if="node.type === 'code'">{{ node.text }}</code>

  <a v-else-if="node.type === 'link'" :href="node.href" :title="node.title || undefined" @click="handleLinkClick">
    <InlineNode v-for="(child, index) in node.children" :key="index" :node="child" />
  </a>

  <img
    v-else-if="node.type === 'image'"
    :src="node.src"
    :alt="node.alt"
    :title="node.title || undefined"
    @click="handleImageClick"
    @mousedown="handleImageMouseDown"
  />

  <br v-else-if="node.type === 'break'" />

  <span v-else-if="node.type === 'cursor'" class="b-message__cursor" aria-hidden="true"></span>
</template>

<script setup lang="ts">
import type { InlineNode } from '../types';
import { inject } from 'vue';
import { MESSAGE_NODE_RENDER_CONTEXT_KEY } from '../types';

defineOptions({ name: 'InlineNode' });

interface Props {
  /** 待渲染的行内节点 */
  node: InlineNode;
}

const props = defineProps<Props>();

const renderContext = inject(MESSAGE_NODE_RENDER_CONTEXT_KEY, null);

/**
 * 处理图片点击。
 * @param event - 鼠标点击事件
 */
async function handleImageClick(event: MouseEvent): Promise<void> {
  if (props.node.type !== 'image') return;

  event.preventDefault();
  event.stopPropagation();
  await renderContext?.previewImageAt(props.node.imageIndex);
}

/**
 * 阻止图片拖拽和选区。
 * @param event - 鼠标按下事件
 */
function handleImageMouseDown(event: MouseEvent): void {
  event.preventDefault();
}

/**
 * 处理链接点击。
 * @param event - 鼠标点击事件
 */
function handleLinkClick(event: MouseEvent): void {
  renderContext?.navigateLink(event);
}
</script>
