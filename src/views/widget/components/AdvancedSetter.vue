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
import { Checkbox as ACheckbox, Input as AInput, InputNumber as AInputNumber } from 'ant-design-vue';
import type { SelectOption } from '@/components/BSelect/types';
import { useElementVariables } from '@/components/BWidget/hooks/useElementVariables';
import type { WidgetData, WidgetElement, WidgetElementLoopConfig } from '@/components/BWidget/types';
import {
  createDefaultWidgetElementLoopConfig,
  readWidgetElementLoopConfig,
  resolveWidgetElementLoopVariableNames,
  WIDGET_LOOP_METADATA_KEY,
  writeWidgetElementLoopConfig
} from '@/components/BWidget/utils/widgetLoop';

defineOptions({ name: 'AdvancedSetter' });

/**
 * 高级配置面板入参。
 */
interface Props {
  /** 当前Widget数据 */
  dataItem: WidgetData;
}

const props = defineProps<Props>();
const elements = defineModel<WidgetElement[]>('elements', { required: true });

const { loopSourceOptions } = useElementVariables((): WidgetData => props.dataItem);

/** 循环数据源下拉选项，复用元素变量 hook 中的 schema 推导结果。 */
const sourceOptions = computed<SelectOption[]>((): SelectOption[] =>
  loopSourceOptions.value.map((option): SelectOption => ({ label: option.label, value: option.value }))
);

/** 当前承担循环配置的主元素。 */
const loopOwner = computed<WidgetElement | null>((): WidgetElement | null => {
  const configuredElement = elements.value.find((element: WidgetElement): boolean => WIDGET_LOOP_METADATA_KEY in element.metadata);
  const enabledElement = elements.value.find((element: WidgetElement): boolean => readWidgetElementLoopConfig(element.metadata).enabled);

  return enabledElement ?? configuredElement ?? elements.value[0] ?? null;
});

/** 当前循环配置。 */
const loopConfig = computed<WidgetElementLoopConfig>(() =>
  loopOwner.value ? readWidgetElementLoopConfig(loopOwner.value.metadata) : createDefaultWidgetElementLoopConfig()
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
  const owner = loopOwner.value;

  if (!owner) {
    return;
  }

  const nextConfig: WidgetElementLoopConfig = {
    ...readWidgetElementLoopConfig(owner.metadata),
    ...change
  };

  if (isLoopVariableNameChange(change) && hasDuplicateLoopVariableNames(nextConfig)) {
    return;
  }

  const nextOwner: WidgetElement = {
    ...owner,
    metadata: writeWidgetElementLoopConfig(owner.metadata, nextConfig)
  };

  elements.value = elements.value.map((element: WidgetElement): WidgetElement => (element.id === owner.id ? nextOwner : element));
}

/** 循环启用状态模型。 */
const loopEnabled = computed<boolean>({
  get: (): boolean => loopConfig.value.enabled,
  set: (enabled: boolean): void => updateLoopConfig({ enabled })
});

/** 循环数据源模型。 */
const loopSource = computed<string>({
  get: (): string => loopConfig.value.source,
  set: (source: string): void => updateLoopConfig({ source })
});

/** 循环迭代项变量名模型。 */
const loopItemName = computed<string>({
  get: (): string => loopConfig.value.itemName,
  set: (itemName: string): void => updateLoopConfig({ itemName })
});

/** 循环索引变量名模型。 */
const loopIndexName = computed<string>({
  get: (): string => loopConfig.value.indexName,
  set: (indexName: string): void => updateLoopConfig({ indexName })
});

/** 循环列数模型。 */
const loopColumns = computed<number>({
  get: (): number => loopConfig.value.columns,
  set: (columns: number): void => updateLoopConfig({ columns })
});

/** 循环列间距模型。 */
const loopColumnGap = computed<number>({
  get: (): number => loopConfig.value.columnGap,
  set: (columnGap: number): void => updateLoopConfig({ columnGap })
});

/** 循环行间距模型。 */
const loopRowGap = computed<number>({
  get: (): number => loopConfig.value.rowGap,
  set: (rowGap: number): void => updateLoopConfig({ rowGap })
});
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
