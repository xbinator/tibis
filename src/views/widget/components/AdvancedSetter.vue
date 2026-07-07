<!--
  @file AdvancedSetter.vue
  @description Widget元素高级配置面板。
-->
<template>
  <div class="widget-advanced-setter">
    <BSectionBlock title="循环数据" :label-min-width="60">
      <BSectionItem label="启用" content-align="right">
        <ACheckbox v-model:checked="element.loop.enabled" />
      </BSectionItem>

      <BSectionItem label="数据源">
        <BTextInput v-model:value="element.loop.source" :use-template-syntax="false" :options="variableOptions" placeholder="数组数据路径，如 $input.items" />
      </BSectionItem>

      <BSectionItem label="迭代变量名">
        <AInput v-model:value="element.loop.itemName" placeholder="默认为：item" />
      </BSectionItem>
      <BSectionItem label="索引变量名">
        <AInput v-model:value="element.loop.indexName" placeholder="默认为：index" />
      </BSectionItem>

      <div class="widget-advanced-setter__loop-grid">
        <BSectionItem class="widget-advanced-setter__loop-field widget-advanced-setter__loop-field--columns" label="列数" direction="vertical">
          <BInputNumber v-model:value="element.loop.columns" placeholder="列数" />
        </BSectionItem>
        <BSectionItem class="widget-advanced-setter__loop-field widget-advanced-setter__loop-field--gap" label="列距" direction="vertical">
          <BInputNumber v-model:value="element.loop.columnGap" placeholder="列距" />
        </BSectionItem>
        <BSectionItem class="widget-advanced-setter__loop-field widget-advanced-setter__loop-field--gap" label="行距" direction="vertical">
          <BInputNumber v-model:value="element.loop.rowGap" placeholder="行距" />
        </BSectionItem>
      </div>
    </BSectionBlock>
  </div>
</template>

<script setup lang="ts">
import { Checkbox as ACheckbox, Input as AInput } from 'ant-design-vue';
import { useElementVariables } from '@/components/BWidget/hooks/useElementVariables';
import type { WidgetElement } from '@/components/BWidget/types';

defineOptions({ name: 'AdvancedSetter' });

const element = defineModel<WidgetElement>('element', { required: true });

/** 当前可插入变量候选。 */
const { variableOptions } = useElementVariables((): WidgetElement => element.value);
</script>

<style lang="less" scoped>
.widget-advanced-setter {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.widget-advanced-setter__loop-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.widget-advanced-setter__loop-field {
  min-width: 0;
}

.widget-advanced-setter__loop-field--columns {
  grid-column: 1 / -1;
}
</style>
