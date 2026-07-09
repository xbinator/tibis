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
import { useElementValue } from '../../hooks/useElementValue';
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
const buttonText = useElementValue(toRef(props, 'element'), 'text', { transform: 'text' });
/** 是否禁用按钮交互。 */
const buttonDisabled = useElementValue(toRef(props, 'element'), 'disabled', { transform: 'boolean' });
/** 是否展示加载态并阻止重复点击。 */
const buttonLoading = useElementValue(toRef(props, 'element'), 'loading', { transform: 'boolean' });

/**
 * 解析按钮动作参数模板。
 * @param argument - 参数模板
 * @returns 解析后的参数值
 */
function resolveButtonActionArgument(argument: string): unknown {
  return resolveWidgetTemplateValue(argument, renderContext.value);
}

/**
 * 解析按钮动作参数。
 * @param action - 按钮动作
 * @returns 解析后的参数列表
 */
function resolveButtonActionArgs(action: WidgetButtonAction): unknown[] {
  return action.args.map(resolveButtonActionArgument);
}

/**
 * 运行单个按钮动作。
 * @param action - 按钮动作
 */
function runButtonAction(action: WidgetButtonAction): void {
  runtime.value?.run(action.method, ...resolveButtonActionArgs(action));
}

/** 按钮是否阻止点击动作。 */
const buttonBlocked = computed<boolean>((): boolean => buttonDisabled.value || buttonLoading.value);
/** 点击动作列表。 */
const buttonActions = useElementValue(toRef(props, 'element'), 'actions', { transform: 'method' });
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
