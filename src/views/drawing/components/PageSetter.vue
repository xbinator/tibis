<!--
  @file PageSetter.vue
  @description 画图页面默认画布设置面板。
-->
<template>
  <section class="page-setter">
    <header class="page-setter-header">
      <div class="page-setter-title">基础设置</div>
    </header>
    <div class="page-setter-list">
      <div class="page-setter-row">
        <span>元素</span>
        <strong>{{ drawingElements.length }}</strong>
      </div>
      <div class="page-setter-row">
        <span>形状</span>
        <strong>{{ shapeCount }}</strong>
      </div>
      <div class="page-setter-row">
        <span>缩放</span>
        <strong>{{ zoomPercent }}</strong>
      </div>
      <div class="page-setter-row">
        <span>中心点</span>
        <strong>{{ viewportCenterText }}</strong>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { DrawingData, DrawingElement, DrawingMetadata } from '@/components/BDrawing/types';

/**
 * 画布设置面板入参。
 */
interface Props {
  /** 当前画图数据 */
  drawingData: DrawingData;
  /** 当前画板元信息 */
  metadata: DrawingMetadata;
}

const props = defineProps<Props>();
/** 当前画图元素列表。 */
const drawingElements = computed<DrawingElement[]>(() => props.drawingData.elements);
/** 当前注册元素数量。 */
const shapeCount = computed<number>(() => drawingElements.value.length);
/** 当前视口缩放百分比文本。 */
const zoomPercent = computed<string>(() => `${Math.round(props.drawingData.viewport.zoom * 100)}%`);
/** 当前视口中心点文本。 */
const viewportCenterText = computed<string>(() => {
  const { center } = props.drawingData.viewport;

  return `${Math.round(center.x)}, ${Math.round(center.y)}`;
});
</script>

<style lang="less" scoped>
.page-setter {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.page-setter-header {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  height: 38px;
  padding: 0 12px;
  margin-bottom: 12px;
  box-shadow: 0 1px 0 0 var(--border-primary);
}

.page-setter-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.page-setter-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.page-setter-row {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  min-height: 34px;
  padding: 0 10px;
  font-size: 13px;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
}

.page-setter-row strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
}
</style>
