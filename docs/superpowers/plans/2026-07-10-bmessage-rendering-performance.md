# BMessage Rendering Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 优化 `BMessage` 的批量挂载与流式更新性能，同时保留完成态完整 Markdown 体验，并让 `BubblePartThinking` 恢复默认展开的 Markdown 展示。

**Architecture:** 在 `BMessage` 内部增加实例去重的帧预算调度器，把同步解析改为跨帧、可取消的最新快照任务；使用单个节点树组件直接生成普通 Markdown VNode，减少递归 Vue 组件实例；将 lowlight 封装为模块级共享高亮器。公共 Props 与 BChat 调用约定保持不变。

**Tech Stack:** Vue 3.5、TypeScript 5.9、Vitest 4、Vue Test Utils、marked 18、lowlight 3、KaTeX、Mermaid。

---

## 文件结构

- Create: `src/components/BMessage/utils/messageScheduler.ts` — 通用帧预算队列、实例任务替换和取消。
- Create: `src/components/BMessage/components/MessageNodes.tsx` — 单组件 Markdown AST VNode 渲染器。
- Create: `src/components/BMessage/utils/codeHighlight.ts` — 共享 lowlight 实例、语言别名和安全高亮节点转换。
- Modify: `src/components/BMessage/index.vue` — 接入调度器与轻量节点树，维护最新解析快照。
- Modify: `src/components/BMessage/components/CodeBlockNode.vue` — 使用共享高亮 helper，跳过未闭合围栏高亮。
- Delete: `src/components/BMessage/components/BlockNode.vue` — 由 `MessageNodes` 取代。
- Delete: `src/components/BMessage/components/InlineNode.vue` — 由 `MessageNodes` 取代。
- Modify: `src/components/BChat/components/MessageBubble/BubblePartThinking/index.vue` — 恢复 Markdown 展示。
- Create: `test/components/BMessage/render-scheduler.test.ts` — 调度预算、优先级、替换、取消与错误隔离测试。
- Create: `test/components/BMessage/scheduling.test.ts` — `BMessage` 最新快照和卸载取消测试。
- Create: `test/components/BMessage/code-highlighter.test.ts` — lowlight 单例和完整围栏高亮测试。
- Modify: `test/components/BMessage/node-renderer.test.ts` — 异步帧调度和轻量节点树等价测试。
- Modify: `test/components/BMessage/image-viewer.test.ts` — 等待调度帧后再验证图片交互。
- Modify: `test/components/BChat/bubble-part-thinking.test.ts` — 断言完整 Markdown 体验。
- Modify: `changelog/2026-07-10.md` — 将临时纯文本说明替换为 BMessage 核心优化说明。

当前工作区已有未提交改动。除上述文件外不修改其它文件；不执行 `git add` 或 `git commit`，除非用户另行要求。

### Task 1: 帧预算调度器

**Files:**
- Create: `src/components/BMessage/utils/messageScheduler.ts`
- Test: `test/components/BMessage/render-scheduler.test.ts`

- [ ] **Step 1: 写失败测试，定义调度器契约**

创建测试，使用可控的 frame driver 和时钟，不依赖真实耗时：

```ts
/**
 * @file render-scheduler.test.ts
 * @description BMessage 帧预算调度器测试。
 */
import type { FrameCallback, FrameHandle, MessageRenderSchedulerRuntime } from '@/components/BMessage/utils/messageScheduler';
import { describe, expect, it, vi } from 'vitest';
import { createMessageRenderScheduler } from '@/components/BMessage/utils/messageScheduler';

/**
 * 创建可手动推进帧的测试运行时。
 * @returns 测试运行时、帧推进函数和时钟控制函数
 */
function createRuntime(): {
  runtime: MessageRenderSchedulerRuntime;
  flushFrame: () => void;
  setNow: (value: number) => void;
  reportError: ReturnType<typeof vi.fn>;
} {
  let callback: FrameCallback | null = null;
  let now = 0;
  const reportError = vi.fn();

  return {
    runtime: {
      requestFrame(nextCallback: FrameCallback): FrameHandle {
        callback = nextCallback;
        return 1;
      },
      cancelFrame(): void {
        callback = null;
      },
      now: (): number => now,
      reportError
    },
    flushFrame(): void {
      const nextCallback = callback;
      callback = null;
      nextCallback?.();
    },
    setNow(value: number): void {
      now = value;
    },
    reportError
  };
}

describe('createMessageRenderScheduler', (): void => {
  it('replaces a queued task with the latest task for the same token', (): void => {
    const { runtime, flushFrame } = createRuntime();
    const scheduler = createMessageRenderScheduler({ runtime, budgetMs: 6 });
    const token = Symbol('message');
    const first = vi.fn();
    const latest = vi.fn();

    scheduler.enqueue({ token, priority: 'normal', run: first });
    scheduler.enqueue({ token, priority: 'high', run: latest });
    flushFrame();

    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledOnce();
  });

  it('runs high priority tasks first and yields after the frame budget', (): void => {
    const { runtime, flushFrame, setNow } = createRuntime();
    const scheduler = createMessageRenderScheduler({ runtime, budgetMs: 6 });
    const calls: string[] = [];

    scheduler.enqueue({ token: Symbol('normal'), priority: 'normal', run: (): void => calls.push('normal') });
    scheduler.enqueue({
      token: Symbol('high-one'),
      priority: 'high',
      run: (): void => {
        calls.push('high-one');
        setNow(7);
      }
    });
    scheduler.enqueue({ token: Symbol('high-two'), priority: 'high', run: (): void => calls.push('high-two') });

    flushFrame();
    expect(calls).toEqual(['high-one']);

    setNow(0);
    flushFrame();
    expect(calls).toEqual(['high-one', 'high-two', 'normal']);
  });

  it('cancels queued work and isolates task errors', (): void => {
    const { runtime, flushFrame, reportError } = createRuntime();
    const scheduler = createMessageRenderScheduler({ runtime, budgetMs: 6 });
    const cancelledToken = Symbol('cancelled');
    const cancelled = vi.fn();
    const afterError = vi.fn();
    const error = new Error('parse failed');

    scheduler.enqueue({ token: cancelledToken, priority: 'normal', run: cancelled });
    scheduler.cancel(cancelledToken);
    scheduler.enqueue({ token: Symbol('error'), priority: 'high', run: (): never => { throw error; } });
    scheduler.enqueue({ token: Symbol('after'), priority: 'high', run: afterError });
    flushFrame();

    expect(cancelled).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledWith(error);
    expect(afterError).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `pnpm test test/components/BMessage/render-scheduler.test.ts`

Expected: FAIL，提示无法解析 `@/components/BMessage/utils/messageScheduler`。

- [ ] **Step 3: 实现最小帧预算调度器**

创建 `messageScheduler.ts`，保持所有类型显式并为函数添加 JSDoc：

```ts
/**
 * @file messageScheduler.ts
 * @description BMessage 解析任务的实例去重与帧预算调度器。
 */

/** 调度任务优先级。 */
export type MessageRenderPriority = 'high' | 'normal';

/** 帧回调。 */
export type FrameCallback = () => void;

/** 浏览器或定时器返回的帧句柄。 */
export type FrameHandle = number | ReturnType<typeof setTimeout>;

/** 待调度的消息渲染任务。 */
export interface MessageRenderTask {
  /** 组件实例 token。 */
  token: symbol;
  /** 任务优先级。 */
  priority: MessageRenderPriority;
  /** 实际工作。 */
  run: () => void;
}

/** 调度器运行时依赖。 */
export interface MessageRenderSchedulerRuntime {
  /** 请求下一帧。 */
  requestFrame: (callback: FrameCallback) => FrameHandle;
  /** 取消帧。 */
  cancelFrame: (handle: FrameHandle) => void;
  /** 当前高精度时间。 */
  now: () => number;
  /** 上报单任务异常。 */
  reportError: (error: unknown) => void;
}

/** 消息渲染调度器。 */
export interface MessageRenderScheduler {
  /** 入队或替换同 token 任务。 */
  enqueue: (task: MessageRenderTask) => void;
  /** 取消 token 对应任务。 */
  cancel: (token: symbol) => void;
}

/** 创建调度器参数。 */
interface CreateMessageRenderSchedulerOptions {
  /** 可测试运行时。 */
  runtime?: MessageRenderSchedulerRuntime;
  /** 单帧工作预算。 */
  budgetMs?: number;
  /** 单帧最多执行任务数。 */
  maxTasksPerFrame?: number;
}

const DEFAULT_FRAME_BUDGET_MS = 6;
const DEFAULT_MAX_TASKS_PER_FRAME = 4;

/**
 * 创建默认浏览器运行时。
 * @returns 调度器运行时
 */
function createDefaultRuntime(): MessageRenderSchedulerRuntime {
  return {
    requestFrame(callback: FrameCallback): FrameHandle {
      if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(callback);
      return setTimeout(callback, 0);
    },
    cancelFrame(handle: FrameHandle): void {
      if (typeof cancelAnimationFrame === 'function' && typeof handle === 'number') {
        cancelAnimationFrame(handle);
        return;
      }
      clearTimeout(handle as ReturnType<typeof setTimeout>);
    },
    now: (): number => (typeof performance === 'undefined' ? Date.now() : performance.now()),
    reportError(error: unknown): void {
      console.error('[BMessage] render task failed', error);
    }
  };
}

/**
 * 从 Map 头部取出一个任务。
 * @param queue - 任务队列
 * @returns 队首任务
 */
function shiftTask(queue: Map<symbol, MessageRenderTask>): MessageRenderTask | undefined {
  const entry = queue.entries().next().value as [symbol, MessageRenderTask] | undefined;
  if (!entry) return undefined;
  queue.delete(entry[0]);
  return entry[1];
}

/**
 * 创建消息渲染调度器。
 * @param options - 调度配置
 * @returns 调度器
 */
export function createMessageRenderScheduler(options: CreateMessageRenderSchedulerOptions = {}): MessageRenderScheduler {
  const runtime = options.runtime ?? createDefaultRuntime();
  const budgetMs = options.budgetMs ?? DEFAULT_FRAME_BUDGET_MS;
  const maxTasksPerFrame = options.maxTasksPerFrame ?? DEFAULT_MAX_TASKS_PER_FRAME;
  const highQueue = new Map<symbol, MessageRenderTask>();
  const normalQueue = new Map<symbol, MessageRenderTask>();
  let frameHandle: FrameHandle | null = null;

  /** 请求队列刷新。 */
  function scheduleFrame(): void {
    if (frameHandle !== null) return;
    frameHandle = runtime.requestFrame(flushFrame);
  }

  /** 在一帧预算内刷新队列。 */
  function flushFrame(): void {
    frameHandle = null;
    const startedAt = runtime.now();
    let completedCount = 0;
    let task = shiftTask(highQueue) ?? shiftTask(normalQueue);

    while (task) {
      try {
        task.run();
      } catch (error: unknown) {
        runtime.reportError(error);
      }
      completedCount += 1;
      if (completedCount >= maxTasksPerFrame || runtime.now() - startedAt >= budgetMs) break;
      task = shiftTask(highQueue) ?? shiftTask(normalQueue);
    }

    if (highQueue.size > 0 || normalQueue.size > 0) scheduleFrame();
  }

  return {
    enqueue(task: MessageRenderTask): void {
      highQueue.delete(task.token);
      normalQueue.delete(task.token);
      (task.priority === 'high' ? highQueue : normalQueue).set(task.token, task);
      scheduleFrame();
    },
    cancel(token: symbol): void {
      highQueue.delete(token);
      normalQueue.delete(token);
    }
  };
}

/** BMessage 共享渲染调度器。 */
export const messageRenderScheduler = createMessageRenderScheduler();
```

- [ ] **Step 4: 运行调度器测试并确认 GREEN**

Run: `pnpm test test/components/BMessage/render-scheduler.test.ts`

Expected: 3 tests PASS，无未处理异常。

### Task 2: BMessage 接入最新快照调度

**Files:**
- Modify: `src/components/BMessage/index.vue`
- Create: `test/components/BMessage/scheduling.test.ts`
- Modify: `test/components/BMessage/node-renderer.test.ts`
- Modify: `test/components/BMessage/image-viewer.test.ts`

- [ ] **Step 1: 写失败测试，证明挂载和连续更新不会同步重复解析**

创建 `scheduling.test.ts`。mock 调度器只保存每个 token 的最新任务，以便直接验证 BMessage 的接入行为：

```ts
/**
 * @file scheduling.test.ts
 * @description BMessage 解析调度接入测试。
 * @vitest-environment jsdom
 */
import type { MessageRenderTask } from '@/components/BMessage/utils/messageScheduler';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BMessage from '@/components/BMessage/index.vue';

const schedulerMock = vi.hoisted(() => {
  const tasks = new Map<symbol, MessageRenderTask>();
  return {
    tasks,
    enqueue: vi.fn((task: MessageRenderTask): void => {
      tasks.set(task.token, task);
    }),
    cancel: vi.fn((token: symbol): void => {
      tasks.delete(token);
    })
  };
});

const parseMessageNodesMock = vi.hoisted(() => vi.fn((options: { content: string }) => ({
  blocks: options.content ? [{ type: 'paragraph', id: options.content, raw: options.content, children: [{ type: 'text', text: options.content }] }] : [],
  images: []
})));

vi.mock('@/components/BMessage/utils/messageScheduler', () => ({
  messageRenderScheduler: schedulerMock
}));

vi.mock('@/components/BMessage/utils/messageParser', () => ({
  parseMessageNodes: parseMessageNodesMock
}));

vi.mock('@/hooks/useNavigate', () => ({ useNavigate: (): { onLink: () => void } => ({ onLink: vi.fn() }) }));
vi.mock('@/hooks/useImagePreview', () => ({ useImagePreview: (): { previewImage: () => void } => ({ previewImage: vi.fn() }) }));

describe('BMessage scheduling', (): void => {
  beforeEach((): void => {
    schedulerMock.tasks.clear();
    schedulerMock.enqueue.mockClear();
    schedulerMock.cancel.mockClear();
    parseMessageNodesMock.mockClear();
  });

  it('queues parsing instead of parsing synchronously and commits only the latest snapshot', async (): Promise<void> => {
    const wrapper = mount(BMessage, { props: { content: 'first', type: 'markdown' } });
    await wrapper.setProps({ content: 'latest' });

    expect(parseMessageNodesMock).not.toHaveBeenCalled();
    expect(schedulerMock.tasks.size).toBe(1);

    const task = [...schedulerMock.tasks.values()][0];
    task.run();
    await wrapper.vm.$nextTick();

    expect(parseMessageNodesMock).toHaveBeenCalledOnce();
    expect(parseMessageNodesMock).toHaveBeenCalledWith({ content: 'latest', mode: 'markdown', loading: false });
    expect(wrapper.text()).toContain('latest');
  });

  it('queues bulk mounts without synchronously parsing every instance', (): void => {
    const wrappers = Array.from({ length: 20 }, (_, index) =>
      mount(BMessage, { props: { content: `message-${index}`, type: 'markdown' } })
    );

    expect(parseMessageNodesMock).not.toHaveBeenCalled();
    expect(schedulerMock.tasks.size).toBe(20);

    wrappers.forEach((wrapper) => wrapper.unmount());
  });

  it('cancels queued parsing when the component unmounts', (): void => {
    const wrapper = mount(BMessage, { props: { content: 'queued', type: 'markdown' } });
    const token = [...schedulerMock.tasks.keys()][0];

    wrapper.unmount();

    expect(schedulerMock.cancel).toHaveBeenCalledWith(token);
    expect(schedulerMock.tasks.size).toBe(0);
  });

  it('falls back to text nodes when initial markdown parsing fails', async (): Promise<void> => {
    parseMessageNodesMock.mockImplementationOnce((): never => {
      throw new Error('markdown parse failed');
    });
    const wrapper = mount(BMessage, { props: { content: '**raw**', type: 'markdown' } });
    const task = [...schedulerMock.tasks.values()][0];

    task.run();
    await wrapper.vm.$nextTick();

    expect(parseMessageNodesMock).toHaveBeenNthCalledWith(1, { content: '**raw**', mode: 'markdown', loading: false });
    expect(parseMessageNodesMock).toHaveBeenNthCalledWith(2, { content: '**raw**', mode: 'text', loading: false });
    expect(wrapper.text()).toContain('**raw**');
  });
});
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `pnpm test test/components/BMessage/scheduling.test.ts`

Expected: FAIL，`parseMessageNodes` 在 mount 时已同步调用，且调度 mock 未收到任务。

- [ ] **Step 3: 在 BMessage 中接入调度器**

修改 `index.vue`：根元素增加 `ref="rootRef"`，移除实例级 `rafHandle`，引入 `onMounted`、`ref` 和共享调度器。新增快照类型与以下逻辑：

```ts
/** BMessage 解析快照。 */
interface MessageParseSnapshot {
  /** 原始内容。 */
  content: string;
  /** 渲染模式。 */
  mode: MessageNodeRenderMode;
  /** 是否流式。 */
  loading: boolean;
}

const rootRef = ref<HTMLElement | null>(null);
const renderToken = Symbol('b-message-render');
let latestSnapshot: MessageParseSnapshot | null = null;

/**
 * 判断根节点是否处于一个视口高度的预加载范围内。
 * @returns 是否应高优先级渲染
 */
function isNearViewport(): boolean {
  const element = rootRef.value;
  if (!element || typeof window === 'undefined') return false;
  const rect = element.getBoundingClientRect();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  return rect.bottom >= -viewportHeight && rect.top <= viewportHeight * 2;
}

/**
 * 解析最新快照并提交结果。
 * @param snapshot - 入队时的内容快照
 */
function parseSnapshot(snapshot: MessageParseSnapshot): void {
  if (snapshot !== latestSnapshot) return;

  try {
    parsedResult.value = parseMessageNodes({
      content: snapshot.content,
      mode: snapshot.mode,
      loading: snapshot.loading
    });
  } catch {
    if (parsedResult.value.blocks.length > 0) return;
    try {
      parsedResult.value = parseMessageNodes({
        content: snapshot.content,
        mode: 'text',
        loading: snapshot.loading
      });
    } catch {
      parsedResult.value = { blocks: [], images: [] };
    }
  }
}

/** 为当前 Props 创建或替换调度任务。 */
function scheduleRender(): void {
  const snapshot: MessageParseSnapshot = {
    content: props.content,
    mode: props.type,
    loading: props.loading
  };
  latestSnapshot = snapshot;
  messageRenderScheduler.enqueue({
    token: renderToken,
    priority: props.loading || isNearViewport() ? 'high' : 'normal',
    run: (): void => parseSnapshot(snapshot)
  });
}

watch(
  () => [props.content, props.loading, props.type] as const,
  scheduleRender,
  { immediate: true }
);

onMounted(scheduleRender);

onScopeDispose(() => {
  latestSnapshot = null;
  messageRenderScheduler.cancel(renderToken);
});
```

模板根节点改为：

```vue
<div ref="rootRef" :class="bem({ streaming: props.loading, done: !props.loading })" :style="rootStyle">
```

同时从 `./types` 引入 `MessageNodeRenderMode` 类型，确保快照中的 `mode` 不包含 `undefined`。

- [ ] **Step 4: 更新现有组件测试的帧等待方式**

在 `node-renderer.test.ts` 和 `image-viewer.test.ts` 中统一增加：

```ts
/** 等待 BMessage 调度帧和 Vue DOM 更新。 */
async function waitMessageRender(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await nextTick();
}
```

每次 mount 后把仅用于等待首次内容的 `await nextTick()` 替换为 `await waitMessageRender()`；更新 `content` 后也等待 `waitMessageRender()`。保留 Mermaid 和图片异步交互原有的 `flushPromises()`。

- [ ] **Step 5: 运行调度接入与现有 BMessage 测试**

Run: `pnpm test test/components/BMessage/scheduling.test.ts test/components/BMessage/node-renderer.test.ts test/components/BMessage/image-viewer.test.ts`

Expected: 全部 PASS；首次渲染在调度帧后出现，连续更新只解析最新快照。

### Task 3: 轻量 Markdown 节点树

**Files:**
- Create: `src/components/BMessage/components/MessageNodes.tsx`
- Modify: `src/components/BMessage/index.vue`
- Delete: `src/components/BMessage/components/BlockNode.vue`
- Delete: `src/components/BMessage/components/InlineNode.vue`
- Modify: `test/components/BMessage/node-renderer.test.ts`

- [ ] **Step 1: 将组件结构测试改为期望单节点树**

把首个测试改名为 `renders markdown through a single lightweight node tree`，并改写组件断言：

```ts
expect(wrapper.findComponent({ name: 'MessageNodes' }).exists()).toBe(true);
expect(wrapper.findComponent({ name: 'BlockNode' }).exists()).toBe(false);
expect(wrapper.findComponent({ name: 'InlineNode' }).exists()).toBe(false);
expect(wrapper.find('h1').text()).toBe('Title');
expect(wrapper.find('strong').text()).toBe('bold');
expect(wrapper.find('code').text()).toBe('code');
```

纯文本测试中的旧 `BlockNode` 断言同样替换为 `MessageNodes`。

- [ ] **Step 2: 运行结构测试并确认 RED**

Run: `pnpm test test/components/BMessage/node-renderer.test.ts -t "single lightweight node tree"`

Expected: FAIL，当前仍存在 `BlockNode` 和 `InlineNode`。

- [ ] **Step 3: 创建单组件节点树渲染器**

创建 `MessageNodes.tsx`。实现必须覆盖 `BlockNode.vue` 与 `InlineNode.vue` 的全部分支；核心结构如下：

```ts
/**
 * @file MessageNodes.tsx
 * @description 使用单个 Vue 组件将 BMessage AST 渲染为原生 VNode。
 */
import type { BlockNode, InlineNode, ListItemNode, MessageNodeRenderContext, TableCellNode } from '../types';
import type { PropType, VNodeChild } from 'vue';
import { defineComponent, h, inject } from 'vue';
import { createNamespace } from '@/utils/namespace';
import { MESSAGE_NODE_RENDER_CONTEXT_KEY } from '../types';
import CodeBlockNode from './CodeBlockNode.vue';
import ImageNode from './ImageNode.vue';
import MathBlockNode from './MathBlockNode.vue';
import MathNode from './MathNode.vue';

const [, bem] = createNamespace('message');

/** 渲染器组件属性。 */
interface Props {
  /** 顶层块节点。 */
  blocks: BlockNode[];
}

/**
 * 渲染行内节点列表。
 * @param nodes - 行内节点列表
 * @param context - 消息交互上下文
 * @returns VNode 子节点
 */
function renderInlineNodes(nodes: InlineNode[], context: MessageNodeRenderContext | null): VNodeChild[] {
  return nodes.map((node, index): VNodeChild => renderInlineNode(node, index, context));
}

/**
 * 渲染单个行内节点。
 * @param node - 行内节点
 * @param key - 同级稳定位置
 * @param context - 消息交互上下文
 * @returns VNode 子节点
 */
function renderInlineNode(node: InlineNode, key: number, context: MessageNodeRenderContext | null): VNodeChild {
  if (node.type === 'text') return node.text;
  if (node.type === 'strong') return h('strong', { key }, renderInlineNodes(node.children, context));
  if (node.type === 'em') return h('em', { key }, renderInlineNodes(node.children, context));
  if (node.type === 'del') return h('del', { key }, renderInlineNodes(node.children, context));
  if (node.type === 'mark') return h('mark', { key }, renderInlineNodes(node.children, context));
  if (node.type === 'sup') return h('sup', { key }, renderInlineNodes(node.children, context));
  if (node.type === 'sub') return h('sub', { key }, renderInlineNodes(node.children, context));
  if (node.type === 'code') return h('code', { key }, node.text);
  if (node.type === 'math') return h(MathNode, { key, text: node.text });
  if (node.type === 'link') {
    return h('a', { key, href: node.href, title: node.title || undefined, onClick: context?.navigateLink }, renderInlineNodes(node.children, context));
  }
  if (node.type === 'image') return h(ImageNode, { key, node });
  if (node.type === 'break') return h('br', { key });
  if (node.type === 'htmlInline') {
    return h(node.tag, { key, title: node.title }, renderInlineNodes(node.children, context));
  }
  return h('span', { key, class: bem('cursor'), 'aria-hidden': 'true' });
}

/**
 * 渲染列表项。
 * @param item - 列表项
 * @param context - 消息交互上下文
 * @returns 列表项 VNode
 */
function renderListItem(item: ListItemNode, context: MessageNodeRenderContext | null): VNodeChild {
  const children: VNodeChild[] = [];
  if (item.task) children.push(h('input', { type: 'checkbox', disabled: true, checked: item.checked }));
  children.push(...renderBlockNodes(item.children, context));
  return h('li', { key: item.id }, children);
}

/**
 * 渲染表格单元格。
 * @param tag - th 或 td
 * @param cell - 表格单元格
 * @param context - 消息交互上下文
 * @returns 单元格 VNode
 */
function renderTableCell(tag: 'th' | 'td', cell: TableCellNode, context: MessageNodeRenderContext | null): VNodeChild {
  return h(tag, { key: cell.id, style: { textAlign: cell.align || undefined } }, renderInlineNodes(cell.children, context));
}

/**
 * 渲染块节点列表。
 * @param nodes - 块节点列表
 * @param context - 消息交互上下文
 * @returns VNode 子节点
 */
function renderBlockNodes(nodes: BlockNode[], context: MessageNodeRenderContext | null): VNodeChild[] {
  return nodes.map((node): VNodeChild => {
    if (node.type === 'paragraph') return h('p', { key: node.id }, renderInlineNodes(node.children, context));
    if (node.type === 'heading') return h(`h${node.depth}`, { key: node.id }, renderInlineNodes(node.children, context));
    if (node.type === 'list') {
      return h(node.ordered ? 'ol' : 'ul', { key: node.id, start: node.ordered ? node.start || undefined : undefined }, node.items.map((item) => renderListItem(item, context)));
    }
    if (node.type === 'blockquote') return h('blockquote', { key: node.id }, renderBlockNodes(node.children, context));
    if (node.type === 'code') return h(CodeBlockNode, { key: node.id, node });
    if (node.type === 'math') return h(MathBlockNode, { key: node.id, text: node.text });
    if (node.type === 'table') {
      return h('table', { key: node.id }, [
        h('thead', [h('tr', node.header.map((cell) => renderTableCell('th', cell, context)))]),
        h('tbody', node.rows.map((row, rowIndex) => h('tr', { key: rowIndex }, row.map((cell) => renderTableCell('td', cell, context)))))
      ]);
    }
    if (node.type === 'hr') return h('hr', { key: node.id });
    if (node.type === 'component') return h('div', { key: node.id, class: 'b-message__component-placeholder' }, node.componentName);
    return h('span', { key: node.id, class: bem('cursor'), 'aria-hidden': 'true' });
  });
}

export default defineComponent({
  name: 'MessageNodes',
  props: {
    blocks: {
      type: Array as PropType<BlockNode[]>,
      required: true
    }
  },
  setup(props: Props): () => VNodeChild {
    const context = inject(MESSAGE_NODE_RENDER_CONTEXT_KEY, null);
    return () => renderBlockNodes(props.blocks, context);
  }
});
```

- [ ] **Step 4: BMessage 切换到单节点树并删除旧递归组件**

`index.vue` 模板改为：

```vue
<div :class="[bem('container'), props.type === 'text' ? bem('text') : bem('markdown')]">
  <MessageNodes :blocks="parsedResult.blocks" />
</div>
```

删除 `BlockNode` import，新增 `MessageNodes` import，然后删除不再引用的 `BlockNode.vue` 与 `InlineNode.vue`。

- [ ] **Step 5: 运行 BMessage 渲染等价测试**

Run: `pnpm test test/components/BMessage/parser.test.ts test/components/BMessage/node-renderer.test.ts test/components/BMessage/image-viewer.test.ts`

Expected: 全部 PASS；HTML 标签、列表、表格、公式、图片、链接、代码和光标行为不变。

### Task 4: 共享代码高亮器

**Files:**
- Create: `src/components/BMessage/utils/codeHighlight.ts`
- Modify: `src/components/BMessage/components/CodeBlockNode.vue`
- Create: `test/components/BMessage/code-highlighter.test.ts`

- [ ] **Step 1: 写失败测试，定义单例和未闭合围栏行为**

```ts
/**
 * @file code-highlighter.test.ts
 * @description BMessage 共享代码高亮器测试。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const lowlightMocks = vi.hoisted(() => ({
  createLowlight: vi.fn(),
  registered: vi.fn(() => true),
  highlight: vi.fn(() => ({ type: 'root', children: [{ type: 'element', properties: { className: ['hljs-keyword'] }, children: [{ type: 'text', value: 'const' }] }] }))
}));

vi.mock('lowlight', () => ({
  common: {},
  createLowlight: lowlightMocks.createLowlight.mockReturnValue({
    registered: lowlightMocks.registered,
    highlight: lowlightMocks.highlight
  })
}));

describe('highlightMessageCode', (): void => {
  beforeEach((): void => {
    lowlightMocks.highlight.mockClear();
  });

  it('creates one shared lowlight instance and skips incomplete fences', async (): Promise<void> => {
    const { highlightMessageCode } = await import('@/components/BMessage/utils/codeHighlight');

    const incomplete = highlightMessageCode('ts', 'const value = 1', false);
    const complete = highlightMessageCode('ts', 'const value = 1', true);

    expect(lowlightMocks.createLowlight).toHaveBeenCalledOnce();
    expect(lowlightMocks.highlight).toHaveBeenCalledOnce();
    expect(incomplete).toEqual([{ type: 'text', value: 'const value = 1' }]);
    expect(complete[0]).toMatchObject({ type: 'element', className: 'hljs-keyword' });
  });
});
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `pnpm test test/components/BMessage/code-highlighter.test.ts`

Expected: FAIL，提示 `codeHighlight` 模块不存在。

- [ ] **Step 3: 提取共享高亮 helper**

把 `CodeBlockNode.vue` 中的 lowlight 节点类型、语言别名、`textToHighlightNodes`、`getSafeClassName` 和递归转换逻辑移动到 `codeHighlight.ts`。模块顶部只执行一次：

```ts
const lowlight = createLowlight(common);
```

导出稳定接口：

```ts
/** 代码高亮渲染节点。 */
export type CodeHighlightRenderNode = CodeHighlightElementNode | CodeHighlightTextNode;

/**
 * 高亮 BMessage 代码块。
 * @param rawLanguage - Markdown 原始语言
 * @param code - 代码文本
 * @param complete - 围栏是否闭合
 * @returns 安全高亮节点
 */
export function highlightMessageCode(rawLanguage: string, code: string, complete: boolean): CodeHighlightRenderNode[] {
  if (!complete) return textToHighlightNodes(code);
  const language = LANGUAGE_ALIASES[rawLanguage] ?? rawLanguage;
  if (!language || !lowlight.registered(language)) return textToHighlightNodes(code);

  try {
    return lowlightNodeToHighlightNodes(lowlight.highlight(language, code) as LowlightNode);
  } catch {
    return textToHighlightNodes(code);
  }
}
```

语言展示仍由 `CodeBlockNode.vue` 的 `formatDisplayLanguage` 负责，避免 helper 承担 UI 文案。

- [ ] **Step 4: CodeBlockNode 使用共享 helper**

移除 `lowlight` import、实例、语言别名和转换函数。改为：

```ts
import type { CodeHighlightRenderNode } from '../utils/codeHighlight';
import { highlightMessageCode } from '../utils/codeHighlight';

const highlightedNodes = computed<CodeHighlightRenderNode[]>(() =>
  highlightMessageCode(rawLanguage.value, props.node.text, props.node.complete)
);
```

保留 `CodeHighlightNode`、复制、Mermaid 和样式逻辑。

- [ ] **Step 5: 运行高亮和节点渲染测试**

Run: `pnpm test test/components/BMessage/code-highlighter.test.ts test/components/BMessage/node-renderer.test.ts`

Expected: 全部 PASS；未闭合 Mermaid 与普通代码不调用 lowlight，闭合后恢复高亮。

### Task 5: 恢复 thinking Markdown 并记录变更

**Files:**
- Modify: `src/components/BChat/components/MessageBubble/BubblePartThinking/index.vue`
- Modify: `test/components/BChat/bubble-part-thinking.test.ts`
- Modify: `changelog/2026-07-10.md`

- [ ] **Step 1: 将 thinking 测试改为期望完整 Markdown**

````ts
it('renders thinking content with the shared markdown renderer', async (): Promise<void> => {
  const wrapper = mount(BubblePartThinking, {
    props: {
      part: {
        id: 'thinking-part-markdown',
        type: 'thinking',
        thinking: '**bold thinking**\n\n```ts\nconst value = 1\n```'
      }
    },
    global: {
      components: { BMessage },
      stubs: { BIcon: true }
    }
  });

  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await wrapper.vm.$nextTick();

  expect(wrapper.find('strong').text()).toBe('bold thinking');
  expect(wrapper.find('.b-message__code-block').exists()).toBe(true);
  expect(wrapper.find('.hljs-keyword').exists()).toBe(true);
});
````

- [ ] **Step 2: 运行测试并确认 RED**

Run: `pnpm test test/components/BChat/bubble-part-thinking.test.ts`

Expected: FAIL，因为当前 `BubblePartThinking` 使用 `type="text"`。

- [ ] **Step 3: 恢复 Markdown 调用**

```vue
<BMessage :content="part.thinking" type="markdown" />
```

不增加 `defer`、`lazyContent`、thinking 专用调度 Props 或默认折叠逻辑。

- [ ] **Step 4: 更新 changelog**

将现有“推理日志改为轻量纯文本展示”条目替换为：

```markdown
- 优化 BMessage 批量渲染，通过帧预算调度、轻量节点树和共享代码高亮器降低历史消息集中挂载时的主线程阻塞，同时保留思考内容的完整 Markdown 展示。
```

- [ ] **Step 5: 运行 thinking 与 BChat 回归测试**

Run: `pnpm test test/components/BChat/bubble-part-thinking.test.ts test/components/BChat/message-bubble.component.test.ts`

Expected: 全部 PASS，thinking 默认展开且包含 Markdown DOM。

### Task 6: 全量验证与性能回归检查

**Files:**
- Verify only; no new files unless 前述测试暴露真实缺口。

- [ ] **Step 1: 运行 BMessage 与 BChat 目标测试**

Run: `pnpm test test/components/BMessage test/components/BChat/bubble-part-thinking.test.ts test/components/BChat/message-bubble.component.test.ts`

Expected: 全部 PASS，无未处理 Promise、Vue warning 或 Mermaid mock 泄漏。

- [ ] **Step 2: 运行 TypeScript 检查**

Run: `pnpm exec tsc --noEmit`

Expected: exit code 0，无输出。

- [ ] **Step 3: 运行目标 ESLint 检查**

Run:

```bash
pnpm exec eslint src/components/BMessage src/components/BChat/components/MessageBubble/BubblePartThinking/index.vue test/components/BMessage test/components/BChat/bubble-part-thinking.test.ts --ext .vue,.ts
```

Expected: exit code 0；不新增 error。若旧测试文件仍有既有 Prettier warning，记录但不对无关代码执行全文件格式化。

- [ ] **Step 4: 运行目标 Stylelint 检查**

Run:

```bash
pnpm exec stylelint 'src/components/BMessage/**/*.{vue,less,css}' src/components/BChat/components/MessageBubble/BubblePartThinking/index.vue
```

Expected: exit code 0。

- [ ] **Step 5: 检查差异边界和遗留临时方案**

Run: `rg -n "type=\"text\"|lazyContent|lazy-content|thinkingDefaultCollapsed" src/components/BChat/components/MessageBubble/BubblePartThinking src/components/BMessage test/components/BChat/bubble-part-thinking.test.ts -S`

Expected: thinking 组件内不再命中 `type="text"`，不出现 thinking 专用 lazy 或 collapse 优化字段。

Run: `git diff --check`

Expected: exit code 0。

- [ ] **Step 6: 汇总验证结果，不自动提交**

报告目标测试数量、类型检查、lint、stylelint 和剩余既有 warning。保留用户未要求提交的工作树状态，不执行 stage、commit、push 或 PR。

## 实施复审补充

代码审查后在原计划边界内增加以下约束：

- 高优先级队列采用最近晋级任务优先，避免聊天底部内容排在历史消息之后。
- BMessage 使用最近垂直滚动容器作为 IntersectionObserver root，任务进入一个视口高度的预加载区时晋级。
- 单帧除 6ms 预算外增加最多 4 个任务的硬上限，覆盖 Vue DOM patch 不计入解析计时的情况。
- 完成态代码高亮增加最多 100 项的 LRU 缓存，避免后续流式快照重建相同代码块时重复调用 lowlight。
- 补充 stale task、卸载后任务、无 requestAnimationFrame 回退、表格、引用、分割线和组件占位符测试。
