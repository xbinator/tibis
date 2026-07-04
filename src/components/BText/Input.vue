<template>
  <div ref="rootRef" :class="bem()" @focusout="handleFocusOut">
    <AInput
      ref="inputRef"
      :class="bem('control')"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      type="text"
      @input="handleInput"
      @focus="handleSelectionEvent"
      @click="handleSelectionEvent"
      @keyup="handleKeyup"
      @select="handleSelectionEvent"
      @keydown="handleKeydown"
    >
      <template #suffix>
        <div :class="bem('variable', { active: dropdownVisible })" @mousedown.prevent @click="handleVariableButtonClick">
          <BIcon icon="lucide:braces" />
        </div>
      </template>
    </AInput>
    <VariableSelect
      :visible="dropdownVisible"
      :variables="filteredVariables"
      :position="dropdownPosition"
      :dropdown-width="dropdownWidth"
      :teleport="false"
      :inline-style="dropdownInlineStyle"
      :active-index="activeIndex"
      @select="handleVariableSelect"
      @toggle="handleVariableToggle"
      @update:active-index="handleActiveIndexChange"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * @file Input.vue
 * @description BText 单行变量补全输入组件。
 */
import type { Variable, VariableOptionGroup } from './types';
import type { VisibleVariable } from './utils/variables';
import type { CSSProperties } from 'vue';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Input as AInput } from 'ant-design-vue';
import { createNamespace } from '@/utils/namespace';
import VariableSelect from './components/VariableSelect.vue';
import { flattenVariables, getVisibleVariables } from './utils/variables';

/** 触发器向前查找的最大字符数。 */
const TEXT_INPUT_TRIGGER_LOOKBEHIND = 100;
/** 默认下拉锚点位置，等待首次打开时同步为真实输入框位置。 */
const DEFAULT_DROPDOWN_POSITION = { top: 0, left: 0, bottom: 0 };
/** 默认下拉宽度，等待首次打开时同步为真实输入框宽度。 */
const DEFAULT_DROPDOWN_WIDTH = 300;

/**
 * 单行变量输入组件属性。
 */
interface Props {
  /** 占位符 */
  placeholder?: string;
  /** 变量选项 */
  options?: VariableOptionGroup[];
  /** 是否禁用 */
  disabled?: boolean;
}

/**
 * 输入框内的触发替换范围。
 */
interface TemplateTriggerRange {
  /** 替换起始位置 */
  from: number;
  /** 替换结束位置 */
  to: number;
  /** 触发后的搜索词 */
  query: string;
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '',
  options: () => [],
  disabled: false
});

const emit = defineEmits<{
  /** 输入值变化 */
  (e: 'change', value: string): void;
}>();

const modelValue = defineModel<string>('value', { default: '' });
const [, bem] = createNamespace('text-input');

/** 组件根节点。 */
const rootRef = ref<HTMLDivElement | null>(null);
/** AInput 组件实例。 */
const inputRef = ref<InstanceType<typeof AInput> | null>(null);

/**
 * 获取 AInput 内部的原生输入节点。
 * @returns 原生 input 元素，未挂载时返回 null
 */
function getNativeInput(): HTMLInputElement | null {
  const el = inputRef.value?.$el;
  return el instanceof HTMLElement ? el.querySelector('input') : null;
}
/** 当前变量下拉是否打开。 */
const dropdownVisible = ref(false);
/** 变量下拉锚点位置。 */
const dropdownPosition = ref(DEFAULT_DROPDOWN_POSITION);
/** 变量下拉宽度。 */
const dropdownWidth = ref(DEFAULT_DROPDOWN_WIDTH);
/** 当前高亮变量索引。 */
const activeIndex = ref(0);
/** 当前触发替换范围。 */
const triggerRange = ref<TemplateTriggerRange | null>(null);
/** 最近一次输入光标位置。 */
const cursorPosition = ref(0);
/** 用户手动折叠的变量节点值集合。 */
const collapsedVariableValues = ref<Set<string>>(new Set());

/** 变量树根节点。 */
const variableTrees = computed<Variable[]>((): Variable[] => props.options.flatMap((group: VariableOptionGroup): Variable[] => group.options));
/** 所有变量的扁平列表。 */
const allVariables = computed<Variable[]>((): Variable[] => flattenVariables(variableTrees.value));
/** 是否有变量可选。 */
const hasVariables = computed<boolean>((): boolean => allVariables.value.length > 0);
/** 当前下拉可见变量。 */
const filteredVariables = computed<VisibleVariable[]>((): VisibleVariable[] =>
  getVisibleVariables(variableTrees.value, collapsedVariableValues.value, triggerRange.value?.query ?? '')
);
/** 单行输入内联下拉样式，避免全局 Teleport 定位在鼠标打开时跑到页面左侧。 */
const dropdownInlineStyle = computed<CSSProperties>(
  (): CSSProperties => ({
    position: 'absolute',
    top: 'calc(100% + 4px)',
    left: '0px',
    width: '100%',
    zIndex: 20
  })
);

/**
 * 读取输入框当前光标位置。
 * @returns 光标位置
 */
function readInputCursorPosition(): number {
  return getNativeInput()?.selectionStart ?? modelValue.value.length;
}

/**
 * 同步光标位置。
 */
function syncCursorPosition(): void {
  cursorPosition.value = readInputCursorPosition();
}

/**
 * 从输入内容和光标位置中读取模板变量触发范围。
 * @param value - 输入框完整文本
 * @param cursor - 当前光标位置
 * @returns 触发范围；未命中时返回 null
 */
function readTemplateTriggerRange(value: string, cursor: number): TemplateTriggerRange | null {
  const windowStart = Math.max(0, cursor - TEXT_INPUT_TRIGGER_LOOKBEHIND);
  const textBeforeCursor = value.slice(windowStart, cursor);
  const openIndex = textBeforeCursor.lastIndexOf('{{');

  if (openIndex === -1) {
    return null;
  }

  const query = textBeforeCursor.slice(openIndex + 2);

  if (query.includes('}}') || query.includes('{{') || /[{}\n]/.test(query)) {
    return null;
  }

  return {
    from: windowStart + openIndex,
    to: cursor,
    query
  };
}

/**
 * 同步变量下拉锚点位置。
 */
function syncDropdownPosition(): void {
  const rect = rootRef.value?.getBoundingClientRect();
  if (!rect) {
    dropdownPosition.value = DEFAULT_DROPDOWN_POSITION;
    dropdownWidth.value = DEFAULT_DROPDOWN_WIDTH;
    return;
  }

  dropdownPosition.value = {
    top: rect.top,
    left: rect.left,
    bottom: rect.bottom
  };
  dropdownWidth.value = rect.width || DEFAULT_DROPDOWN_WIDTH;
}

/**
 * 打开变量下拉。
 * @param range - 变量插入或替换范围
 */
function openDropdown(range: TemplateTriggerRange): void {
  if (!hasVariables.value || props.disabled) {
    return;
  }

  triggerRange.value = range;
  activeIndex.value = 0;
  syncDropdownPosition();
  dropdownVisible.value = true;
}

/**
 * 关闭变量下拉。
 */
function closeDropdown(): void {
  dropdownVisible.value = false;
  triggerRange.value = null;
  activeIndex.value = 0;
}

/**
 * 根据当前输入状态同步触发下拉。
 */
function syncTriggerDropdown(value = modelValue.value, cursor = cursorPosition.value): void {
  const range = readTemplateTriggerRange(value, cursor);

  if (!range) {
    closeDropdown();
    return;
  }

  openDropdown(range);
}

/**
 * 将输入值更新到外部模型。
 * @param value - 新输入值
 */
function updateValue(value: string): void {
  modelValue.value = value;
  emit('change', value);
}

/**
 * 设置输入框光标位置。
 * @param position - 光标位置
 */
async function setInputCursorPosition(position: number): Promise<void> {
  await nextTick();
  const input = getNativeInput();
  input?.focus();
  input?.setSelectionRange(position, position);
  cursorPosition.value = position;
}

/**
 * 替换输入框指定范围文本。
 * @param range - 替换范围
 * @param insertText - 插入文本
 */
function replaceInputRange(range: TemplateTriggerRange, insertText: string): void {
  const nextValue = `${modelValue.value.slice(0, range.from)}${insertText}${modelValue.value.slice(range.to)}`;
  const nextCursor = range.from + insertText.length;

  updateValue(nextValue);
  closeDropdown();
  setInputCursorPosition(nextCursor).catch((error: unknown): void => {
    console.warn('BTextInput cursor sync failed', error);
  });
}

/**
 * 处理输入事件。
 * @param event - 输入事件
 */
function handleInput(event: Event): void {
  const { target } = event;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  updateValue(target.value);
  cursorPosition.value = target.selectionStart ?? target.value.length;
  syncTriggerDropdown(target.value, cursorPosition.value);
}

/**
 * 处理选择相关事件，保持光标位置可用于变量按钮插入。
 * 点击来自变量按钮时不处理，避免与按钮点击行为冲突。
 * @param event - 选择或点击事件
 */
function handleSelectionEvent(event?: Event): void {
  const target = event?.target;
  if (target instanceof Element && target.closest('.b-text-input__variable')) {
    return;
  }

  syncCursorPosition();
  syncTriggerDropdown();
}

/**
 * 处理按键抬起事件，跟随左右方向键等光标变化同步触发状态。
 */
function handleKeyup(): void {
  syncCursorPosition();
  syncTriggerDropdown();
}

/**
 * 处理变量选择。
 * @param variable - 被选中的变量
 */
function handleVariableSelect(variable: Variable): void {
  if (!triggerRange.value) {
    return;
  }

  replaceInputRange(triggerRange.value, `{{ ${variable.value} }}`);
}

/**
 * 处理键盘导航变量下拉。
 * @param event - 键盘事件
 */
function handleKeydown(event: KeyboardEvent): void {
  if (!dropdownVisible.value || filteredVariables.value.length === 0) {
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    closeDropdown();
    return;
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    activeIndex.value = Math.min(activeIndex.value + 1, filteredVariables.value.length - 1);
    return;
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault();
    activeIndex.value = Math.max(activeIndex.value - 1, 0);
    return;
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    handleVariableSelect(filteredVariables.value[activeIndex.value]);
  }
}

/**
 * 处理变量按钮点击。
 */
function handleVariableButtonClick(): void {
  syncCursorPosition();
  openDropdown({
    from: cursorPosition.value,
    to: cursorPosition.value,
    query: ''
  });
}

/**
 * 处理变量树节点展开状态切换。
 * @param variable - 被切换的变量
 */
function handleVariableToggle(variable: Variable): void {
  const nextValues = new Set(collapsedVariableValues.value);

  if (nextValues.has(variable.value)) {
    nextValues.delete(variable.value);
  } else {
    nextValues.add(variable.value);
  }

  collapsedVariableValues.value = nextValues;
}

/**
 * 处理变量高亮项变更。
 * @param index - 高亮项索引
 */
function handleActiveIndexChange(index: number): void {
  activeIndex.value = index;
}

/**
 * 判断焦点是否仍在组件内部或变量下拉内部。
 * @param target - 下一个焦点目标
 * @returns 是否应保持下拉打开
 */
function isFocusInside(target: EventTarget | null): boolean {
  if (!(target instanceof Node)) {
    return false;
  }

  if (rootRef.value?.contains(target)) {
    return true;
  }

  return target instanceof Element && target.closest('.select-dropdown') !== null;
}

/**
 * 处理焦点离开组件。
 * @param event - 焦点事件
 */
function handleFocusOut(event: FocusEvent): void {
  if (!isFocusInside(event.relatedTarget)) {
    closeDropdown();
  }
}

/**
 * 判断指针事件是否发生在组件或变量下拉外部。
 * @param event - 指针事件
 * @returns 是否为外部事件
 */
function isOutsidePointerEvent(event: PointerEvent): boolean {
  const { target } = event;
  if (!(target instanceof Node)) {
    return false;
  }

  if (rootRef.value?.contains(target)) {
    return false;
  }

  return !(target instanceof Element && target.closest('.select-dropdown') !== null);
}

/**
 * 处理外部指针按下，关闭变量下拉。
 * @param event - 指针事件
 */
function handleDocumentPointerDown(event: PointerEvent): void {
  if (dropdownVisible.value && isOutsidePointerEvent(event)) {
    closeDropdown();
  }
}

watch(filteredVariables, (variables: VisibleVariable[]): void => {
  if (activeIndex.value < variables.length) {
    return;
  }

  activeIndex.value = Math.max(0, variables.length - 1);
});

onMounted((): void => {
  document.addEventListener('pointerdown', handleDocumentPointerDown);
});

onBeforeUnmount((): void => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown);
});
</script>

<style lang="less" scoped>
.b-text-input {
  position: relative;
  width: 100%;
  min-width: 0;
}

.b-text-input__variable {
  color: var(--text-tertiary);
  cursor: pointer;

  &:hover {
    color: var(--color-primary);
  }

  &.b-text-input__variable--active {
    color: var(--color-primary);
  }
}
</style>
