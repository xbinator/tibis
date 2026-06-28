<!--
  @file BatchSetter.vue
  @description 画图页面多选元素设计和快捷操作面板。
-->
<template>
  <ATabs>
    <ATabPane key="design" tab="设计">
      <!-- 操作 -->
      <BSectionBlock title="操作">
        <div class="multi-select-actions">
          <div :data-testid="primaryCommandTestId" @click="emitCommand(primaryCommand)">
            <BButton type="secondary" size="small" :icon="primaryCommandIcon">{{ primaryCommandLabel }}</BButton>
          </div>
        </div>
      </BSectionBlock>

      <!-- 布局 -->
      <BSectionBlock title="布局">
        <div class="multi-select-field-grid">
          <BSectionItem label="X">
            <AInputNumber v-model:value="layoutXValue" placeholder="X" :controls="false" />
          </BSectionItem>
          <BSectionItem label="Y">
            <AInputNumber v-model:value="layoutYValue" placeholder="Y" :controls="false" />
          </BSectionItem>
          <BSectionItem label="宽">
            <AInputNumber v-model:value="layoutWidthValue" placeholder="宽" :controls="false" />
          </BSectionItem>
          <BSectionItem label="高">
            <AInputNumber v-model:value="layoutHeightValue" placeholder="高" :controls="false" />
          </BSectionItem>
        </div>
      </BSectionBlock>

      <!-- 填充 -->
      <BSectionBlock title="填充">
        <BSectionItem icon="lucide:paint-bucket">
          <BColorPicker v-model:value="backgroundColorValue">
            <AInput v-model:value="backgroundColorValue" placeholder="背景颜色" />
          </BColorPicker>
        </BSectionItem>
      </BSectionBlock>

      <!-- 描边 -->
      <BSectionBlock title="描边">
        <BSectionItem label="线形">
          <BSelect v-model:value="borderStyleValue" placeholder="线形" :options="borderStyleOptions" />
        </BSectionItem>

        <ControlPanel v-model:value="borderWidthValue" label="宽度" mode="sides" />

        <BSectionItem label="颜色">
          <BColorPicker v-model:value="borderColorValue">
            <AInput v-model:value="borderColorValue" placeholder="边框颜色" />
          </BColorPicker>
        </BSectionItem>

        <ControlPanel v-model:value="borderRadiusValue" label="圆角" mode="corners" />
      </BSectionBlock>
    </ATabPane>
  </ATabs>
</template>

<script setup lang="ts">
import type { DrawingMultiSelectLayoutChange } from '../types';
import { computed } from 'vue';
import { Input as AInput, InputNumber as AInputNumber, TabPane as ATabPane, Tabs as ATabs } from 'ant-design-vue';
import { isEqual } from 'lodash-es';
import type { DrawingBorderStyle, DrawingData, DrawingElement, DrawingElementStyle, DrawingElementStyleChange } from '@/components/BDrawing/types';
import { getDrawingElementGroupId } from '@/components/BDrawing/utils/drawingGroups';
import ControlPanel from './DesignSetter/ControlPanel.vue';

/**
 * 多选快捷操作命令。
 */
type MultiSelectCommand = 'copy' | 'group' | 'ungroup' | 'bringToFront' | 'bringForward' | 'sendBackward' | 'sendToBack' | 'delete';

/**
 * 多选顶部主操作命令。
 */
type MultiSelectPrimaryCommand = Extract<MultiSelectCommand, 'group' | 'ungroup'>;

/**
 * 元素外接框信息。
 */
interface SelectionBounds {
  /** 左上横坐标 */
  x: number;
  /** 左上纵坐标 */
  y: number;
  /** 外接框宽度 */
  width: number;
  /** 外接框高度 */
  height: number;
}

/**
 * 多选设置面板入参。
 */
interface Props {
  /** 当前画图数据 */
  drawingData: DrawingData;
  /** 当前选中的元素 ID 列表 */
  selectedElementIds: string[];
}

const props = defineProps<Props>();
const emit = defineEmits<{
  /** 触发多选快捷操作 */
  command: [command: MultiSelectCommand];
  /** 批量更新选中元素布局 */
  'layout-change': [layout: DrawingMultiSelectLayoutChange];
  /** 批量更新选中元素样式 */
  'style-change': [style: DrawingElementStyleChange];
}>();

/** 边框线形选项。 */
const borderStyleOptions: Array<{ value: DrawingBorderStyle; label: string }> = [
  { value: 'none', label: '无' },
  { value: 'solid', label: '实线' },
  { value: 'dashed', label: '虚线' },
  { value: 'dotted', label: '点线' }
];

/**
 * 创建多选元素外接框。
 * @param elements - 当前多选元素
 * @returns 外接框信息，空选择返回 null
 */
function createSelectionBounds(elements: DrawingElement[]): SelectionBounds | null {
  if (!elements.length) {
    return null;
  }

  const left = Math.min(...elements.map((element: DrawingElement): number => element.position.x));
  const top = Math.min(...elements.map((element: DrawingElement): number => element.position.y));
  const right = Math.max(...elements.map((element: DrawingElement): number => element.position.x + element.size.width));
  const bottom = Math.max(...elements.map((element: DrawingElement): number => element.position.y + element.size.height));

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  };
}

/** 当前多选命中的元素，保持画布图层顺序。 */
const selectedElements = computed<DrawingElement[]>(() => {
  const selectedIds = new Set(props.selectedElementIds);

  return props.drawingData.elements.filter((element: DrawingElement): boolean => selectedIds.has(element.id));
});

/** 当前多选是否命中了组合元素。 */
const hasGroupedSelection = computed<boolean>(() =>
  selectedElements.value.some((element: DrawingElement): boolean => getDrawingElementGroupId(element) !== null)
);

/** 顶部主操作命令。 */
const primaryCommand = computed<MultiSelectPrimaryCommand>(() => (hasGroupedSelection.value ? 'ungroup' : 'group'));

/** 顶部主操作图标。 */
const primaryCommandIcon = computed<string>(() => (primaryCommand.value === 'ungroup' ? 'lucide:ungroup' : 'lucide:group'));

/** 顶部主操作文案。 */
const primaryCommandLabel = computed<string>(() => (primaryCommand.value === 'ungroup' ? '拆分组' : '合并'));

/** 顶部主操作测试标识。 */
const primaryCommandTestId = computed<string>(() => `multi-select-command-${primaryCommand.value}`);

/**
 * 读取多个元素共享的字符串样式值。
 * @param key - 样式字段名
 * @returns 共享值，不一致时返回空字符串
 */
function getSharedStringStyleValue(key: 'backgroundColor' | 'borderColor'): string {
  const firstValue = selectedElements.value[0]?.style[key];
  if (!firstValue || selectedElements.value.length === 0) {
    return '';
  }

  return selectedElements.value.every((element: DrawingElement): boolean => element.style[key] === firstValue) ? firstValue : '';
}

/**
 * 读取多个元素共享的样式值。
 * @param key - 样式字段名
 * @returns 共享样式值，不一致时返回 undefined
 */
function getSharedStyleValue<Key extends keyof DrawingElementStyle>(key: Key): DrawingElementStyle[Key] | undefined {
  const firstValue = selectedElements.value[0]?.style[key];
  if (firstValue === undefined || selectedElements.value.length === 0) {
    return undefined;
  }

  return selectedElements.value.every((element: DrawingElement): boolean => isEqual(element.style[key], firstValue)) ? firstValue : undefined;
}

/**
 * 读取多个元素共享的描边线形。
 * @returns 共享线形，不一致时返回 undefined
 */
function getSharedBorderStyleValue(): DrawingBorderStyle | undefined {
  const firstValue = selectedElements.value[0]?.style.borderStyle;
  if (!firstValue || selectedElements.value.length === 0) {
    return undefined;
  }

  return selectedElements.value.every((element: DrawingElement): boolean => element.style.borderStyle === firstValue) ? firstValue : undefined;
}

/**
 * 规范化颜色输入值。
 * @param value - 原始颜色文本
 * @returns 可写入的颜色文本，空值返回 null
 */
function normalizeColorInput(value: string): string | null {
  const nextValue = value.trim();

  return nextValue || null;
}

/**
 * 规范化布局输入数值，避免浮点精度尾巴暴露到输入框。
 * @param value - 原始布局数值
 * @returns 保留两位小数后的布局数值
 */
function normalizeLayoutInputValue(value: number): number {
  return Number(value.toFixed(2));
}

/**
 * 触发批量样式变更。
 * @param style - 样式变更
 */
function emitStyleChange(style: DrawingElementStyleChange): void {
  emit('style-change', style);
}

/**
 * 触发批量布局变更。
 * @param key - 布局字段名
 * @param value - 布局字段值
 */
function emitLayoutChange(key: keyof DrawingMultiSelectLayoutChange, value: number | undefined): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return;
  }

  const nextValue = normalizeLayoutInputValue(value);

  if ((key === 'width' || key === 'height') && nextValue <= 0) {
    return;
  }

  emit('layout-change', { [key]: nextValue });
}

/** 当前多选外接框。 */
const selectionBounds = computed<SelectionBounds | null>(() => createSelectionBounds(selectedElements.value));

/** 多选外接框 X 坐标。 */
const layoutXValue = computed<number | undefined>({
  get: (): number | undefined => (selectionBounds.value ? normalizeLayoutInputValue(selectionBounds.value.x) : undefined),
  set: (value: number | undefined): void => {
    emitLayoutChange('x', value);
  }
});

/** 多选外接框 Y 坐标。 */
const layoutYValue = computed<number | undefined>({
  get: (): number | undefined => (selectionBounds.value ? normalizeLayoutInputValue(selectionBounds.value.y) : undefined),
  set: (value: number | undefined): void => {
    emitLayoutChange('y', value);
  }
});

/** 多选外接框宽度。 */
const layoutWidthValue = computed<number | undefined>({
  get: (): number | undefined => (selectionBounds.value ? normalizeLayoutInputValue(selectionBounds.value.width) : undefined),
  set: (value: number | undefined): void => {
    emitLayoutChange('width', value);
  }
});

/** 多选外接框高度。 */
const layoutHeightValue = computed<number | undefined>({
  get: (): number | undefined => (selectionBounds.value ? normalizeLayoutInputValue(selectionBounds.value.height) : undefined),
  set: (value: number | undefined): void => {
    emitLayoutChange('height', value);
  }
});

/** 多选共享填充色。 */
const backgroundColorValue = computed<string>({
  get: (): string => getSharedStringStyleValue('backgroundColor'),
  set: (value: string): void => {
    const nextValue = normalizeColorInput(value);
    if (nextValue) {
      emitStyleChange({ backgroundColor: nextValue });
    }
  }
});

/** 多选共享描边色。 */
const borderColorValue = computed<string>({
  get: (): string => getSharedStringStyleValue('borderColor'),
  set: (value: string): void => {
    const nextValue = normalizeColorInput(value);
    if (nextValue) {
      emitStyleChange({ borderColor: nextValue });
    }
  }
});

/** 多选共享描边宽度。 */
const borderWidthValue = computed<DrawingElementStyle['borderWidth'] | undefined>({
  get: (): DrawingElementStyle['borderWidth'] | undefined => getSharedStyleValue('borderWidth'),
  set: (value: DrawingElementStyle['borderWidth'] | undefined): void => {
    if (value !== undefined) {
      emitStyleChange({ borderWidth: value });
    }
  }
});

/** 多选共享圆角。 */
const borderRadiusValue = computed<DrawingElementStyle['borderRadius'] | undefined>({
  get: (): DrawingElementStyle['borderRadius'] | undefined => getSharedStyleValue('borderRadius'),
  set: (value: DrawingElementStyle['borderRadius'] | undefined): void => {
    if (value !== undefined) {
      emitStyleChange({ borderRadius: value });
    }
  }
});

/** 多选共享描边线形。 */
const borderStyleValue = computed<DrawingBorderStyle | undefined>({
  get: (): DrawingBorderStyle | undefined => getSharedBorderStyleValue(),
  set: (value: DrawingBorderStyle | undefined): void => {
    if (value) {
      emitStyleChange({ borderStyle: value });
    }
  }
});

/**
 * 触发多选快捷操作。
 * @param command - 快捷操作命令
 */
function emitCommand(command: MultiSelectCommand): void {
  emit('command', command);
}
</script>

<style lang="less" scoped>
.multi-select-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.multi-select-field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
</style>
