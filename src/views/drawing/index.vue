<!--
  @file index.vue
  @description 独立画图工具页面。
-->
<template>
  <main class="drawing-page">
    <BDrawing />
  </main>
</template>

<script setup lang="ts">
import BDrawing from '@/components/BDrawing/index.vue';
</script>

<style lang="less" scoped>
.drawing-page {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}
</style>
