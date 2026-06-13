<!--
  @file DrawingInfiniteViewport.vue
  @description BDrawing 无限画布视口适配层。
-->
<template>
  <div class="b-drawing-infinite-viewport" data-testid="drawing-infinite-viewer">
    <div class="b-drawing-infinite-viewport__content">
      <slot></slot>
    </div>
  </div>
</template>

<style lang="less" scoped>
.b-drawing-infinite-viewport {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: var(--bg-primary);
}

.b-drawing-infinite-viewport__content {
  display: flex;
  width: 100%;
  height: 100%;
}
</style>
