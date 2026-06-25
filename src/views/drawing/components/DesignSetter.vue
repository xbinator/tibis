<!--
  @file DesignSetter.vue
  @description 画图页面右侧设计设置面板，用于编辑选中元素的基础、文字、布局和填充属性。
-->
<template>
  <div class="setter-tab-panel">
    <!-- 基础 -->
    <section class="setter-section">
      <header class="setter-section-header">
        <div class="setter-section-title">基础</div>
      </header>
      <label class="setter-field setter-field--single">
        <span class="setter-field-label">名称</span>
        <AInput :value="readTextValue('text')" @update:value="handleTextChange('text', $event)" />
      </label>
    </section>

    <!-- 文字 -->
    <section class="setter-section">
      <header class="setter-section-header">
        <div class="setter-section-title">文字</div>
      </header>
      <div class="setter-field-grid">
        <label class="setter-field-item">
          <BIcon icon="lucide:type" :size="16" />
          <AInputNumber
            :value="readNumberValue('style.fontSize')"
            placeholder="字号"
            :controls="false"
            @update:value="handleNumberChange('style.fontSize', $event)"
          />
        </label>
        <label class="setter-field-item">
          <BIcon icon="lucide:bold" :size="16" />
          <BSelect :value="readSelectValue('style.fontWeight')" :options="fontWeightOptions" @update:value="handleNumberChange('style.fontWeight', $event)" />
        </label>
        <label class="setter-field-item">
          <BIcon icon="lucide:a-large-small" :size="16" />
          <BColorPicker :value="readColorValue('style.color', '#1f2937')" @update:value="handleTextChange('style.color', $event)" />
        </label>
      </div>
      <ASegmented :value="readTextValue('style.textAlign')" :options="textAlignOptions" @update:value="handleTextChange('style.textAlign', $event)" />
    </section>

    <!-- 布局 -->
    <section class="setter-section">
      <header class="setter-section-header">
        <div class="setter-section-title">布局</div>
      </header>
      <div class="setter-field-grid">
        <label class="setter-field-item">
          <span class="setter-field-prefix">X</span>
          <AInputNumber :value="readNumberValue('position.x')" :controls="false" @update:value="handleNumberChange('position.x', $event)" />
        </label>
        <label class="setter-field-item">
          <span class="setter-field-prefix">Y</span>
          <AInputNumber :value="readNumberValue('position.y')" :controls="false" @update:value="handleNumberChange('position.y', $event)" />
        </label>
        <label class="setter-field-item">
          <span class="setter-field-prefix">宽</span>
          <AInputNumber :value="readNumberValue('size.width')" :controls="false" @update:value="handleNumberChange('size.width', $event)" />
        </label>
        <label class="setter-field-item">
          <span class="setter-field-prefix">高</span>
          <AInputNumber :value="readNumberValue('size.height')" :controls="false" @update:value="handleNumberChange('size.height', $event)" />
        </label>
      </div>
    </section>

    <!-- 填充 -->
    <section class="setter-section">
      <header class="setter-section-header">
        <div class="setter-section-title">填充</div>
      </header>
      <label class="setter-field-item setter-field-item--full">
        <BIcon icon="lucide:paint-bucket" :size="16" />
        <BColorPicker :value="readColorValue('style.fill', '#ffffff')" @update:value="handleTextChange('style.fill', $event)" />
      </label>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Input as AInput, InputNumber as AInputNumber, Segmented as ASegmented } from 'ant-design-vue';
import type { DrawingElement } from '@/components/BDrawing/types';

/**
 * 设计设置面板入参。
 */
interface Props {
  /** 当前选中的画图元素 */
  selectedElements: DrawingElement[];
}

const props = defineProps<Props>();

/** 当前主编辑元素，多选时取第一个用于展示共同设置入口。 */
const selectedElement = computed<DrawingElement | null>(() => props.selectedElements[0] ?? null);

/** 字重选项。 */
const fontWeightOptions = [
  { value: '400', label: '字重 400' },
  { value: '500', label: '字重 500' },
  { value: '600', label: '字重 600' },
  { value: '700', label: '字重 700' }
];

/** 文本对齐选项。 */
const textAlignOptions = [
  { value: 'left', label: '左对齐' },
  { value: 'center', label: '居中' },
  { value: 'right', label: '右对齐' }
];

/**
 * 判断值是否为可写对象记录。
 * @param value - 待判断值
 * @returns 是否为对象记录
 */
function isWritableRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * 从对象路径读取值。
 * @param target - 目标对象
 * @param key - 数据路径
 * @returns 路径对应值
 */
function readValueByPath(target: DrawingElement | null, key: string): unknown {
  if (!target) {
    return undefined;
  }

  return key.split('.').reduce<unknown>((current: unknown, segment: string): unknown => {
    if (!isWritableRecord(current)) {
      return undefined;
    }

    return current[segment];
  }, target);
}

/**
 * 向对象路径写入值，会按需创建中间对象。
 * @param target - 目标元素
 * @param key - 数据路径
 * @param value - 新值
 */
function writeValueByPath(target: DrawingElement, key: string, value: unknown): void {
  const segments = key.split('.');
  let current: Record<string, unknown> = target as unknown as Record<string, unknown>;

  segments.forEach((segment: string, index: number): void => {
    if (index === segments.length - 1) {
      current[segment] = value;
      return;
    }

    if (!isWritableRecord(current[segment])) {
      current[segment] = {};
    }
    current = current[segment] as Record<string, unknown>;
  });
}

/**
 * 更新所有当前选中的元素字段。
 * @param key - 数据路径
 * @param value - 新值
 */
function updateSelectedElements(key: string, value: string | number): void {
  props.selectedElements.forEach((element: DrawingElement): void => {
    writeValueByPath(element, key, value);
  });
}

/**
 * 读取文本字段值。
 * @param key - 数据路径
 * @returns 文本值
 */
function readTextValue(key: string): string {
  const value = readValueByPath(selectedElement.value, key);

  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

/**
 * 读取数字字段值。
 * @param key - 数据路径
 * @returns 数字值，不存在时返回 undefined
 */
function readNumberValue(key: string): number | undefined {
  const value = readValueByPath(selectedElement.value, key);

  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * 读取颜色字段值。
 * @param key - 数据路径
 * @param fallback - 兜底颜色
 * @returns 颜色值
 */
function readColorValue(key: string, fallback: string): string {
  const value = readValueByPath(selectedElement.value, key);

  return typeof value === 'string' && value.startsWith('#') ? value : fallback;
}

/**
 * 读取选择字段值。
 * @param key - 数据路径
 * @returns 选择值
 */
function readSelectValue(key: string): string {
  return readTextValue(key);
}

/**
 * 处理文本变更。
 * @param key - 数据路径
 * @param value - 新值
 */
function handleTextChange(key: string, value: string | number): void {
  updateSelectedElements(key, value);
}

/**
 * 处理 AInputNumber / BSelect 数字变更。
 * @param key - 数据路径
 * @param value - 新值
 */
function handleNumberChange(key: string, value: unknown): void {
  const numValue = Number(value);
  if (value != null && Number.isFinite(numValue)) {
    updateSelectedElements(key, numValue);
  }
}
</script>

<style lang="less" scoped>
.setter-tab-panel {
  min-height: 0;
  padding: 12px;
}

.setter-section {
  padding-bottom: 12px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--border-primary);
}

.setter-section:last-child {
  padding-bottom: 0;
  margin-bottom: 0;
  border-bottom: 0;
}

.setter-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 28px;
  margin-bottom: 8px;
}

.setter-section-title {
  margin: 0;
  color: var(--text-primary);
}

.setter-field {
  display: flex;
  gap: 8px;
  align-items: center;
  min-width: 0;
}

.setter-field--single {
  min-height: 32px;
}

.setter-field-label {
  flex-shrink: 0;
  width: 48px;
  color: var(--text-secondary);
}

.setter-field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.setter-field-item {
  display: flex;
  gap: 6px;
  align-items: center;
  min-width: 0;
}

.setter-field-item--full {
  grid-column: 1 / -1;
}

.setter-field-prefix {
  flex-shrink: 0;
  min-width: 16px;
  color: var(--text-secondary);
  text-align: center;
}

/* AInputNumber 填满剩余宽度 */
.setter-field-item :deep(.ant-input-number) {
  flex: 1;
  width: 0;
  min-width: 0;
}

/* BSelect 填满剩余宽度 */
.setter-field-item :deep(.ant-select) {
  flex: 1;
  width: 0;
  min-width: 0;
}
</style>
