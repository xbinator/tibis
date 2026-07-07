<!--
  @file Runtime.vue
  @description BWidget 运行态内容边界只读Widget视图。
-->
<template>
  <section ref="rootRef" :class="name" :style="rootStyle">
    <div :class="bem('stage-viewport')" :style="stageViewportStyle">
      <div :class="bem('stage')" :style="stageStyle">
        <WidgetNode
          v-for="item in runtimeElements"
          :key="item.node.id"
          :node="item.node"
          :node-render-context="item.renderContext"
          :preview-size="item.renderSize"
          @context-menu="ignoreContextMenu"
          @release="ignoreNodeEvent"
          @select="ignoreNodeEvent"
        />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { WidgetData, WidgetShapeElement, WidgetSize } from './types';
import type { WidgetRenderContext } from 'types/widget';
import type { CSSProperties } from 'vue';
import { computed, onMounted, shallowRef, watch } from 'vue';
import { nanoid } from 'nanoid';
import { logger } from '@/shared/logger';
import { createNamespace } from '@/utils/namespace';
import { provideRenderContext } from './hooks/useRenderContext';
import { useViewportSize } from './hooks/useViewportSize';
import { provideWidgetRuntime, type WidgetRuntimeController } from './hooks/useWidgetRuntime';
import WidgetNode from './renderers/WidgetNode.vue';
import { createWidgetLoopRenderElements, type WidgetLoopRenderContext, type WidgetLoopRenderElement } from './utils/widgetLoop';
import {
  createWidgetHttpClient,
  createWidgetRuntimeInstance,
  mountWidgetRuntime,
  type WidgetRuntimeChange,
  type WidgetRuntimeFinishResult,
  type WidgetRuntimeState
} from './utils/widgetRuntime';
import { createWidgetRuntimeLayoutFromRenderElements, type WidgetRuntimeElementLayout } from './utils/widgetRuntime/layout';
import { formatWidgetLogArgs } from './utils/widgetRuntime/logger';
import { applyWidgetRuntimePatchesToState, type WidgetRuntimePatch } from './utils/widgetRuntime/patch';

defineOptions({ name: 'BWidgetRuntime' });

/**
 * 运行态Widget视图入参。
 */
interface Props {
  /** Widget模板值 */
  value: WidgetData;
  /** 运行态渲染上下文 */
  renderContext: WidgetRenderContext;
  /** 宿主提交运行态变化的异步回调。 */
  commitRuntimeChange?: (change: WidgetRuntimeChange) => Promise<void> | void;
}

/**
 * 运行态可渲染元素。
 */
interface WidgetRuntimeRenderableElement {
  /** 已平移到运行态坐标的节点 */
  node: WidgetShapeElement;
  /** 布局测量时使用的渲染尺寸 */
  renderSize: WidgetSize;
  /** 节点级渲染上下文 */
  renderContext: WidgetLoopRenderContext;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  /** 运行态脚本执行完成后的状态变化 */
  change: [change: WidgetRuntimeChange];
}>();

const [name, bem] = createNamespace('widget-runtime');
const { viewportSize, scheduleViewportSizeSyncFromRoot } = useViewportSize('rootRef', { allowZeroHeight: true });
/** 小组件脚本托管 HTTP 客户端。 */
const widgetHttpClient = createWidgetHttpClient();
/** 脚本执行中的实时 patch 预览状态，不进入宿主持久化确认队列。 */
const patchPreviewRuntimeState = shallowRef<WidgetRuntimeState | null>(null);
/** 运行态本地快照，用于衔接宿主 props 回写前的连续交互。 */
const localRuntimeState = shallowRef<WidgetRuntimeState | null>(null);
/** mounted 生命周期是否已在当前组件实例中执行过。 */
const mountedInitialized = shallowRef<boolean>(false);
/** 当前运行态是否已由交互收尾。 */
const runtimeFinished = shallowRef<boolean>(false);
/** 当前运行态是否执行失败。 */
const runtimeFailed = shallowRef<boolean>(false);
/** 串行运行态脚本任务，避免并发交互读取同一个旧快照。 */
let runtimeTaskQueue: Promise<void> = Promise.resolve();
/** 当前允许接收 patch 的执行 ID。 */
let activePatchExecutionId: string | null = null;

/** 来自宿主 props 的运行态状态快照。 */
const propsRuntimeState = computed<WidgetRuntimeState>(() => ({
  value: props.value,
  renderContext: props.renderContext
}));
/** 当前有效运行态状态快照。 */
const runtimeState = computed<WidgetRuntimeState>(() => patchPreviewRuntimeState.value ?? localRuntimeState.value ?? propsRuntimeState.value);
/** 运行态渲染上下文响应式包装。 */
const providedRenderContext = computed<WidgetRenderContext | undefined>(() => runtimeState.value.renderContext);

provideRenderContext(providedRenderContext);

/** 当前运行态是否允许继续渲染节点。 */
const shouldRenderRuntimeElements = computed<boolean>(() => !runtimeFailed.value);
/** 循环展开后的运行态渲染元素。 */
const runtimeRenderElements = computed<WidgetLoopRenderElement[]>(() =>
  shouldRenderRuntimeElements.value ? createWidgetLoopRenderElements(runtimeState.value.value.elements, runtimeState.value.renderContext) : []
);
/** 运行态渲染元素上下文索引。 */
const runtimeRenderContextByElementId = computed<Map<string, WidgetLoopRenderContext>>(
  () => new Map(runtimeRenderElements.value.map((item: WidgetLoopRenderElement): [string, WidgetLoopRenderContext] => [item.element.id, item.renderContext]))
);
/** 当前运行态内容布局。 */
const runtimeLayout = computed(() => createWidgetRuntimeLayoutFromRenderElements(runtimeRenderElements.value, 0));
/** 当前运行态内容缩放比例。 */
const runtimeScale = computed<number>(() => {
  if (!runtimeLayout.value.elements.length) {
    return 1;
  }

  if (!viewportSize.value.width || !runtimeLayout.value.contentSize.width) {
    return 1;
  }

  return viewportSize.value.width / runtimeLayout.value.contentSize.width;
});
/** 缩放后的运行态视图高度。 */
const scaledHeight = computed<number>(() => runtimeLayout.value.contentSize.height * runtimeScale.value);
/** 运行态渲染元素，使用平移后的内容边界坐标，不修改来源Widget数据。 */
const runtimeElements = computed<WidgetRuntimeRenderableElement[]>(() =>
  runtimeLayout.value.elements.map(
    (item: WidgetRuntimeElementLayout): WidgetRuntimeRenderableElement => ({
      node: { ...item.element, position: item.position },
      renderSize: item.renderSize,
      renderContext: runtimeRenderContextByElementId.value.get(item.element.id) ?? runtimeState.value.renderContext
    })
  )
);
/** 运行态根节点样式。 */
const rootStyle = computed<CSSProperties>(() => ({
  height: `${scaledHeight.value}px`
}));
/** 运行态舞台裁剪容器样式。 */
const stageViewportStyle = computed<CSSProperties>(() => ({
  height: `${scaledHeight.value}px`
}));
/** 运行态内容舞台样式。 */
const stageStyle = computed<CSSProperties>(() => ({
  width: `${runtimeLayout.value.contentSize.width}px`,
  height: `${runtimeLayout.value.contentSize.height}px`,
  transform: `scale(${runtimeScale.value})`
}));

/**
 * 忽略运行态节点指针事件。
 */
function ignoreNodeEvent(): void {
  return undefined;
}

/**
 * 忽略运行态右键菜单事件。
 */
function ignoreContextMenu(): void {
  return undefined;
}

/**
 * 将脚本执行结果先提交到本地运行态快照。
 * @param state - 脚本执行后的运行态快照
 */
function commitLocalRuntimeState(state: WidgetRuntimeState): void {
  localRuntimeState.value = state;
}

/**
 * 判断当前 Widget mounted 是否已经触发过。
 * @returns mounted 是否已触发
 */
function hasTriggeredMounted(): boolean {
  return runtimeState.value.renderContext.isMounted === true;
}

/**
 * 开始接收一次脚本执行的实时 patch。
 * @returns patch 执行 ID
 */
function beginPatchExecution(): string {
  const executionId = nanoid();

  activePatchExecutionId = executionId;
  patchPreviewRuntimeState.value = null;

  return executionId;
}

/**
 * 清理指定脚本执行的实时 patch 预览。
 * @param executionId - patch 执行 ID
 */
function clearPatchPreview(executionId: string): void {
  if (executionId !== activePatchExecutionId) return;

  patchPreviewRuntimeState.value = null;
  activePatchExecutionId = null;
}

/**
 * 提交脚本执行中的实时 patch。
 * @param executionId - patch 执行 ID
 * @param patches - patch 列表
 */
function commitRuntimePatches(executionId: string, patches: WidgetRuntimePatch[]): void {
  if (executionId !== activePatchExecutionId) return;
  if (!patches.length) return;

  // 第一个 preview 从当前可见状态开始；后续 preview 在上一版 preview 上继续叠加。
  // runtimeState.value 在没有 preview 时只会回落到 localRuntimeState 或 propsRuntimeState。
  const baseState = patchPreviewRuntimeState.value ?? runtimeState.value;

  patchPreviewRuntimeState.value = applyWidgetRuntimePatchesToState(baseState, patches);
}

/**
 * 把小组件脚本日志写入应用日志文件，带 [widget] 前缀以便在「设置 → 日志」区分来源。
 * @param level - 日志级别，对齐 logger.info/warn/error
 * @param args - 原始参数数组，会被序列化为单行字符串
 */
async function handleWidgetLogger(level: 'info' | 'warn' | 'error', args: unknown[]): Promise<void> {
  const message = `[widget] ${formatWidgetLogArgs(args)}`;
  await logger[level](message);
}

/**
 * 把小组件脚本 console 调用转发到主线程 DevTools，使对象可在控制台展开。
 * 沙箱执行栈销毁后 Worker 上下文对象无法回溯，故把 args 克隆到主线程再输出。
 * @param level - console 级别
 * @param args - 原始参数数组（已被沙箱 clone）
 */
function handleWidgetConsole(level: 'log' | 'info' | 'warn' | 'error' | 'debug', args: unknown[]): void {
  console[level](...args);
}

/**
 * 从脚本执行结果中提取运行态快照。
 * @param result - 脚本执行结果
 * @returns 可写回宿主的运行态快照
 */
function createStateFromRuntimeResult(result: WidgetRuntimeFinishResult): WidgetRuntimeState {
  return {
    value: result.state.value,
    renderContext: result.state.renderContext
  };
}

/**
 * 根据脚本执行结果创建运行态变化事件。
 * @param reason - 运行态变化来源
 * @param result - 脚本执行结果
 * @returns 运行态变化事件
 */
function createRuntimeChange(reason: WidgetRuntimeChange['reason'], result: WidgetRuntimeFinishResult): WidgetRuntimeChange {
  const state = createStateFromRuntimeResult(result);

  return {
    reason,
    value: state.value,
    renderContext: state.renderContext,
    ...(result.sendMessage ? { sendMessage: result.sendMessage } : {})
  };
}

/**
 * 提交运行态变化并通知宿主。
 * @param reason - 运行态变化来源
 * @param result - 脚本执行结果
 */
async function emitRuntimeChange(reason: WidgetRuntimeChange['reason'], result: WidgetRuntimeFinishResult): Promise<void> {
  const change = createRuntimeChange(reason, result);

  patchPreviewRuntimeState.value = null;
  activePatchExecutionId = null;
  commitLocalRuntimeState(createStateFromRuntimeResult(result));
  emit('change', change);
  await props.commitRuntimeChange?.(change);
}

/**
 * 处理脚本执行失败。
 * @param executionId - patch 执行 ID
 * @param error - 脚本执行错误
 */
function handleRuntimeFailure(executionId: string, error: unknown): void {
  runtimeFailed.value = true;
  clearPatchPreview(executionId);
  console.error('[widget] 运行态脚本执行失败', error);
}

/**
 * 将运行态任务追加到串行队列。
 * @param task - 待运行的异步任务
 */
function enqueueRuntimeTask(task: () => Promise<void>): void {
  const queuedTask = runtimeTaskQueue.then(task, task);

  runtimeTaskQueue = queuedTask.catch((): undefined => undefined);
}

/**
 * 初始化运行态 mounted 生命周期。
 */
async function initWidgetRuntime(): Promise<void> {
  if (mountedInitialized.value || runtimeFailed.value) return;
  if (hasTriggeredMounted()) {
    mountedInitialized.value = true;
    return;
  }

  const currentState = runtimeState.value;
  mountedInitialized.value = true;

  const executionId = beginPatchExecution();
  try {
    const result = await mountWidgetRuntime(currentState, {
      http: widgetHttpClient,
      onPatch: (patches): void => commitRuntimePatches(executionId, patches),
      onLogger: handleWidgetLogger,
      onConsole: handleWidgetConsole
    });
    if (result.state === currentState && !result.sendMessage) {
      clearPatchPreview(executionId);
      return;
    }

    await emitRuntimeChange('mount', result);
  } catch (error: unknown) {
    handleRuntimeFailure(executionId, error);
  }
}

/**
 * 运行元素声明的交互表达式并上报变化。
 * @param interactionCode - 元素交互表达式
 */
async function runRuntimeInteraction(interactionCode: string): Promise<void> {
  if (!mountedInitialized.value || runtimeFinished.value || runtimeFailed.value) return;
  if (!interactionCode.trim()) return;

  const currentState = runtimeState.value;
  const executionId = beginPatchExecution();
  try {
    const result = await createWidgetRuntimeInstance(currentState, {
      http: widgetHttpClient,
      onPatch: (patches): void => commitRuntimePatches(executionId, patches),
      onLogger: handleWidgetLogger,
      onConsole: handleWidgetConsole
    }).runInteraction(interactionCode);
    runtimeFinished.value = true;
    if (result.state === currentState && !result.sendMessage) {
      clearPatchPreview(executionId);
      return;
    }

    await emitRuntimeChange('interaction', result);
  } catch (error: unknown) {
    handleRuntimeFailure(executionId, error);
  }
}

/** 运行态控制器，供元素运行自身交互表达式。 */
const widgetRuntimeController: WidgetRuntimeController = {
  runInteraction(interactionCode: string): void {
    enqueueRuntimeTask((): Promise<void> => runRuntimeInteraction(interactionCode));
  }
};
/** 运行态控制器响应式包装。 */
const providedRuntime = computed<WidgetRuntimeController>(() => widgetRuntimeController);

provideWidgetRuntime(providedRuntime);

onMounted((): void => {
  enqueueRuntimeTask(initWidgetRuntime);
});

/** 内容布局变化后重新同步宿主宽度，避免异步内容用首帧异常宽度计算高度。 */
watch(
  () => [runtimeLayout.value.contentSize.width, runtimeLayout.value.contentSize.height, runtimeLayout.value.elements.length] as const,
  (): void => {
    scheduleViewportSizeSyncFromRoot();
  },
  { flush: 'post', immediate: true }
);
</script>

<style lang="less" scoped>
.b-widget-runtime {
  position: relative;
  width: 100%;
  min-height: 0;
  overflow: hidden;
}

.b-widget-runtime__stage-viewport {
  position: relative;
  width: 100%;
  overflow: hidden;
}

.b-widget-runtime__stage {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
}

.b-widget-runtime :deep(.b-widget-node) {
  cursor: default;
}
</style>
