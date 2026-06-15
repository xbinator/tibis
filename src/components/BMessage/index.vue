<!--
  @file index.vue
  @description 消息内容节点渲染组件，支持 Markdown、纯文本、流式光标与 Markdown 图片预览。
-->
<template>
  <div class="b-message" :class="`b-message--${props.loading ? 'streaming' : 'done'}`" :style="rootStyle">
    <div class="b-message__placeholder" aria-hidden="true"></div>

    <div class="b-message__container" :class="props.type === 'text' ? 'b-message__text' : 'b-message__markdown'">
      <BlockNode v-for="node in parsedResult.blocks" :key="node.id" :node="node" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { BMessageProps as Props, MessageNodeRenderContext, ParseMessageNodesResult } from './types';
import { computed, onScopeDispose, provide, shallowRef, watch } from 'vue';
import { useImagePreview } from '@/hooks/useImagePreview';
import { useNavigate } from '@/hooks/useNavigate';
import { addCssUnit } from '@/utils/css';
import BlockNode from './components/BlockNode.vue';
import { parseMessageNodes } from './parser';
import { MESSAGE_NODE_RENDER_CONTEXT_KEY } from './types';

defineOptions({ name: 'BMessage' });

const navigate = useNavigate();
const { previewImage } = useImagePreview();

const props = withDefaults(defineProps<Props>(), {
  type: 'markdown',
  loading: false,
  content: '',
  height: undefined,
  maxHeight: undefined
});

const rootStyle = computed(() => {
  return {
    height: addCssUnit(props.height),
    maxHeight: addCssUnit(props.maxHeight)
  };
});

/** 节点解析结果，使用 shallowRef 避免深度追踪整棵消息树 */
const parsedResult = shallowRef<ParseMessageNodesResult>({
  blocks: [],
  images: []
});

/** rAF 句柄，用于流式渲染的帧级合并 */
let rafHandle: ReturnType<typeof requestAnimationFrame> | null = null;

/**
 * 解析当前消息内容。
 */
function parseCurrentMessage(): void {
  parsedResult.value = parseMessageNodes({
    content: props.content,
    mode: props.type,
    loading: props.loading
  });
}

/**
 * 调度请求渲染，确保流式时每帧最多执行一次解析。
 */
function scheduleRender(): void {
  if (props.loading) {
    if (rafHandle !== null) {
      cancelAnimationFrame(rafHandle);
    }

    rafHandle = requestAnimationFrame(() => {
      rafHandle = null;
      parseCurrentMessage();
    });
    return;
  }

  if (rafHandle !== null) {
    cancelAnimationFrame(rafHandle);
    rafHandle = null;
  }

  parseCurrentMessage();
}

/**
 * 打开指定索引的图片预览。
 * @param index - 图片索引
 */
async function previewImageAt(index: number): Promise<void> {
  const { images } = parsedResult.value;

  if (!images.length) return;

  await previewImage({
    images,
    startPosition: index,
    showCarousel: images.length > 1
  });
}

const renderContext: MessageNodeRenderContext = {
  get images() {
    return parsedResult.value.images;
  },
  previewImageAt,
  navigateLink: navigate.onLink
};

provide(MESSAGE_NODE_RENDER_CONTEXT_KEY, renderContext);

watch(
  () => [props.content, props.loading, props.type] as const,
  () => {
    scheduleRender();
  },
  { immediate: true }
);

onScopeDispose(() => {
  if (rafHandle !== null) {
    cancelAnimationFrame(rafHandle);
    rafHandle = null;
  }
});
</script>

<style lang="less">
@import url('@/assets/styles/markdown.less');

.b-message {
  position: relative;
  display: flex;
  flex-direction: column-reverse;
  overflow-y: auto;
  line-height: 1.7;
  overflow-wrap: break-word;
  .scrollbar-base();
}

.b-message__placeholder {
  flex: 1 0 auto;
  pointer-events: none;
}

.b-message__container {
  width: 100%;
}

.b-message__text {
  white-space: pre-wrap;
}

.b-message__markdown {
  .markdown-base();

  img {
    cursor: zoom-in;
    user-select: none;
    -webkit-user-drag: none;
  }
}

.b-message__cursor {
  display: inline-block;
  width: 1px;
  height: 1em;
  margin-left: 2px;
  vertical-align: text-bottom;
  background: var(--color-primary);
  border-radius: 1px;
  animation: b-stream-cursor-blink 0.8s steps(1) infinite;
}

.b-message__component-placeholder {
  padding: 8px 10px;
  color: var(--text-secondary);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-secondary);
  border-radius: 6px;
}

@keyframes b-stream-cursor-blink {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0;
  }
}
</style>
