<template>
  <div class="b-chat">
    <div ref="mainRef" class="b-chat__main">
      <div class="b-chat__placeholder"></div>
      <div class="b-chat__container">
        <slot></slot>
      </div>
    </div>

    <ToBottomButton v-if="!hideToBottomButton" :visible="isBackBottom" :loading="loading" @click="scrollToBottom" />
  </div>
</template>

<script setup lang="ts">
import type { BChatExpose, BChatProps as Props } from './types';
import { computed, nextTick, onMounted, ref } from 'vue';
import { useEventListener } from '@vueuse/core';
import { getScrollTop, getScroller, setScrollTop } from '@/utils/scroll';
import ToBottomButton from './components/ToBottomButton.vue';

defineOptions({ name: 'BChat' });

const props = withDefaults(defineProps<Props>(), {
  finished: false,
  loading: false,
  hideToBottomButton: false
});

const emit = defineEmits<{
  (e: 'load'): void;
}>();

const BACK_BOTTOM_HEIGHT = 300;
const SCROLL_TOP_HEIGHT = 100;

const mainRef = ref<HTMLElement>();
const scroller = ref<HTMLElement | Window>();
const isBackBottom = ref(false);

const hideToBottomButton = computed(() => props.hideToBottomButton);

function handleLoadData() {
  if (props.finished) return;
  emit('load');
}

function scrollToBottom(options?: { behavior?: 'smooth' | 'auto' }) {
  const behavior = options?.behavior || 'smooth';
  nextTick(() => {
    if (scroller.value) {
      setScrollTop(scroller.value, { top: 0, behavior });
    }
  });
}

function handleScroll() {
  if (!scroller.value) return;

  const scrollTop = getScrollTop(scroller.value);
  isBackBottom.value = Math.abs(scrollTop) > BACK_BOTTOM_HEIGHT;

  if (scrollTop < SCROLL_TOP_HEIGHT) {
    handleLoadData();
  }
}

useEventListener(() => scroller.value, 'scroll', handleScroll);

onMounted(() => {
  scroller.value = getScroller(mainRef.value);
});

defineExpose<BChatExpose>({ scrollToBottom });
</script>

<style lang="less">
.b-chat {
  position: relative;
  height: 100%;

  &__main {
    display: flex;
    flex-direction: column-reverse;
    height: 100%;
    padding: var(--b-chat-padding, 16px);
    overflow-y: auto;
    scrollbar-gutter: stable;

    &::-webkit-scrollbar {
      display: block;
      width: 6px;
      height: 6px;
    }

    &::-webkit-scrollbar-thumb {
      display: block;
      background: var(--scrollbar-bg, rgb(0 0 0 / 10%));
      border-radius: 6px;

      &:hover {
        background: var(--scrollbar-hover, rgb(0 0 0 / 20%));
      }
    }
  }

  &__container {
    width: 100%;
    max-width: var(--b-chat-max-width, 800px);
    margin: 0 auto;
  }

  &__placeholder {
    flex: 1;
    pointer-events: none;
  }
}
</style>
