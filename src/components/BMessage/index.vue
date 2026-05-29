<template>
  <div ref="rootRef" class="b-message" :class="`b-message--${loading ? 'streaming' : 'done'}`" :style="rootStyle">
    <div class="b-message__placeholder" aria-hidden="true"></div>

    <div class="b-message__container">
      <!-- Markdown 渲染 -->
      <div v-if="type === 'markdown'" class="b-message__markdown" @click="navigate.onLink" v-html="renderedMarkdown"></div>

      <!-- 纯文本渲染 -->
      <div v-else class="b-message__text">{{ content }}<span v-if="loading" class="b-message__cursor" aria-hidden="true"></span></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { BMessageProps as Props } from './types';
import { computed, onScopeDispose, shallowRef, watch } from 'vue';
import { marked } from 'marked';
import { useNavigate } from '@/hooks/useNavigate';
import { addCssUnit } from '@/utils/css';

defineOptions({ name: 'BMessage' });

const navigate = useNavigate();

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

/** 光标占位标记，用于在流式渲染时替换为动画光标 HTML */
const CURSOR_MARKER = '___B_MESSAGE_CURSOR_MARKER___';

/**
 * 将 Markdown 内容解析为 HTML。
 * @param text - Markdown 文本
 * @param loading - 是否处于流式加载状态（流式时追加光标）
 * @returns 解析后的 HTML 字符串
 */
function parseMarkdown(text: string, loading: boolean): string {
  if (!text && !loading) return '';
  if (!text && loading) return '<span class="b-message__cursor" aria-hidden="true"></span>';

  const textToParse = loading ? text + CURSOR_MARKER : text;
  let html = marked.parse(textToParse, { async: false }) as string;

  if (loading) {
    html = html.replace(CURSOR_MARKER, '<span class="b-message__cursor" aria-hidden="true"></span>');
  }

  return html;
}

/** 流式渲染结果，使用 shallowRef 避免深度追踪 */
const renderedMarkdown = shallowRef<string>('');

/** 当前是否正在流式传输 */
const isStreaming = computed(() => props.loading);

/** rAF 句柄，用于流式渲染的帧级合并 */
let rafHandle: ReturnType<typeof requestAnimationFrame> | null = null;

/**
 * 调度请求渲染，确保流式时每帧最多执行一次 markdown 解析。
 * 非流式状态直接同步渲染。
 */
function scheduleRender(): void {
  if (isStreaming.value && props.content) {
    // 流式状态下使用 rAF 合并，每帧最多渲染一次
    if (rafHandle !== null) {
      cancelAnimationFrame(rafHandle);
    }
    rafHandle = requestAnimationFrame(() => {
      rafHandle = null;
      renderedMarkdown.value = parseMarkdown(props.content, true);
    });
  } else {
    // 非流式状态（完成/初始空内容）同步渲染
    if (rafHandle !== null) {
      cancelAnimationFrame(rafHandle);
      rafHandle = null;
    }
    renderedMarkdown.value = parseMarkdown(props.content, isStreaming.value);
  }
}

// 监听内容和流式状态变化，触发渲染调度
watch(
  () => [props.content, props.loading] as const,
  () => {
    scheduleRender();
  },
  { immediate: true }
);

// 组件卸载时清理未执行的 rAF
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
