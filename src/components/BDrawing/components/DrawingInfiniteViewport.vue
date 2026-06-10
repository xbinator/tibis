<!--
  @file DrawingInfiniteViewport.vue
  @description BDrawing 无限画布视口适配层。
-->
<template>
  <div class="b-drawing-infinite-viewport" data-testid="drawing-infinite-viewer">
    <VueInfiniteViewer
      class="b-drawing-infinite-viewport__viewer"
      :display-horizontal-scroll="false"
      :display-vertical-scroll="false"
      :use-mouse-drag="false"
      :use-wheel-pinch="false"
      :use-wheel-scroll="false"
    >
      <div class="b-drawing-infinite-viewport__content">
        <slot></slot>
      </div>
    </VueInfiniteViewer>
  </div>
</template>

<script setup lang="ts">
import { VueInfiniteViewer } from 'vue3-infinite-viewer';
</script>

<style lang="less" scoped>
.b-drawing-infinite-viewport {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: var(--bg-primary);
}

.b-drawing-infinite-viewport__viewer {
  width: 100%;
  height: 100%;
}

.b-drawing-infinite-viewport__content {
  display: flex;
  width: 100%;
  height: 100%;
}
</style>
