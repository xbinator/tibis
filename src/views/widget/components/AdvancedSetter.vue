<!--
  @file AdvancedSetter.vue
  @description Widget元素高级配置面板。
-->
<template>
  <div class="widget-advanced-setter">
    <BSectionBlock title="循环数据" :label-min-width="60">
      <BSectionItem label="启用">
        <ACheckbox v-model:checked="loopEnabled" />
      </BSectionItem>

      <BSectionItem label="数据源">
        <BSelect v-model:value="loopSource" placeholder="选择数组数据" :options="sourceOptions" />
      </BSectionItem>

      <BSectionItem label="迭代变量名">
        <AInput v-model:value="loopItemName" placeholder="默认为：item" />
      </BSectionItem>
      <BSectionItem label="索引变量名">
        <AInput v-model:value="loopIndexName" placeholder="默认为：index" />
      </BSectionItem>

      <div class="widget-advanced-setter__grid">
        <BSectionItem label="列数" label-min-width="">
          <AInputNumber v-model:value="loopColumns" placeholder="列数" :controls="false" />
        </BSectionItem>
        <BSectionItem label="列距" label-min-width="">
          <AInputNumber v-model:value="loopColumnGap" placeholder="列距" :controls="false" />
        </BSectionItem>
        <BSectionItem label="行距" label-min-width="">
          <AInputNumber v-model:value="loopRowGap" placeholder="行距" :controls="false" />
        </BSectionItem>
      </div>

      <p v-if="sourceOptions.length === 0" class="widget-advanced-setter__empty">暂无可循环数组字段</p>
    </BSectionBlock>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { WritableComputedRef } from 'vue';
import { Checkbox as ACheckbox, Input as AInput, InputNumber as AInputNumber } from 'ant-design-vue';
import { isNumber } from 'lodash-es';
import type { SelectOption } from '@/components/BSelect/types';
import { useElementVariables } from '@/components/BWidget/hooks/useElementVariables';
import type { WidgetElement, WidgetElementLoopConfig } from '@/components/BWidget/types';
import { resolveWidgetElementLoopVariableNames } from '@/components/BWidget/utils/widgetLoop';

defineOptions({ name: 'AdvancedSetter' });

/**
 * 循环配置数值字段。
 */
type WidgetElementLoopNumberField = 'columns' | 'columnGap' | 'rowGap';

const element = defineModel<WidgetElement>('element', { required: true });

const { loopSourceOptions } = useElementVariables();

/** 循环数据源下拉选项，复用元素变量 hook 中的 schema 推导结果。 */
const sourceOptions = computed<SelectOption[]>((): SelectOption[] =>
  loopSourceOptions.value.map((option): SelectOption => ({ label: option.label, value: option.value }))
);

/**
 * 判断是否正在修改循环变量名字段。
 * @param change - 循环配置改动
 * @returns 是否包含变量名字段
 */
function isLoopVariableNameChange(change: Partial<WidgetElementLoopConfig>): boolean {
  return 'itemName' in change || 'indexName' in change;
}

/**
 * 判断循环变量名是否重复。
 * @param config - 循环配置
 * @returns 是否存在重复有效变量名
 */
function hasDuplicateLoopVariableNames(config: WidgetElementLoopConfig): boolean {
  const variableNames = resolveWidgetElementLoopVariableNames(config);

  return variableNames.itemName === variableNames.indexName;
}

/**
 * 更新当前循环配置并写回元素模型。
 * @param change - 需要覆盖的循环配置字段
 */
function updateLoopConfig(change: Partial<WidgetElementLoopConfig>): void {
  const nextConfig: WidgetElementLoopConfig = {
    ...element.value.loop,
    ...change
  };

  if (isLoopVariableNameChange(change) && hasDuplicateLoopVariableNames(nextConfig)) {
    return;
  }

  element.value = {
    ...element.value,
    loop: nextConfig
  };
}

/**
 * 更新循环配置单个字段。
 * @param key - 循环配置字段
 * @param value - 字段新值
 */
function updateLoopField<TKey extends keyof WidgetElementLoopConfig>(key: TKey, value: WidgetElementLoopConfig[TKey]): void {
  updateLoopConfig({ [key]: value } as Partial<WidgetElementLoopConfig>);
}

/**
 * 创建循环配置字段模型，保证控件写入时触发元素模型整体更新。
 * @param key - 循环配置字段
 * @returns 字段双向绑定模型
 */
function createLoopFieldModel<TKey extends keyof WidgetElementLoopConfig>(key: TKey): WritableComputedRef<WidgetElementLoopConfig[TKey]> {
  return computed<WidgetElementLoopConfig[TKey]>({
    get: (): WidgetElementLoopConfig[TKey] => element.value.loop[key],
    set: (value: WidgetElementLoopConfig[TKey]): void => updateLoopField(key, value)
  });
}

/**
 * 创建循环配置数值字段模型，忽略输入框清空时产生的空值。
 * @param key - 数值配置字段
 * @returns 数值字段双向绑定模型
 */
function createLoopNumberFieldModel(key: WidgetElementLoopNumberField): WritableComputedRef<number> {
  return computed<number>({
    get: (): number => element.value.loop[key],
    set: (value: number) => isNumber(value) && updateLoopField(key, value)
  });
}

/** 循环启用状态模型。 */
const loopEnabled = createLoopFieldModel('enabled');
/** 循环数据源模型。 */
const loopSource = createLoopFieldModel('source');
/** 循环迭代项变量名模型。 */
const loopItemName = createLoopFieldModel('itemName');
/** 循环索引变量名模型。 */
const loopIndexName = createLoopFieldModel('indexName');
/** 循环列数模型。 */
const loopColumns = createLoopNumberFieldModel('columns');
/** 循环列间距模型。 */
const loopColumnGap = createLoopNumberFieldModel('columnGap');
/** 循环行间距模型。 */
const loopRowGap = createLoopNumberFieldModel('rowGap');
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
