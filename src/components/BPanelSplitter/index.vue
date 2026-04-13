<template>
  <div class="b-panel-splitter">
    <div :class="['b-panel-splitter__section', sectionClass]" :style="sectionStyle">
      <slot></slot>
    </div>

    <div class="b-panel-splitter__line" :class="{ 'b-panel-splitter__line--dragging': isDragging }" :style="splitterStyle" @mousedown="handleMouseDown">
      <div class="b-panel-splitter__resizer"></div>
      <div class="b-panel-splitter__bar"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { BPanelSplitterProps as Props } from './types';
import { computed, reactive, ref } from 'vue';
import { clamp } from 'lodash-es';

defineOptions({ name: 'BPanelSplitter' });

const props = withDefaults(defineProps<Props>(), {
  position: 'left',
  minWidth: 200,
  maxWidth: 600,
  sectionClass: ''
});

const size = defineModel<number>('size', { default: 300 });

const isDragging = ref(false);
const state = reactive({ startX: 0 });

const isLeft = computed(() => props.position === 'left');

const sectionStyle = computed(() => ({
  width: `${size.value}px`
}));

const splitterStyle = computed(() => {
  if (isLeft.value) {
    return { left: 0, transform: 'translateX(-100%)' };
  }
  return { right: 0, transform: 'translateX(100%)' };
});

function handleMouseMove(e: MouseEvent) {
  const deltaX = e.clientX - state.startX;
  size.value = clamp(size.value + (isLeft.value ? -deltaX : deltaX), props.minWidth, props.maxWidth);
  state.startX = e.clientX;
}

function handleMouseUp() {
  isDragging.value = false;
  document.body.classList.remove('cursor-col-resize');
  document.body.style.userSelect = '';

  window.removeEventListener('mousemove', handleMouseMove);
  window.removeEventListener('mouseup', handleMouseUp);
}

function handleMouseDown(e: MouseEvent) {
  isDragging.value = true;
  state.startX = e.clientX;

  document.body.classList.add('cursor-col-resize');
  document.body.style.userSelect = 'none';

  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', handleMouseUp);
}
</script>

<style lang="less">
.b-panel-splitter {
  position: relative;
  height: 100%;
}

.b-panel-splitter__section {
  height: 100%;
  transition: background 0.2s ease;
}

.b-panel-splitter__line {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 10;
  width: 6px;
  padding: 0 2px;
  cursor: col-resize;
}

.b-panel-splitter__line:hover,
.b-panel-splitter__line--dragging {
  .b-panel-splitter__resizer {
    background: var(--scrollbar-bg);
  }

  .b-panel-splitter__bar {
    display: none;
  }
}

.b-panel-splitter__resizer {
  height: 100%;
  transition: all 0.2s ease;
}

.b-panel-splitter__bar {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 2px;
  height: 40px;
  background-color: var(--border-secondary);
  border-radius: 2px;
  transform: translate(-50%, -50%);
}
</style>
