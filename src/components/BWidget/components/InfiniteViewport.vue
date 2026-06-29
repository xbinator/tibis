<!--
  @file InfiniteViewport.vue
  @description BWidget 无限Widget视口适配层。
-->
<template>
  <div class="b-widget-infinite-viewport" data-testid="widget-infinite-viewer">
    <div class="b-widget-infinite-viewport__content">
      <slot></slot>
    </div>
  </div>
</template>

<style lang="less" scoped>
.b-widget-infinite-viewport {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: var(--bg-primary);
}

.b-widget-infinite-viewport__content {
  display: flex;
  width: 100%;
  height: 100%;
}
</style>
