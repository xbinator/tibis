<!--
  @file AdvancedSetter.vue
  @description Widget元素高级配置面板。
-->
<template>
  <div class="widget-advanced-setter">
    <BSectionBlock title="循环数据" :label-min-width="60">
      <BSectionItem label="启用">
        <ACheckbox v-model:checked="element.loop.enabled" />
      </BSectionItem>

      <BSectionItem label="数据源">
        <BSelect v-model:value="element.loop.source" placeholder="选择数组数据" :options="sourceOptions" />
      </BSectionItem>

      <BSectionItem label="迭代变量名">
        <AInput v-model:value="element.loop.itemName" placeholder="默认为：item" />
      </BSectionItem>
      <BSectionItem label="索引变量名">
        <AInput v-model:value="element.loop.indexName" placeholder="默认为：index" />
      </BSectionItem>

      <div class="widget-advanced-setter__grid">
        <BSectionItem label="列数" label-min-width="">
          <AInputNumber v-model:value="element.loop.columns" placeholder="列数" :controls="false" />
        </BSectionItem>
        <BSectionItem label="列距" label-min-width="">
          <AInputNumber v-model:value="element.loop.columnGap" placeholder="列距" :controls="false" />
        </BSectionItem>
        <BSectionItem label="行距" label-min-width="">
          <AInputNumber v-model:value="element.loop.rowGap" placeholder="行距" :controls="false" />
        </BSectionItem>
      </div>

      <p v-if="sourceOptions.length === 0" class="widget-advanced-setter__empty">暂无可循环数组字段</p>
    </BSectionBlock>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Checkbox as ACheckbox, Input as AInput, InputNumber as AInputNumber } from 'ant-design-vue';
import type { SelectOption } from '@/components/BSelect/types';
import { useElementVariables } from '@/components/BWidget/hooks/useElementVariables';
import type { WidgetElement } from '@/components/BWidget/types';

defineOptions({ name: 'AdvancedSetter' });

const element = defineModel<WidgetElement>('element', { required: true });

const { loopSourceOptions } = useElementVariables();

/** 循环数据源下拉选项，复用元素变量 hook 中的 schema 推导结果。 */
const sourceOptions = computed<SelectOption[]>((): SelectOption[] =>
  loopSourceOptions.value.map((option): SelectOption => ({ label: option.label, value: option.value }))
);
</script>

<style lang="less" scoped>
.widget-advanced-setter {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.widget-advanced-setter__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.widget-advanced-setter__empty {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary);
}
</style>
