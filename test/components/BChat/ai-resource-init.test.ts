/**
 * @file ai-resource-init.test.ts
 * @description AI 资源目录监听初始化顺序测试。
 * @vitest-environment jsdom
 */
import { defineComponent, h } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { useSkillInit } from '@/components/BChat/hooks/useSkillInit';
import { useWidgetInit } from '@/components/BChat/hooks/useWidgetInit';

const initOrder = vi.hoisted((): string[] => []);

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
    onSkillChanged: vi.fn((): (() => void) => {
      initOrder.push('listener');
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
    handleSkillChange: vi.fn()
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
    handleWidgetChange: vi.fn()
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
  it('subscribes to change events before asynchronous scans and directory watches', async (): Promise<void> => {
    initOrder.splice(0);
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
});
