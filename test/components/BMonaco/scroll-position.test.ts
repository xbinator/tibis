/**
 * @file scroll-position.test.ts
 * @description BMonaco 滚动位置快照测试。
 * @vitest-environment jsdom
 */
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorState } from '@/components/BEditor/types';
import BMonaco from '@/components/BMonaco/index.vue';

let scrollChangeHandler: (() => void) | null = null;
const setScrollPosition = vi.hoisted(() => vi.fn());

/**
 * BMonaco 测试中访问的滚动控制能力。
 */
interface BMonacoScrollController {
  /** 恢复最近一次滚动位置 */
  restoreScrollPosition: () => void;
}

vi.mock('@/components/BMonaco/utils/createMonaco', () => ({
  createMonacoEditor: vi.fn(async () => ({
    getValue: vi.fn(() => ''),
    setValue: vi.fn(),
    updateOptions: vi.fn(),
    focus: vi.fn(),
    getEditor: vi.fn(() => ({
      createDecorationsCollection: vi.fn(() => ({
        set: vi.fn(),
        clear: vi.fn()
      })),
      getSelection: vi.fn(() => null),
      getScrollTop: vi.fn(() => 320),
      getScrollLeft: vi.fn(() => 24),
      onDidScrollChange: vi.fn((handler: () => void) => {
        scrollChangeHandler = handler;
        return { dispose: vi.fn() };
      }),
      setScrollPosition,
      updateOptions: vi.fn(),
      dispose: vi.fn()
    })),
    getModel: vi.fn(() => ({
      onDidChangeContent: vi.fn(() => ({ dispose: vi.fn() })),
      findMatches: vi.fn(() => []),
      getOffsetAt: vi.fn(() => 0),
      getValueInRange: vi.fn(() => ''),
      getLineCount: vi.fn(() => 1),
      getLineMaxColumn: vi.fn(() => 1),
      dispose: vi.fn()
    })),
    dispose: vi.fn()
  })),
  ensureTheme: vi.fn(() => 'theme'),
  getMonacoThemeName: vi.fn(() => 'theme')
}));

/**
 * 创建编辑器状态。
 * @returns 编辑器状态
 */
function createEditorState(): EditorState {
  return {
    id: 'monaco-scroll-file',
    name: 'scroll.json',
    path: '/workspace/scroll.json',
    ext: 'json',
    content: '{}'
  };
}

/**
 * 等待异步初始化完成。
 */
async function flushAsyncSetup(): Promise<void> {
  await nextTick();
  await Promise.resolve();
  await nextTick();
}

describe('BMonaco scroll position', () => {
  beforeEach((): void => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    scrollChangeHandler = null;
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false }))
    );
  });

  it('restores the last Monaco scroll snapshot', async (): Promise<void> => {
    const wrapper = mount(BMonaco, {
      attachTo: document.body,
      props: {
        value: '{}',
        language: 'json',
        editorState: createEditorState()
      }
    });

    await flushAsyncSetup();

    scrollChangeHandler?.();
    (wrapper.vm as unknown as BMonacoScrollController).restoreScrollPosition();

    expect(setScrollPosition).toHaveBeenCalledWith({
      scrollTop: 320,
      scrollLeft: 24
    });
  });
});
