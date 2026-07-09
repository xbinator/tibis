<!--
  @file index.vue
  @description BWidget 按钮元素中间Widget视图。
-->
<template>
  <div class="widget-button-element">
    <button :aria-busy="buttonLoading ? 'true' : 'false'" :class="buttonClasses" :disabled="buttonBlocked" type="button" @click.stop="handleButtonClick">
      <span v-if="buttonLoading" class="widget-button-element__loading" aria-hidden="true"></span>
      <span class="widget-button-element__text">{{ buttonText }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import type { WidgetButtonAction, WidgetButtonElementMetadata } from './schema';
import type { WidgetShapeElement } from '../../types';
import { computed, toRef } from 'vue';
import { useElementContent } from '../../hooks/useElementContent';
import { useRenderContext } from '../../hooks/useRenderContext';
import { useWidgetRuntime } from '../../hooks/useWidgetRuntime';
import { resolveWidgetTemplateValue } from '../../utils/widgetBindings';

/**
 * 按钮元素中间Widget视图入参。
 */
interface Props {
  /** 当前按钮元素 */
  element?: WidgetShapeElement<WidgetButtonElementMetadata>;
}

const props = defineProps<Props>();
/** Widget 运行态控制器。 */
const runtime = useWidgetRuntime();
/** Widget 渲染上下文。 */
const renderContext = useRenderContext();
/** 按钮展示文字（渲染态，已解析变量）。 */
const buttonText = useElementContent(toRef(props, 'element'), 'text');

/**
 * 判断值是否为普通对象。
 * @param value - 待判断值
 * @returns 是否为普通对象
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * 规整布尔控制值。
 * @param value - 原始值
 * @param fallback - 回退值
 * @returns 布尔值
 */
function normalizeBooleanValue(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  return fallback;
}

/**
 * 解析可能带 {{ }} 的模板值。
 * @param value - 原始值
 * @param fallback - 回退值
 * @returns 解析后的值
 */
function resolveTemplateValue(value: unknown, fallback: unknown): unknown {
  if (typeof value !== 'string') {
    return value ?? fallback;
  }

  return resolveWidgetTemplateValue(value, renderContext.value, fallback);
}

/**
 * 规整单个按钮动作配置。
 * @param action - 原始动作
 * @returns 按钮动作，不合法时返回 null
 */
function normalizeButtonAction(action: unknown): WidgetButtonAction | null {
  if (!isRecord(action)) {
    return null;
  }

  const method = typeof action.method === 'string' ? action.method.trim() : '';

  if (!method) {
    return null;
  }

  return {
    args: Array.isArray(action.args) ? action.args.filter((item: unknown): item is string => typeof item === 'string') : [],
    method
  };
}

/**
 * 规整按钮动作列表。
 * @param actions - 原始动作列表
 * @returns 可执行动作列表
 */
function normalizeButtonActions(actions: unknown): WidgetButtonAction[] {
  if (!Array.isArray(actions)) {
    return [];
  }

  return actions.flatMap((action: unknown): WidgetButtonAction[] => {
    const normalizedAction = normalizeButtonAction(action);

    return normalizedAction ? [normalizedAction] : [];
  });
}

/**
 * 解析按钮布尔元数据。
 * @param value - 元数据原始值
 * @param fallback - 回退值
 * @returns 布尔控制值
 */
function resolveButtonBoolean(value: unknown, fallback: boolean): boolean {
  return normalizeBooleanValue(resolveTemplateValue(value, fallback), fallback);
}

/**
 * 解析按钮动作参数。
 * @param action - 按钮动作
 * @returns 解析后的参数列表
 */
function resolveButtonActionArgs(action: WidgetButtonAction): unknown[] {
  return action.args.map((argument: string): unknown => resolveTemplateValue(argument, argument));
}

/**
 * 运行单个按钮动作。
 * @param action - 按钮动作
 */
function runButtonAction(action: WidgetButtonAction): void {
  runtime.value?.run(action.method, ...resolveButtonActionArgs(action));
}

/** 按钮元数据。 */
const buttonMetadata = computed<WidgetButtonElementMetadata | undefined>((): WidgetButtonElementMetadata | undefined => props.element?.metadata);
/** 是否禁用按钮交互。 */
const buttonDisabled = computed<boolean>((): boolean => resolveButtonBoolean(buttonMetadata.value?.disabled, false));
/** 是否展示加载态并阻止重复点击。 */
const buttonLoading = computed<boolean>((): boolean => resolveButtonBoolean(buttonMetadata.value?.loading, false));
/** 按钮是否阻止点击动作。 */
const buttonBlocked = computed<boolean>((): boolean => buttonDisabled.value || buttonLoading.value);
/** 点击动作列表。 */
const buttonActions = computed<WidgetButtonAction[]>((): WidgetButtonAction[] => normalizeButtonActions(buttonMetadata.value?.actions));
/** 按钮样式类名。 */
const buttonClasses = computed<Array<string | Record<string, boolean>>>(
  (): Array<string | Record<string, boolean>> => [
    'widget-button-element__button',
    {
      'is-loading': buttonLoading.value
    }
  ]
);

/**
 * 处理按钮点击，调用运行态中的同名业务方法。
 */
function handleButtonClick(): void {
  if (buttonBlocked.value) return;

  buttonActions.value.forEach(runButtonAction);
}
</script>

<style lang="less" scoped>
.widget-button-element {
  width: 100%;
  height: 100%;
}

.widget-button-element__button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  font: inherit;
  color: inherit;
  text-align: inherit;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: inherit;
}

.widget-button-element__button:disabled {
  cursor: not-allowed;
  opacity: 0.72;
}

.widget-button-element__button.is-loading {
  cursor: wait;
}

.widget-button-element__loading {
  flex: none;
  width: 1em;
  height: 1em;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 999px;
  animation: widget-button-element-loading-spin 0.8s linear infinite;
}

.widget-button-element__text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@keyframes widget-button-element-loading-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
