<!--
  @file AdvancedSetter.vue
  @description Widget元素高级配置面板。
-->
<template>
  <div class="widget-advanced-setter">
    <BSectionBlock title="循环数据">
      <BSectionItem label="启用">
        <ACheckbox v-model:checked="loopEnabled" />
      </BSectionItem>

      <template v-if="loopConfig.enabled">
        <BSectionItem label="数据源">
          <BSelect v-model:value="loopSource" placeholder="选择数组数据" :options="sourceOptions" :disabled="sourceOptions.length === 0" />
        </BSectionItem>

        <div class="widget-advanced-setter__grid">
          <BSectionItem label="列数">
            <AInputNumber v-model:value="loopColumns" placeholder="列数" :controls="false" />
          </BSectionItem>
          <BSectionItem label="列距">
            <AInputNumber v-model:value="loopColumnGap" placeholder="列距" :controls="false" />
          </BSectionItem>
          <BSectionItem label="行距">
            <AInputNumber v-model:value="loopRowGap" placeholder="行距" :controls="false" />
          </BSectionItem>
        </div>

        <BSectionItem label="迭代变量">
          <AInput v-model:value="loopItemName" placeholder="item" />
        </BSectionItem>
        <BSectionItem label="索引变量">
          <AInput v-model:value="loopIndexName" placeholder="index" />
        </BSectionItem>

        <p v-if="sourceOptions.length === 0" class="widget-advanced-setter__empty">暂无可循环数组字段</p>
      </template>
    </BSectionBlock>
  </div>
</template>

<script setup lang="ts">
import type { WidgetLoopChangePayload } from '../types';
import { computed } from 'vue';
import { Checkbox as ACheckbox, Input as AInput, InputNumber as AInputNumber } from 'ant-design-vue';
import type { SelectOption } from '@/components/BSelect/types';
import type { WidgetData, WidgetElement, WidgetElementLoopConfig, WidgetSchemaObject } from '@/components/BWidget/types';
import { buildWidgetDataSchema } from '@/components/BWidget/utils/widgetDataSchema';
import { readWidgetExecuteMethod } from '@/components/BWidget/utils/widgetExecuteMethod';
import { collectWidgetLoopDataSourceOptions, createDefaultWidgetElementLoopConfig, readWidgetElementLoopConfig } from '@/components/BWidget/utils/widgetLoop';

defineOptions({ name: 'AdvancedSetter' });

/**
 * 高级配置面板入参。
 */
interface Props {
  /** 当前Widget数据 */
  dataItem: WidgetData;
  /** 当前设置目标元素，单元素或同组多选 */
  targetElements: WidgetElement[];
}

const props = defineProps<Props>();
const emit = defineEmits<{
  /** 写入循环配置 */
  'loop-change': [payload: WidgetLoopChangePayload];
}>();

/** 当前执行脚本文本，用于静态推导 data schema。 */
const scriptCode = computed<string>((): string => readWidgetExecuteMethod(props.dataItem.execute).code);

/** 当前脚本静态推导出来的 data schema。 */
const dataSchema = computed<WidgetSchemaObject>((): WidgetSchemaObject => buildWidgetDataSchema(scriptCode.value, props.dataItem.inputSchema));

/** 循环数据源下拉选项。 */
const sourceOptions = computed<SelectOption[]>((): SelectOption[] =>
  collectWidgetLoopDataSourceOptions(props.dataItem.inputSchema, dataSchema.value).map(
    (option): SelectOption => ({
      label: option.label,
      value: option.value
    })
  )
);

/** 当前承担循环配置的主元素。 */
const loopOwner = computed<WidgetElement | null>((): WidgetElement | null => {
  const configuredElement = props.targetElements.find((element: WidgetElement): boolean => readWidgetElementLoopConfig(element.metadata).enabled);

  return configuredElement ?? props.targetElements[0] ?? null;
});

/** 当前循环配置。 */
const loopConfig = computed<WidgetElementLoopConfig>(
  (): WidgetElementLoopConfig => (loopOwner.value ? readWidgetElementLoopConfig(loopOwner.value.metadata) : createDefaultWidgetElementLoopConfig())
);

/**
 * 读取第一个可用循环数据源。
 * @returns 数据源路径，缺少选项时返回空字符串
 */
function readFirstSourceOptionValue(): string {
  const firstValue = sourceOptions.value[0]?.value;

  return typeof firstValue === 'string' ? firstValue : '';
}

/**
 * 规范化输入数字。
 * @param value - 输入值
 * @param fallback - 回退值
 * @returns 可写入的数字
 */
function normalizeNumberInput(value: number | string | null | undefined, fallback: number): number {
  const nextValue = typeof value === 'number' ? value : Number(value);

  return Number.isFinite(nextValue) ? nextValue : fallback;
}

/**
 * 规范化循环列数。
 * @param value - 输入值
 * @returns 正整数列数
 */
function normalizeColumnsInput(value: number | string | null | undefined): number {
  return Math.max(1, Math.floor(normalizeNumberInput(value, loopConfig.value.columns)));
}

/**
 * 规范化非负间距。
 * @param value - 输入值
 * @param fallback - 回退值
 * @returns 非负间距
 */
function normalizeGapInput(value: number | string | null | undefined, fallback: number): number {
  return Math.max(0, normalizeNumberInput(value, fallback));
}

/**
 * 规范化变量名输入。
 * @param value - 输入值
 * @param fallback - 回退值
 * @returns 可写入变量名
 */
function normalizeVariableName(value: string, fallback: string): string {
  const nextValue = value.trim();

  return nextValue || fallback;
}

/**
 * 合并并发出循环配置变更。
 * @param patch - 局部配置补丁
 */
function emitLoopConfigChange(patch: Partial<WidgetElementLoopConfig>): void {
  const owner = loopOwner.value;
  if (!owner) {
    return;
  }

  const nextConfig = {
    ...loopConfig.value,
    ...patch
  };

  if (nextConfig.itemName === nextConfig.indexName) {
    return;
  }

  emit('loop-change', {
    elementIds: [owner.id],
    config: nextConfig
  });
}

/** 循环启用状态。 */
const loopEnabled = computed<boolean>({
  get: (): boolean => loopConfig.value.enabled,
  set: (value: boolean): void => {
    emitLoopConfigChange({
      enabled: value,
      source: value && !loopConfig.value.source ? readFirstSourceOptionValue() : loopConfig.value.source
    });
  }
});

/** 循环数据源。 */
const loopSource = computed<string>({
  get: (): string => loopConfig.value.source,
  set: (value: string): void => {
    emitLoopConfigChange({ source: value });
  }
});

/** 每行循环列数。 */
const loopColumns = computed<number>({
  get: (): number => loopConfig.value.columns,
  set: (value: number | string | null | undefined): void => {
    emitLoopConfigChange({ columns: normalizeColumnsInput(value) });
  }
});

/** 循环列间距。 */
const loopColumnGap = computed<number>({
  get: (): number => loopConfig.value.columnGap,
  set: (value: number | string | null | undefined): void => {
    emitLoopConfigChange({ columnGap: normalizeGapInput(value, loopConfig.value.columnGap) });
  }
});

/** 循环行间距。 */
const loopRowGap = computed<number>({
  get: (): number => loopConfig.value.rowGap,
  set: (value: number | string | null | undefined): void => {
    emitLoopConfigChange({ rowGap: normalizeGapInput(value, loopConfig.value.rowGap) });
  }
});

/** 迭代项变量名。 */
const loopItemName = computed<string>({
  get: (): string => loopConfig.value.itemName,
  set: (value: string): void => {
    emitLoopConfigChange({ itemName: normalizeVariableName(value, 'item') });
  }
});

/** 索引变量名。 */
const loopIndexName = computed<string>({
  get: (): string => loopConfig.value.indexName,
  set: (value: string): void => {
    emitLoopConfigChange({ indexName: normalizeVariableName(value, 'index') });
  }
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
