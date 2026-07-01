/**
 * @file extra-libs.test.ts
 * @description BMonaco 额外类型声明响应式更新测试。
 * @vitest-environment jsdom
 */
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorState } from '@/components/BEditor/types';
import BMonaco from '@/components/BMonaco/index.vue';

const updateExtraLibs = vi.hoisted(() => vi.fn());
const createMonacoEditor = vi.hoisted(() =>
  vi.fn(async () => ({
    getValue: vi.fn(() => ''),
    setValue: vi.fn(),
    updateOptions: vi.fn(),
    updateExtraLibs,
    focus: vi.fn(),
    getEditor: vi.fn(() => ({
      createDecorationsCollection: vi.fn(() => ({
        set: vi.fn(),
        clear: vi.fn()
      })),
      getSelection: vi.fn(() => null),
      getScrollTop: vi.fn(() => 0),
      getScrollLeft: vi.fn(() => 0),
      onDidScrollChange: vi.fn(() => ({ dispose: vi.fn() })),
      setScrollPosition: vi.fn(),
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
  }))
);

vi.mock('@/components/BMonaco/utils/createMonaco', () => ({
  createMonacoEditor,
  ensureTheme: vi.fn(() => 'theme'),
  getMonacoThemeName: vi.fn(() => 'theme')
}));

/**
 * 创建编辑器状态。
 * @returns 编辑器状态
 */
function createEditorState(): EditorState {
  return {
    id: 'monaco-extra-libs-file',
    name: 'extra-libs.ts',
    path: '/workspace/extra-libs.ts',
    ext: 'ts',
    content: ''
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

describe('BMonaco extra libs', (): void => {
  beforeEach((): void => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false }))
    );
  });

  it('updates TypeScript extra libs without recreating the editor', async (): Promise<void> => {
    const wrapper = mount(BMonaco, {
      props: {
        value: '',
        language: 'typescript',
        editorState: createEditorState(),
        extraLibs: [{ content: 'declare const oldValue: string', filePath: 'widget.d.ts' }]
      }
    });

    await flushAsyncSetup();
    await wrapper.setProps({
      extraLibs: [{ content: 'declare const nextValue: string', filePath: 'widget.d.ts' }]
    } as Record<string, unknown>);

    expect(createMonacoEditor).toHaveBeenCalledTimes(1);
    expect(updateExtraLibs).toHaveBeenCalledWith([{ content: 'declare const nextValue: string', filePath: 'widget.d.ts' }]);
  });
});
