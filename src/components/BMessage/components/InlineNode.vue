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

  <span v-else-if="node.type === 'image'" class="b-message__image-wrap">
    <img :src="node.src" :alt="node.alt" :title="node.title || undefined" @click="handleImageClick" @mousedown="handleImageMouseDown" />
    <button type="button" class="b-message__image-copy" title="复制图片" aria-label="复制图片" @click="handleImageCopyClick" @mousedown.stop.prevent>
      <BIcon icon="lucide:copy" :size="14" />
    </button>
  </span>

  <br v-else-if="node.type === 'break'" />

  <span v-else-if="node.type === 'cursor'" class="b-message__cursor" aria-hidden="true"></span>
</template>

<script setup lang="ts">
import type { InlineNode } from '../types';
import { inject } from 'vue';
import { useClipboard } from '@/hooks/useClipboard';
import { MESSAGE_NODE_RENDER_CONTEXT_KEY } from '../types';

defineOptions({ name: 'InlineNode' });

interface Props {
  /** 待渲染的行内节点 */
  node: InlineNode;
}

const props = defineProps<Props>();

const renderContext = inject(MESSAGE_NODE_RENDER_CONTEXT_KEY, null);
const { copyImageFromUrl } = useClipboard();

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
 * 复制图片本体到系统剪贴板。
 * @param event - 鼠标点击事件
 */
async function handleImageCopyClick(event: MouseEvent): Promise<void> {
  event.preventDefault();
  event.stopPropagation();

  if (props.node.type !== 'image') return;

  await copyImageFromUrl(props.node.src, {
    successMessage: '图片已复制',
    errorMessage: '复制图片失败'
  });
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

<style scoped lang="less">
.b-message__image-wrap {
  position: relative;
  display: inline-block;
  max-width: 100%;
  line-height: 0;
  vertical-align: top;
}

.b-message__image-wrap > img {
  display: block;
  max-width: 100%;
}

.b-message__image-copy {
  position: absolute;
  top: 8px;
  right: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  color: var(--text-secondary);
  cursor: pointer;
  background: var(--bg-primary);
  border-radius: 6px;
  opacity: 0;
  transition: opacity 0.16s ease, color 0.16s ease, background-color 0.16s ease;
}

.b-message__image-copy:hover,
.b-message__image-copy:focus-visible {
  color: var(--color-primary);
  background: var(--bg-secondary);
  border-color: var(--border-primary);
}

.b-message__image-wrap:hover .b-message__image-copy,
.b-message__image-wrap:focus-within .b-message__image-copy {
  opacity: 1;
}
</style>
