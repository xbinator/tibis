/**
 * @file ai-resource-init.test.ts
 * @description AI 资源目录监听初始化顺序与清理测试。
 * @vitest-environment jsdom
 */
import { defineComponent, h } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSkillInit } from '@/layouts/default/hooks/useSkillInit';
import { useWidgetInit } from '@/layouts/default/hooks/useWidgetInit';
import { storeEvents } from '@/stores/helpers/events';

/**
 * 资源目录变化事件。
 */
interface DirectoryChangedEvent {
  /** 目录事件类型。 */
  type: 'add' | 'unlink';
  /** 被监听的资源根目录。 */
  rootPath: string;
  /** 新增或删除的直接子目录。 */
  dirPath: string;
}

/** 资源目录变化回调。 */
type DirectoryChangedCallback = (event: DirectoryChangedEvent) => void;

/**
 * 可由测试控制完成时机的 Promise。
 */
interface Deferred<T> {
  /** 延迟 Promise。 */
  promise: Promise<T>;
  /** 完成 Promise。 */
  resolve: (value: T) => void;
}

/**
 * 创建可控 Promise。
 * @returns 可控 Promise
 */
function createDeferred<T>(): Deferred<T> {
  let resolvePromise: (value: T) => void = (): void => undefined;
  const promise = new Promise<T>((resolve: (value: T) => void): void => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

const initOrder = vi.hoisted((): string[] => []);
const directoryCallbacks = vi.hoisted((): DirectoryChangedCallback[] => []);
const handleSkillDirectoryMock = vi.hoisted(() => vi.fn());
const handleFileSavedMock = vi.hoisted(() => vi.fn());
const handleWidgetDirectoryMock = vi.hoisted(() => vi.fn());
const skillInitMock = vi.hoisted(() => vi.fn(async (): Promise<void> => {
  initOrder.push('skill-init');
}));
const widgetInitMock = vi.hoisted(() => vi.fn(async (): Promise<void> => {
  initOrder.push('widget-init');
}));
const watchResourceDirectoryMock = vi.hoisted(() => vi.fn(async (rootPath: string): Promise<void> => {
  initOrder.push(rootPath.includes('/.agents/') ? 'skill-watch' : 'widget-watch');
}));
const unwatchResourceDirectoryMock = vi.hoisted(() => vi.fn(async (): Promise<void> => undefined));
const onDirectoryChangedMock = vi.hoisted(() => vi.fn((callback: DirectoryChangedCallback): (() => void) => {
  initOrder.push('listener');
  directoryCallbacks.push(callback);
  return vi.fn();
}));

vi.mock('@/shared/platform', () => ({
  native: {
    getHomeDir: vi.fn(async (): Promise<string> => '/Users/test'),
    readFile: vi.fn(async (): Promise<{ content: string }> => ({ content: '' })),
    readWorkspaceDirectory: vi.fn(async (): Promise<{ entries: [] }> => ({ entries: [] })),
    getPathStatus: vi.fn(
      async (): Promise<{ exists: boolean; isFile: boolean; isDirectory: boolean }> => ({
        exists: true,
        isFile: false,
        isDirectory: true
      })
    ),
    trashFile: vi.fn(async (): Promise<void> => undefined),
    onDirectoryChanged: onDirectoryChangedMock,
    watchResourceDirectory: watchResourceDirectoryMock,
    unwatchResourceDirectory: unwatchResourceDirectoryMock
  }
}));

vi.mock('@/stores/ai/skill', () => ({
  useSkillStore: vi.fn(() => ({
    prepareInitialization: vi.fn((): void => {
      initOrder.push('skill-prepare');
    }),
    finishInitialization: vi.fn(),
    init: skillInitMock,
    handleSkillDirectory: handleSkillDirectoryMock,
    handleFileSaved: handleFileSavedMock
  }))
}));

vi.mock('@/stores/ai/widget', () => ({
  useWidgetStore: vi.fn(() => ({
    prepareInitialization: vi.fn((): void => {
      initOrder.push('widget-prepare');
    }),
    finishInitialization: vi.fn(),
    init: widgetInitMock,
    handleWidgetDirectory: handleWidgetDirectoryMock
  }))
}));

/**
 * 创建仅启用 Skill 初始化 hook 的测试组件。
 * @returns Vue 测试组件
 */
function createSkillHarness(): ReturnType<typeof defineComponent> {
  return defineComponent({
    name: 'SkillInitHarness',
    setup() {
      useSkillInit();
      return (): ReturnType<typeof h> => h('div');
    }
  });
}

/**
 * 创建仅启用 Widget 初始化 hook 的测试组件。
 * @returns Vue 测试组件
 */
function createWidgetHarness(): ReturnType<typeof defineComponent> {
  return defineComponent({
    name: 'WidgetInitHarness',
    setup() {
      useWidgetInit();
      return (): ReturnType<typeof h> => h('div');
    }
  });
}

/**
 * 创建同时启用两个资源初始化 hook 的测试组件。
 * @returns Vue 测试组件
 */
function createResourceHarness(): ReturnType<typeof defineComponent> {
  return defineComponent({
    name: 'AIResourceInitHarness',
    setup() {
      useSkillInit();
      useWidgetInit();
      return (): ReturnType<typeof h> => h('div');
    }
  });
}

describe('AI resource initialization', (): void => {
  beforeEach((): void => {
    initOrder.splice(0);
    directoryCallbacks.splice(0);
    handleSkillDirectoryMock.mockClear();
    handleFileSavedMock.mockClear();
    handleWidgetDirectoryMock.mockClear();
    skillInitMock.mockClear();
    widgetInitMock.mockClear();
    onDirectoryChangedMock.mockClear();
    unwatchResourceDirectoryMock.mockClear();
    watchResourceDirectoryMock.mockReset().mockImplementation(async (rootPath: string): Promise<void> => {
      initOrder.push(rootPath.includes('/.agents/') ? 'skill-watch' : 'widget-watch');
    });
  });

  it('registers the Skill listener and watcher before scanning directories', async (): Promise<void> => {
    const wrapper = mount(createSkillHarness());

    await flushPromises();

    expect(initOrder).toEqual(['skill-prepare', 'listener', 'skill-watch', 'skill-init']);
    expect(watchResourceDirectoryMock).toHaveBeenCalledWith('/Users/test/.agents/skills');
    wrapper.unmount();
  });

  it('registers the Widget listener and watcher before scanning directories', async (): Promise<void> => {
    const wrapper = mount(createWidgetHarness());

    await flushPromises();

    expect(initOrder).toEqual(['widget-prepare', 'listener', 'widget-watch', 'widget-init']);
    expect(watchResourceDirectoryMock).toHaveBeenCalledWith('/Users/test/.tibis/widgets');
    wrapper.unmount();
  });

  it('routes add and unlink events to the matching Store without reading content', async (): Promise<void> => {
    const wrapper = mount(createResourceHarness());
    await flushPromises();

    const events: DirectoryChangedEvent[] = [
      {
        type: 'add',
        rootPath: '/Users/test/.agents/skills',
        dirPath: '/Users/test/.agents/skills/weather'
      },
      {
        type: 'unlink',
        rootPath: '/Users/test/.tibis/widgets',
        dirPath: '/Users/test/.tibis/widgets/weather'
      }
    ];
    for (const event of events) {
      directoryCallbacks.forEach((callback: DirectoryChangedCallback): void => callback(event));
    }

    expect(handleSkillDirectoryMock).toHaveBeenCalledWith('add', '/Users/test/.agents/skills/weather');
    expect(handleWidgetDirectoryMock).toHaveBeenCalledWith('unlink', '/Users/test/.tibis/widgets/weather');
    wrapper.unmount();
  });

  it('routes saved files to the Skill Store until the hook is unmounted', async (): Promise<void> => {
    const wrapper = mount(createSkillHarness());
    await flushPromises();

    storeEvents.emitFileSaved('/Users/test/.agents/skills/weather/SKILL.md', '# saved');

    expect(handleFileSavedMock).toHaveBeenCalledWith('/Users/test/.agents/skills/weather/SKILL.md', '# saved');
    wrapper.unmount();
    storeEvents.emitFileSaved('/Users/test/.agents/skills/weather/SKILL.md', '# newer');
    expect(handleFileSavedMock).toHaveBeenCalledOnce();
  });

  it('unregisters a watcher when unmounted during asynchronous registration', async (): Promise<void> => {
    const deferred = createDeferred<void>();
    watchResourceDirectoryMock.mockImplementationOnce((): Promise<void> => deferred.promise);
    const wrapper = mount(createSkillHarness());
    await vi.waitFor((): void => {
      expect(watchResourceDirectoryMock).toHaveBeenCalledOnce();
    });

    wrapper.unmount();
    deferred.resolve(undefined);
    await flushPromises();

    expect(unwatchResourceDirectoryMock).toHaveBeenCalledOnce();
    expect(unwatchResourceDirectoryMock).toHaveBeenCalledWith('/Users/test/.agents/skills');
    expect(skillInitMock).not.toHaveBeenCalled();
  });
});
