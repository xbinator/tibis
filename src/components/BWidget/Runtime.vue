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
import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue';
import { nanoid } from 'nanoid';
import { logger } from '@/shared/logger';
import { createNamespace } from '@/utils/namespace';
import { provideRenderContext } from './hooks/useRenderContext';
import { useRuntimeLayout } from './hooks/useRuntimeLayout';
import { useViewportSize } from './hooks/useViewportSize';
import { provideWidgetRuntime, type WidgetRuntimeController } from './hooks/useWidgetRuntime';
import WidgetNode from './renderers/WidgetNode.vue';
import { createWidgetLoopRenderElements, type WidgetLoopRenderContext, type WidgetLoopRenderElement } from './utils/widgetLoop';
import {
  createWidgetHttpClient,
  createWidgetRuntimeSession,
  type WidgetRuntimeChange,
  type WidgetRuntimeRunResult,
  type WidgetRuntimeSession,
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
/** 当前运行态是否执行失败。 */
const runtimeFailed = shallowRef<boolean>(false);
/** 串行运行态脚本任务，避免并发交互读取同一个旧快照。 */
let runtimeTaskQueue: Promise<void> = Promise.resolve();
/** 当前运行态组件是否已经卸载。 */
let runtimeUnmounted = false;
/** 当前允许接收 patch 的执行 ID。 */
let activePatchExecutionId: string | null = null;
/** 当前组件显示期复用的 Widget 运行态 session。 */
let runtimeSession: WidgetRuntimeSession | null = null;
/** 脚本切换后是否需要忽略旧 renderContext.isMounted 快照。 */
let shouldRunMountedForScriptChange = false;
/** 当前脚本版本，用于丢弃脚本切换前的异步结果。 */
let runtimeScriptVersion = 0;

/**
 * 创建运行态脚本身份。
 * @param value - Widget 数据
 * @returns 脚本身份
 */
function createRuntimeScriptIdentity(value: WidgetData): string {
  const { execute } = value;

  return `${execute?.enabled === false ? 'disabled' : 'enabled'}:${execute?.code ?? ''}`;
}

/**
 * 读取自适应循环列数可用的运行态右边界。
 * @param value - Widget 数据
 * @returns 右边界坐标；未配置页面宽度时返回 undefined
 */
function readRuntimeAutoColumnsRightX(value: WidgetData): number | undefined {
  const { width } = value.metadata;

  return typeof width === 'number' && Number.isFinite(width) && width > 0 ? width : undefined;
}

/** 来自宿主 props 的运行态状态快照。 */
const propsRuntimeState = computed<WidgetRuntimeState>(() => ({
  value: props.value,
  renderContext: props.renderContext
}));
/** 当前运行态脚本身份。 */
const runtimeScriptIdentity = computed<string>(() => createRuntimeScriptIdentity(props.value));
/** 当前有效运行态状态快照。 */
const runtimeState = computed<WidgetRuntimeState>(() => {
  const localState = patchPreviewRuntimeState.value ?? localRuntimeState.value;
  if (!localState) return propsRuntimeState.value;

  // 脚本数据使用本地连续快照，外部配置与输入输出始终以最新 props 为准。
  return {
    value: props.value,
    renderContext: {
      ...localState.renderContext,
      input: props.renderContext.input,
      output: props.renderContext.output
    }
  };
});
/** 运行态渲染上下文响应式包装。 */
const providedRenderContext = computed<WidgetRenderContext | undefined>(() => runtimeState.value.renderContext);

provideRenderContext(providedRenderContext, { mode: 'runtime' });

/** 当前运行态是否允许继续渲染节点。 */
const shouldRenderRuntimeElements = computed<boolean>(() => !runtimeFailed.value);
/** 循环展开后的运行态渲染元素。 */
const runtimeRenderElements = computed<WidgetLoopRenderElement[]>(() =>
  shouldRenderRuntimeElements.value
    ? createWidgetLoopRenderElements(runtimeState.value.value.elements, runtimeState.value.renderContext, {
        autoColumnsRightX: readRuntimeAutoColumnsRightX(runtimeState.value.value)
      })
    : []
);
/** 运行态渲染元素上下文索引。 */
const runtimeRenderContextByElementId = computed<Map<string, WidgetLoopRenderContext>>(
  () => new Map(runtimeRenderElements.value.map((item: WidgetLoopRenderElement): [string, WidgetLoopRenderContext] => [item.element.id, item.renderContext]))
);
/** 当前运行态内容布局。 */
const runtimeLayout = computed(() => createWidgetRuntimeLayoutFromRenderElements(runtimeRenderElements.value, 0));
/** 当前运行态展示布局。 */
const { runtimeDisplayLayout } = useRuntimeLayout({
  widgetData: computed<WidgetData>(() => runtimeState.value.value),
  contentSize: computed<WidgetSize>(() => runtimeLayout.value.contentSize),
  hasRenderableElements: computed<boolean>(() => Boolean(runtimeLayout.value.elements.length)),
  viewportSize
});
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
const rootStyle = computed<CSSProperties>(() => {
  const style: CSSProperties = {
    height: `${runtimeDisplayLayout.value.height}px`
  };

  if (runtimeDisplayLayout.value.width !== undefined) {
    style.width = `${runtimeDisplayLayout.value.width}px`;
    style.maxWidth = '100%';
  }

  return style;
});
/** 运行态舞台裁剪容器样式。 */
const stageViewportStyle = computed<CSSProperties>(() => {
  const style: CSSProperties = {
    height: `${runtimeDisplayLayout.value.height}px`
  };

  if (runtimeDisplayLayout.value.width !== undefined) {
    style.width = `${runtimeDisplayLayout.value.width}px`;
  }

  return style;
});
/** 运行态内容舞台样式。 */
const stageStyle = computed<CSSProperties>(() => ({
  top: `${runtimeDisplayLayout.value.stageOffset.y}px`,
  left: `${runtimeDisplayLayout.value.stageOffset.x}px`,
  width: `${runtimeLayout.value.contentSize.width}px`,
  height: `${runtimeLayout.value.contentSize.height}px`,
  transform: `scale(${runtimeDisplayLayout.value.scale})`
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
  return !shouldRunMountedForScriptChange && runtimeState.value.renderContext.isMounted === true;
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
 * 读取或创建当前组件显示期 Widget 运行态 session。
 * @param state - session 初始运行态状态
 * @returns Widget 运行态 session
 */
function getRuntimeSession(state: WidgetRuntimeState): WidgetRuntimeSession {
  if (runtimeUnmounted) throw new Error('小组件运行态组件已卸载');

  if (runtimeSession) {
    runtimeSession.updateState(state);
    return runtimeSession;
  }

  runtimeSession = createWidgetRuntimeSession(state, {
    http: widgetHttpClient,
    onPatch: (patches: WidgetRuntimePatch[]): void => {
      if (!activePatchExecutionId) return;
      commitRuntimePatches(activePatchExecutionId, patches);
    },
    onLogger: handleWidgetLogger,
    onConsole: handleWidgetConsole
  });

  return runtimeSession;
}

/**
 * 销毁当前 Widget 运行态 session。
 */
function disposeRuntimeSession(): void {
  runtimeSession?.dispose();
  runtimeSession = null;
}

/**
 * 从脚本执行结果中提取运行态快照。
 * @param result - 脚本执行结果
 * @returns 可写回宿主的运行态快照
 */
function createStateFromRuntimeResult(result: WidgetRuntimeRunResult): WidgetRuntimeState {
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
function createRuntimeChange(reason: WidgetRuntimeChange['reason'], result: WidgetRuntimeRunResult): WidgetRuntimeChange {
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
async function emitRuntimeChange(reason: WidgetRuntimeChange['reason'], result: WidgetRuntimeRunResult): Promise<void> {
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
 * @param scriptVersion - 脚本执行开始时的版本
 * @param error - 脚本执行错误
 */
function handleRuntimeFailure(executionId: string, scriptVersion: number, error: unknown): void {
  if (runtimeUnmounted) {
    clearPatchPreview(executionId);
    return;
  }

  if (scriptVersion !== runtimeScriptVersion) {
    clearPatchPreview(executionId);
    return;
  }

  runtimeFailed.value = true;
  clearPatchPreview(executionId);
  disposeRuntimeSession();
  console.error('[widget] 运行态脚本执行失败', error);
}

/**
 * 将运行态任务追加到串行队列。
 * @param task - 待运行的异步任务
 */
function enqueueRuntimeTask(task: () => Promise<void>): void {
  /** 卸载后让历史队列自然排空，但不再启动任何运行态任务。 */
  const guardedTask = async (): Promise<void> => {
    if (runtimeUnmounted) return;
    await task();
  };
  const queuedTask = runtimeTaskQueue.then(guardedTask, guardedTask);

  runtimeTaskQueue = queuedTask.catch((): undefined => undefined);
}

/**
 * 初始化运行态 mounted 生命周期。
 */
async function initWidgetRuntime(): Promise<void> {
  if (runtimeUnmounted) return;
  if (mountedInitialized.value || runtimeFailed.value) return;
  if (hasTriggeredMounted()) {
    getRuntimeSession(runtimeState.value);
    mountedInitialized.value = true;
    return;
  }

  const currentState = runtimeState.value;
  const scriptVersion = runtimeScriptVersion;
  mountedInitialized.value = true;

  const executionId = beginPatchExecution();
  try {
    const result = await getRuntimeSession(currentState).mounted();
    if (scriptVersion !== runtimeScriptVersion) {
      clearPatchPreview(executionId);
      return;
    }

    shouldRunMountedForScriptChange = false;
    if (result.state === currentState && !result.sendMessage) {
      clearPatchPreview(executionId);
      return;
    }

    await emitRuntimeChange('mount', result);
  } catch (error: unknown) {
    handleRuntimeFailure(executionId, scriptVersion, error);
  }
}

/**
 * 运行元素声明的交互表达式并上报变化。
 * @param interactionCode - 元素交互表达式
 */
async function runRuntimeInteraction(interactionCode: string): Promise<void> {
  if (runtimeUnmounted) return;
  if (!mountedInitialized.value || runtimeFailed.value) return;
  if (!interactionCode.trim()) return;

  const currentState = runtimeState.value;
  const scriptVersion = runtimeScriptVersion;
  const executionId = beginPatchExecution();
  try {
    const result = await getRuntimeSession(currentState).runInteraction(interactionCode);
    if (scriptVersion !== runtimeScriptVersion) {
      clearPatchPreview(executionId);
      return;
    }

    if (result.state === currentState && !result.sendMessage) {
      clearPatchPreview(executionId);
      return;
    }

    await emitRuntimeChange('interaction', result);
  } catch (error: unknown) {
    handleRuntimeFailure(executionId, scriptVersion, error);
  }
}

/**
 * 运行 Widget 实例上的公开方法并上报变化。
 * @param methodName - 方法名
 * @param args - 方法参数
 */
async function runRuntimeMethod(methodName: string, args: unknown[]): Promise<void> {
  if (runtimeUnmounted) return;
  if (!mountedInitialized.value || runtimeFailed.value) return;
  if (!methodName.trim()) return;

  const currentState = runtimeState.value;
  const scriptVersion = runtimeScriptVersion;
  const executionId = beginPatchExecution();
  try {
    const result = await getRuntimeSession(currentState).run(methodName, ...args);
    if (scriptVersion !== runtimeScriptVersion) {
      clearPatchPreview(executionId);
      return;
    }

    if (result.state === currentState && !result.sendMessage) {
      clearPatchPreview(executionId);
      return;
    }

    await emitRuntimeChange('interaction', result);
  } catch (error: unknown) {
    handleRuntimeFailure(executionId, scriptVersion, error);
  }
}

/** 运行态控制器，供元素运行自身交互或方法事件。 */
const widgetRuntimeController: WidgetRuntimeController = {
  run(methodName: string, ...args: unknown[]): void {
    enqueueRuntimeTask((): Promise<void> => runRuntimeMethod(methodName, args));
  },
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

watch(runtimeScriptIdentity, (): void => {
  runtimeScriptVersion += 1;
  disposeRuntimeSession();
  localRuntimeState.value = null;
  patchPreviewRuntimeState.value = null;
  activePatchExecutionId = null;
  mountedInitialized.value = false;
  runtimeFailed.value = false;
  shouldRunMountedForScriptChange = true;
  enqueueRuntimeTask(initWidgetRuntime);
});

onBeforeUnmount((): void => {
  runtimeUnmounted = true;
  runtimeScriptVersion += 1;
  patchPreviewRuntimeState.value = null;
  activePatchExecutionId = null;
  disposeRuntimeSession();
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
