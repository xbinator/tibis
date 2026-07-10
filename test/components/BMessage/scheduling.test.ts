/**
 * @file scheduling.test.ts
 * @description BMessage 解析调度接入测试。
 * @vitest-environment jsdom
 */
import type { VueWrapper } from '@vue/test-utils';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BMessage from '@/components/BMessage/index.vue';
import type { ParseMessageNodesOptions, ParseMessageNodesResult } from '@/components/BMessage/types';
import type { MessageRenderTask } from '@/components/BMessage/utils/messageScheduler';

/**
 * BMessage 组件公开属性类型。
 */
type BMessagePublicProps = InstanceType<typeof BMessage>['$props'];

/**
 * 调度器 mock。
 */
interface SchedulerMock {
  /** 当前每个实例的最新任务。 */
  tasks: Map<symbol, MessageRenderTask>;
  /** 任务入队 mock。 */
  enqueue: ReturnType<typeof vi.fn>;
  /** 任务取消 mock。 */
  cancel: ReturnType<typeof vi.fn>;
}

const schedulerMock = vi.hoisted((): SchedulerMock => {
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

const parseMessageNodesMock = vi.hoisted(() =>
  vi.fn<(options: ParseMessageNodesOptions) => ParseMessageNodesResult>(
    (options: ParseMessageNodesOptions): ParseMessageNodesResult => ({
      blocks: options.content
        ? [
            {
              type: 'paragraph',
              id: options.content,
              raw: options.content,
              children: [{ type: 'text', text: options.content }]
            }
          ]
        : [],
      images: []
    })
  )
);

vi.mock('@/components/BMessage/utils/messageScheduler', () => ({
  messageRenderScheduler: schedulerMock
}));

vi.mock('@/components/BMessage/utils/messageParser', () => ({
  parseMessageNodes: parseMessageNodesMock
}));

vi.mock('@/hooks/useNavigate', () => ({
  useNavigate: (): { onLink: ReturnType<typeof vi.fn> } => ({
    onLink: vi.fn()
  })
}));

vi.mock('@/hooks/useImagePreview', () => ({
  useImagePreview: (): { previewImage: ReturnType<typeof vi.fn> } => ({
    previewImage: vi.fn()
  })
}));

let intersectionCallback: IntersectionObserverCallback | null = null;
let intersectionRoot: Element | Document | null = null;
const observeMock = vi.fn();
const unobserveMock = vi.fn();
const disconnectMock = vi.fn();

/**
 * 可手动触发的 IntersectionObserver 测试替身。
 */
class TestIntersectionObserver {
  /** 观察根节点。 */
  readonly root: Element | Document | null;

  /** 根节点扩展范围。 */
  readonly rootMargin: string;

  /** 观察阈值。 */
  readonly thresholds: readonly number[];

  /**
   * 创建观察器替身。
   * @param callback - 相交回调
   * @param options - 观察配置
   */
  constructor(callback: IntersectionObserverCallback, options: IntersectionObserverInit = {}) {
    intersectionCallback = callback;
    intersectionRoot = options.root ?? null;
    this.root = options.root ?? null;
    this.rootMargin = options.rootMargin ?? '0px';
    this.thresholds = Array.isArray(options.threshold) ? options.threshold : [options.threshold ?? 0];
  }

  /** 停止全部观察。 */
  disconnect(): void {
    disconnectMock();
  }

  /** 开始观察元素。 */
  observe(target: Element): void {
    observeMock(target);
  }

  /** 读取待处理记录。 */
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  /**
   * 停止观察元素。
   * @param target - 目标元素
   */
  unobserve(target: Element): void {
    unobserveMock(target);
  }
}

/**
 * 获取当前唯一待执行任务。
 * @returns 待执行任务
 */
function getOnlyTask(): MessageRenderTask {
  const task = [...schedulerMock.tasks.values()][0];
  expect(task).toBeDefined();
  return task as MessageRenderTask;
}

describe('BMessage scheduling', (): void => {
  beforeEach((): void => {
    schedulerMock.tasks.clear();
    schedulerMock.enqueue.mockClear();
    schedulerMock.cancel.mockClear();
    parseMessageNodesMock.mockClear();
    intersectionCallback = null;
    intersectionRoot = null;
    observeMock.mockClear();
    unobserveMock.mockClear();
    disconnectMock.mockClear();
    vi.stubGlobal('IntersectionObserver', TestIntersectionObserver);
  });

  afterEach((): void => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('queues parsing instead of parsing synchronously and commits only the latest snapshot', async (): Promise<void> => {
    const wrapper = mount(BMessage, { props: { content: 'first', type: 'markdown' } });
    const staleTask = getOnlyTask();
    await wrapper.setProps({ content: 'latest' } as Partial<BMessagePublicProps>);

    expect(parseMessageNodesMock).not.toHaveBeenCalled();
    expect(schedulerMock.tasks.size).toBe(1);

    staleTask.run();
    expect(parseMessageNodesMock).not.toHaveBeenCalled();

    getOnlyTask().run();
    await wrapper.vm.$nextTick();

    expect(parseMessageNodesMock).toHaveBeenCalledOnce();
    expect(parseMessageNodesMock).toHaveBeenCalledWith({ content: 'latest', mode: 'markdown', loading: false });
    expect(wrapper.text()).toContain('latest');
  });

  it('queues bulk mounts without synchronously parsing every instance', (): void => {
    const wrappers: VueWrapper[] = Array.from(
      { length: 20 },
      (_, index: number): VueWrapper => mount(BMessage, { props: { content: `message-${index}`, type: 'markdown' } })
    );

    expect(parseMessageNodesMock).not.toHaveBeenCalled();
    expect(schedulerMock.tasks.size).toBe(20);

    wrappers.forEach((wrapper: VueWrapper): void => wrapper.unmount());
  });

  it('promotes queued work when it enters the nearest scroll container preload area', (): void => {
    const scrollRoot = document.createElement('div');
    scrollRoot.style.overflowY = 'auto';
    document.body.appendChild(scrollRoot);
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getRect(this: HTMLElement): DOMRect {
      return this === scrollRoot ? new DOMRect(0, 0, 200, 100) : new DOMRect(0, 500, 200, 0);
    });
    const wrapper = mount(BMessage, {
      attachTo: scrollRoot,
      props: { content: 'queued', type: 'markdown' }
    });

    expect(intersectionRoot).toBe(scrollRoot);
    expect(getOnlyTask().priority).toBe('normal');

    const callback = intersectionCallback;
    expect(callback).not.toBeNull();
    callback?.([{ isIntersecting: true, target: wrapper.element } as IntersectionObserverEntry], {} as IntersectionObserver);

    expect(getOnlyTask().priority).toBe('high');

    wrapper.unmount();
    rectSpy.mockRestore();
  });

  it('cancels queued parsing when the component unmounts', (): void => {
    const wrapper = mount(BMessage, { props: { content: 'queued', type: 'markdown' } });
    const token = [...schedulerMock.tasks.keys()][0];
    const queuedTask = getOnlyTask();

    wrapper.unmount();
    queuedTask.run();

    expect(schedulerMock.cancel).toHaveBeenCalledWith(token);
    expect(schedulerMock.tasks.size).toBe(0);
    expect(parseMessageNodesMock).not.toHaveBeenCalled();
  });

  it('falls back to text nodes when initial markdown parsing fails', async (): Promise<void> => {
    parseMessageNodesMock.mockImplementationOnce((): never => {
      throw new Error('markdown parse failed');
    });
    const wrapper = mount(BMessage, { props: { content: '**raw**', type: 'markdown' } });

    getOnlyTask().run();
    await wrapper.vm.$nextTick();

    expect(parseMessageNodesMock).toHaveBeenNthCalledWith(1, { content: '**raw**', mode: 'markdown', loading: false });
    expect(parseMessageNodesMock).toHaveBeenNthCalledWith(2, { content: '**raw**', mode: 'text', loading: false });
    expect(wrapper.text()).toContain('**raw**');
  });
});
