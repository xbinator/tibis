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
import type {
  WidgetRenderContext,
  WidgetRuntimeChange,
  WidgetRuntimeDataPatch,
  WidgetRuntimeLifecycle,
  WidgetRuntimeState,
  WidgetRuntimeStatus
} from 'types/widget';
import type { CSSProperties } from 'vue';
import { computed, onMounted, shallowRef, watch } from 'vue';
import { isEqual } from 'lodash-es';
import { logger } from '@/shared/logger';
import { createNamespace } from '@/utils/namespace';
import { provideRenderContext } from './hooks/useRenderContext';
import { useViewportSize } from './hooks/useViewportSize';
import { provideWidgetRuntime, type WidgetRuntimeController } from './hooks/useWidgetRuntime';
import WidgetNode from './renderers/WidgetNode.vue';
import { createWidgetLoopRenderElements, type WidgetLoopRenderContext, type WidgetLoopRenderElement } from './utils/widgetLoop';
import { createWidgetHttpClient, createWidgetRuntimeInstance, initWidgetMountState, type WidgetRuntimeFinishResult } from './utils/widgetRuntime';
import { applyWidgetRuntimeDataPatchesToState } from './utils/widgetRuntime/dataPatch';
import { createWidgetRuntimeLayoutFromRenderElements, type WidgetRuntimeElementLayout } from './utils/widgetRuntime/layout';
import { formatWidgetLogArgs } from './utils/widgetRuntime/logger';

defineOptions({ name: 'BWidgetRuntime' });

/**
 * 运行态Widget视图入参。
 */
interface Props {
  /** Widget模板值 */
  value: WidgetData;
  /** 运行态渲染上下文 */
  renderContext: WidgetRenderContext;
  /** 是否启用运行态脚本执行 */
  runtimeEnabled?: boolean;
  /** 当前运行态状态 */
  status?: WidgetRuntimeStatus;
  /** 当前运行态生命周期记录 */
  lifecycle?: WidgetRuntimeLifecycle;
  /** 运行态控制器，供元素自行调用JS 脚本 methods */
  runtime?: WidgetRuntimeController;
  /** 内容留白 */
  padding?: number;
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

const props = withDefaults(defineProps<Props>(), {
  lifecycle: () => ({}),
  padding: 16,
  runtime: undefined,
  runtimeEnabled: false,
  status: 'created'
});

const emit = defineEmits<{
  /** 运行态脚本执行完成后的状态变化 */
  change: [change: WidgetRuntimeChange];
}>();

const [name, bem] = createNamespace('widget-runtime');
const { viewportSize } = useViewportSize('rootRef');
/** 最多保留的待宿主回写运行态数量。 */
const MAX_PENDING_RUNTIME_STATE_COUNT = 20;
/** 小组件脚本托管 HTTP 客户端。 */
const widgetHttpClient = createWidgetHttpClient();
/** 脚本执行中的实时 patch 预览状态，不进入宿主持久化确认队列。 */
const patchPreviewRuntimeState = shallowRef<WidgetRuntimeState | null>(null);
/** 运行态本地快照，用于衔接宿主 props 回写前的连续交互。 */
const localRuntimeState = shallowRef<WidgetRuntimeState | null>(null);
/** 已发出但宿主 props 可能尚未回写的运行态快照。 */
const pendingRuntimeStates = shallowRef<WidgetRuntimeState[]>([]);
/** 串行运行态脚本任务，避免并发交互读取同一个旧快照。 */
let runtimeTaskQueue: Promise<void> = Promise.resolve();
/** 实时 patch 执行序号。 */
let runtimePatchExecutionSeq = 0;
/** 当前允许接收 patch 的执行 ID。 */
let activePatchExecutionId: string | null = null;

/** 来自宿主 props 的运行态状态快照。 */
const propsRuntimeState = computed<WidgetRuntimeState>(() => ({
  value: props.value,
  status: props.status,
  lifecycle: props.lifecycle,
  renderContext: props.renderContext
}));
/** 当前有效运行态状态快照。 */
const runtimeState = computed<WidgetRuntimeState>(() => patchPreviewRuntimeState.value ?? localRuntimeState.value ?? propsRuntimeState.value);
/** 运行态渲染上下文响应式包装。 */
const providedRenderContext = computed<WidgetRenderContext | undefined>(() => runtimeState.value.renderContext);

provideRenderContext(providedRenderContext);

/** 循环展开后的运行态渲染元素。 */
const runtimeRenderElements = computed<WidgetLoopRenderElement[]>(() =>
  createWidgetLoopRenderElements(runtimeState.value.value.elements, runtimeState.value.renderContext)
);
/** 运行态渲染元素上下文索引。 */
const runtimeRenderContextByElementId = computed<Map<string, WidgetLoopRenderContext>>(
  () => new Map(runtimeRenderElements.value.map((item: WidgetLoopRenderElement): [string, WidgetLoopRenderContext] => [item.element.id, item.renderContext]))
);
/** 当前运行态内容布局。 */
const runtimeLayout = computed(() => createWidgetRuntimeLayoutFromRenderElements(runtimeRenderElements.value, props.padding));
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
 * 判断两个运行态快照是否表示同一版宿主状态。
 * @param left - 左侧运行态快照
 * @param right - 右侧运行态快照
 * @returns 两个快照内容一致时返回 true
 */
function isSameRuntimeState(left: WidgetRuntimeState, right: WidgetRuntimeState): boolean {
  return isEqual(left, right);
}

/**
 * 记录已上报但宿主尚未确认的运行态快照。
 * @param state - 已上报的运行态快照
 */
function rememberPendingRuntimeState(state: WidgetRuntimeState): void {
  pendingRuntimeStates.value = [...pendingRuntimeStates.value, state].slice(-MAX_PENDING_RUNTIME_STATE_COUNT);
}

/**
 * 将脚本执行结果先提交到本地运行态快照。
 * @param state - 脚本执行后的运行态快照
 */
function commitLocalRuntimeState(state: WidgetRuntimeState): void {
  localRuntimeState.value = state;
  rememberPendingRuntimeState(state);
}

/**
 * 创建一次脚本执行的实时 patch ID。
 * @returns patch 执行 ID
 */
function createPatchExecutionId(): string {
  runtimePatchExecutionSeq += 1;
  return `widget-runtime-patch-${runtimePatchExecutionSeq}`;
}

/**
 * 开始接收一次脚本执行的实时 patch。
 * @returns patch 执行 ID
 */
function beginPatchExecution(): string {
  const executionId = createPatchExecutionId();

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
 * 提交脚本执行中的实时 data patch。
 * @param executionId - patch 执行 ID
 * @param patches - data patch 列表
 */
function commitRuntimeDataPatches(executionId: string, patches: WidgetRuntimeDataPatch[]): void {
  if (executionId !== activePatchExecutionId) return;
  if (!patches.length) return;

  // 第一个 preview 从当前可见状态开始；后续 preview 在上一版 preview 上继续叠加。
  // runtimeState.value 在没有 preview 时只会回落到 localRuntimeState 或 propsRuntimeState。
  const baseState = patchPreviewRuntimeState.value ?? runtimeState.value;

  patchPreviewRuntimeState.value = applyWidgetRuntimeDataPatchesToState(baseState, patches);
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
    status: result.state.status,
    lifecycle: result.state.lifecycle,
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
    status: state.status,
    lifecycle: state.lifecycle,
    renderContext: state.renderContext,
    ...(result.sendMessage ? { sendMessage: result.sendMessage } : {})
  };
}

/**
 * 提交运行态变化并通知宿主。
 * @param reason - 运行态变化来源
 * @param result - 脚本执行结果
 */
function emitRuntimeChange(reason: WidgetRuntimeChange['reason'], result: WidgetRuntimeFinishResult): void {
  const change = createRuntimeChange(reason, result);

  patchPreviewRuntimeState.value = null;
  activePatchExecutionId = null;
  commitLocalRuntimeState(createStateFromRuntimeResult(result));
  emit('change', change);
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
  if (!props.runtimeEnabled) return;

  const currentState = runtimeState.value;
  const executionId = beginPatchExecution();
  const nextState = await initWidgetMountState(currentState, {
    http: widgetHttpClient,
    onDataPatch: (patches): void => commitRuntimeDataPatches(executionId, patches),
    onLogger: handleWidgetLogger,
    onConsole: handleWidgetConsole
  });
  if (nextState === currentState) {
    clearPatchPreview(executionId);
    return;
  }

  emitRuntimeChange('mount', { state: nextState });
}

/**
 * 运行元素声明的交互表达式并上报变化。
 * @param interactionCode - 元素交互表达式
 */
async function runRuntimeInteraction(interactionCode: string): Promise<void> {
  if (!props.runtimeEnabled) return;

  const currentState = runtimeState.value;
  const executionId = beginPatchExecution();
  const result = await createWidgetRuntimeInstance(currentState, {
    http: widgetHttpClient,
    onDataPatch: (patches): void => commitRuntimeDataPatches(executionId, patches),
    onLogger: handleWidgetLogger,
    onConsole: handleWidgetConsole
  }).runInteraction(interactionCode);
  if (result.state === currentState && !result.sendMessage) {
    clearPatchPreview(executionId);
    return;
  }

  emitRuntimeChange('interaction', result);
}

/** 运行态控制器，供元素运行自身交互表达式。 */
const widgetRuntimeController: WidgetRuntimeController = {
  runInteraction(interactionCode: string): void {
    enqueueRuntimeTask((): Promise<void> => runRuntimeInteraction(interactionCode));
  }
};
/** 运行态控制器响应式包装。 */
const providedRuntime = computed<WidgetRuntimeController | undefined>(() => props.runtime ?? (props.runtimeEnabled ? widgetRuntimeController : undefined));

provideWidgetRuntime(providedRuntime);

/**
 * 使用宿主 props 回写状态清理本地运行态快照。
 * @param nextState - 宿主 props 最新运行态快照
 */
function syncLocalRuntimeStateFromProps(nextState: WidgetRuntimeState): void {
  if (!props.runtimeEnabled) {
    patchPreviewRuntimeState.value = null;
    activePatchExecutionId = null;
    localRuntimeState.value = null;
    pendingRuntimeStates.value = [];
    return;
  }

  if (!localRuntimeState.value) return;

  const matchedIndex = pendingRuntimeStates.value.findIndex((state): boolean => isSameRuntimeState(state, nextState));
  if (matchedIndex >= 0) {
    pendingRuntimeStates.value = pendingRuntimeStates.value.slice(matchedIndex + 1);

    if (pendingRuntimeStates.value.length === 0 && isSameRuntimeState(localRuntimeState.value, nextState)) {
      localRuntimeState.value = null;
    }

    return;
  }

  if (!pendingRuntimeStates.value.length) {
    localRuntimeState.value = null;
  }
}

onMounted((): void => {
  enqueueRuntimeTask(initWidgetRuntime);
});

watch(
  () => [props.runtimeEnabled, props.status, props.lifecycle.mountedAt] as const,
  ([runtimeEnabled]): void => {
    if (!runtimeEnabled) return;

    enqueueRuntimeTask(initWidgetRuntime);
  }
);

watch(propsRuntimeState, (nextState): void => {
  syncLocalRuntimeStateFromProps(nextState);
});
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
