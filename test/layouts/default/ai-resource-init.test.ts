/**
 * @file ai-resource-init.test.ts
 * @description AI 资源目录监听初始化顺序测试。
 * @vitest-environment jsdom
 */
import { defineComponent, h } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSkillInit } from '@/layouts/default/hooks/useSkillInit';
import { useWidgetInit } from '@/layouts/default/hooks/useWidgetInit';

/** Skill 目录变更事件。 */
interface SkillChangedEvent {
  /** 事件类型。 */
  type: string;
  /** 变更文件路径。 */
  filePath: string;
  /** 文件内容。 */
  content?: string;
}

/** Skill 目录变更回调。 */
type SkillChangedCallback = (data: SkillChangedEvent) => void;

const initOrder = vi.hoisted((): string[] => []);
const skillChangedCallbacks = vi.hoisted((): SkillChangedCallback[] => []);
const handleSkillChangeMock = vi.hoisted(() => vi.fn());
const handleWidgetChangeMock = vi.hoisted(() => vi.fn());

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
    onSkillChanged: vi.fn((callback: SkillChangedCallback): (() => void) => {
      initOrder.push('listener');
      skillChangedCallbacks.push(callback);
      return vi.fn();
    }),
    watchDirectory: vi.fn(async (): Promise<void> => {
      initOrder.push('watch');
    }),
    unwatchDirectory: vi.fn(async (): Promise<void> => undefined)
  }
}));

vi.mock('@/stores/ai/skill', () => ({
  useSkillStore: vi.fn(() => ({
    prepareInitialization: vi.fn((): void => {
      initOrder.push('skill-prepare');
    }),
    finishInitialization: vi.fn(),
    init: vi.fn(async (): Promise<void> => {
      initOrder.push('skill-init');
    }),
    handleSkillChange: handleSkillChangeMock
  }))
}));

vi.mock('@/stores/ai/widget', () => ({
  useWidgetStore: vi.fn(() => ({
    prepareInitialization: vi.fn((): void => {
      initOrder.push('widget-prepare');
    }),
    finishInitialization: vi.fn(),
    init: vi.fn(async (): Promise<void> => {
      initOrder.push('widget-init');
    }),
    handleWidgetChange: handleWidgetChangeMock
  }))
}));

/**
 * 创建同时启用 Skill 与 Widget 初始化 hook 的测试组件。
 * @returns Vue 测试组件
 */
function createResourceInitHarness(): ReturnType<typeof defineComponent> {
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
    skillChangedCallbacks.splice(0);
    handleSkillChangeMock.mockClear();
    handleWidgetChangeMock.mockClear();
  });

  it('subscribes to change events before asynchronous scans and directory watches', async (): Promise<void> => {
    const wrapper = mount(createResourceInitHarness());

    await flushPromises();

    expect(initOrder.indexOf('skill-prepare')).toBeGreaterThanOrEqual(0);
    expect(initOrder.indexOf('widget-prepare')).toBeGreaterThanOrEqual(0);
    expect(initOrder.indexOf('skill-prepare')).toBeLessThan(initOrder.indexOf('listener'));
    expect(initOrder.indexOf('widget-prepare')).toBeLessThan(initOrder.indexOf('listener'));
    expect(initOrder.indexOf('listener')).toBeGreaterThanOrEqual(0);
    expect(initOrder.indexOf('listener')).toBeLessThan(initOrder.indexOf('skill-init'));
    expect(initOrder.indexOf('listener')).toBeLessThan(initOrder.indexOf('watch'));
    wrapper.unmount();
  });

  it('ignores Skill changes from temporary installer directories', async (): Promise<void> => {
    const wrapper = mount(createResourceInitHarness());

    await flushPromises();

    const callback = skillChangedCallbacks[0];
    if (!callback) {
      throw new Error('Skill changed callback was not registered');
    }

    callback({
      type: 'add',
      filePath: 'C:\\Users\\test\\.agents\\skills\\.tmp-abcd1234\\SKILL.md',
      content: ['---', 'name: demo', 'description: Demo skill', '---', 'body'].join('\n')
    });
    callback({
      type: 'change',
      filePath: '/Users/test/.agents/skills/.bak-abcd1234/SKILL.md',
      content: ['---', 'name: demo', 'description: Demo skill', '---', 'body'].join('\n')
    });

    expect(handleSkillChangeMock).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('ignores Skill changes from hidden directories under the skills root', async (): Promise<void> => {
    const wrapper = mount(createResourceInitHarness());

    await flushPromises();

    const callback = skillChangedCallbacks[0];
    if (!callback) {
      throw new Error('Skill changed callback was not registered');
    }

    callback({
      type: 'add',
      filePath: '/Users/test/.agents/skills/.draft/SKILL.md',
      content: ['---', 'name: demo', 'description: Demo skill', '---', 'body'].join('\n')
    });

    expect(handleSkillChangeMock).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('ignores Widget changes from hidden directories under the widgets root', async (): Promise<void> => {
    const wrapper = mount(createResourceInitHarness());

    await flushPromises();

    const callback = skillChangedCallbacks[1];
    if (!callback) {
      throw new Error('Widget changed callback was not registered');
    }

    callback({
      type: 'add',
      filePath: '/Users/test/.tibis/widgets/.draft/widget.json',
      content: JSON.stringify({ name: '草稿小组件', description: '草稿' })
    });

    expect(handleWidgetChangeMock).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
