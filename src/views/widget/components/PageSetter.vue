<!--
  @file PageSetter.vue
  @description Widget页面默认Widget设置面板，承载基础属性配置。
-->
<template>
  <ATabs class="page-setter">
    <ATabPane key="basic" tab="属性">
      <BSectionBlock title="基础">
        <BSectionItem label="名称" label-min-width="60">
          <AInput v-model:value="widgetName" placeholder="组件名称" />
        </BSectionItem>
        <BSectionItem label="使用说明" direction="vertical">
          <ATextarea
            v-model:value="widgetDescription"
            :auto-size="{ minRows: 3, maxRows: 6 }"
            placeholder="描述这个小组件能做什么、适合什么场景，帮助 AI 判断何时展示"
          />
        </BSectionItem>
      </BSectionBlock>
    </ATabPane>
  </ATabs>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { WidgetData } from '@/components/BWidget/types';

const dataItem = defineModel<WidgetData>('value', { required: true });

/**
 * 向当前 Widget 数据写入配置变更。
 * @param patch - Widget 配置增量
 */
function updateWidgetDataConfig(patch: Partial<Pick<WidgetData, 'description' | 'name'>>): void {
  dataItem.value = { ...dataItem.value, ...patch };
}

/** 当前 Widget 能力名称。 */
const widgetName = computed<string>({
  /**
   * 读取 Widget 能力名称。
   * @returns 能力名称
   */
  get: (): string => dataItem.value.name,
  /**
   * 写入 Widget 能力名称。
   * @param value - 新能力名称
   */
  set: (value: string): void => {
    updateWidgetDataConfig({ name: value });
  }
});

/** 当前 Widget AI 使用说明。 */
const widgetDescription = computed<string>({
  /**
   * 读取 Widget AI 使用说明。
   * @returns AI 使用说明
   */
  get: (): string => dataItem.value.description,
  /**
   * 写入 Widget AI 使用说明。
   * @param value - 新 AI 使用说明
   */
  set: (value: string): void => {
    updateWidgetDataConfig({ description: value });
  }
});
</script>

<style lang="less" scoped>
.page-setter {
  width: 100%;
}
</style>
