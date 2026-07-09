<!--
  @file PageSetter.vue
  @description Widget页面默认Widget设置面板，承载基础属性配置。
-->
<template>
  <ATabs class="page-setter">
    <ATabPane key="basic" tab="属性">
      <BSectionBlock title="基础">
        <BSectionItem label="名称" label-min-width="60">
          <AInput v-model:value="dataItem.name" placeholder="组件名称" />
        </BSectionItem>
        <BSectionItem label="使用说明" direction="vertical">
          <ATextarea
            v-model:value="dataItem.description"
            :auto-size="{ minRows: 3, maxRows: 6 }"
            placeholder="描述这个小组件能做什么、适合什么场景，帮助 AI 判断何时展示"
          />
        </BSectionItem>
      </BSectionBlock>
      <BSectionBlock title="尺寸" tips="设置运行态展示尺寸。留空按内容自适应；容器不足时等比缩小，容器更大时保持配置尺寸">
        <div class="page-setter__size-grid">
          <BSectionItem label="宽度" label-min-width="60">
            <BInputNumber v-model:value="dataItem.metadata.width" :min="1" :precision="0" placeholder="自适应" />
          </BSectionItem>
          <BSectionItem label="高度" label-min-width="60">
            <BInputNumber v-model:value="dataItem.metadata.height" :min="1" :precision="0" placeholder="自适应" />
          </BSectionItem>
        </div>
      </BSectionBlock>
    </ATabPane>
  </ATabs>
</template>

<script setup lang="ts">
import type { WidgetData, WidgetMetadata } from '@/components/BWidget/types';

/**
 * Widget 页面顶层 metadata。
 */
type WidgetPageMetadata = WidgetMetadata & {
  /** 运行态展示宽度 */
  width?: number;
  /** 运行态展示高度 */
  height?: number;
};

const dataItem = defineModel<WidgetData<WidgetPageMetadata>>('value', { required: true });
</script>

<style lang="less" scoped>
.page-setter {
  width: 100%;
}

.page-setter__size-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
}
</style>
