/**
 * @file use-bindings.test.ts
 * @description 编辑器视图全局菜单绑定测试，覆盖 KeepAlive 多标签页下的活跃页命令分发。
 * @vitest-environment jsdom
 */
import type { VueWrapper } from '@vue/test-utils';
import type { Ref } from 'vue';
import { defineComponent, h, ref } from 'vue';
import { shallowMount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emitter } from '@/utils/emitter';
import { useBindings } from '@/views/editor/hooks/useBindings';
import type { EditorFile } from '@/views/editor/types';

vi.mock('@/hooks/useClipboard', () => ({
  useClipboard: () => ({
    clipboard: vi.fn()
  })
}));

/**
 * 编辑器命令桩。
 */
interface EditorCommandStub {
  /** 撤销命令桩。 */
  undo: () => void;
  /** 重做命令桩。 */
  redo: () => void;
}

/**
 * 创建测试用文件状态。
 * @param id - 文件唯一 ID
 * @returns 编辑器文件状态
 */
function createFileState(id: string): EditorFile {
  return {
    id,
    name: `${id}.md`,
    path: `/workspace/${id}.md`,
    ext: 'md',
    content: `# ${id}`
  };
}

/**
 * 创建编辑器动作桩。
 * @returns 编辑器动作集合
 */
function createActions(): {
  onSave: () => Promise<void>;
  onSaveAs: () => Promise<void>;
  onRename: () => Promise<void>;
  onDelete: () => Promise<void>;
  onShowInFolder: () => Promise<void>;
  onDuplicate: () => Promise<void>;
} {
  return {
    onSave: vi.fn().mockResolvedValue(undefined),
    onSaveAs: vi.fn().mockResolvedValue(undefined),
    onRename: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn().mockResolvedValue(undefined),
    onShowInFolder: vi.fn().mockResolvedValue(undefined),
    onDuplicate: vi.fn().mockResolvedValue(undefined)
  };
}

/**
 * 挂载一个只注册 useBindings 的轻量组件。
 * @param params - 绑定测试参数
 * @returns Vue Test Utils 包装器
 */
function mountBindings(params: {
  fileId: Ref<string>;
  fileState: Ref<EditorFile>;
  editorInstance: Ref<EditorCommandStub | null>;
  isActive: Ref<boolean>;
}): VueWrapper {
  return shallowMount(
    defineComponent({
      name: 'UseBindingsHarness',
      setup(): () => ReturnType<typeof h> {
        const options = {
          fileState: params.fileState,
          actions: createActions(),
          editorInstance: params.editorInstance,
          isActive: params.isActive
        };

        useBindings(params.fileId, options);

        return (): ReturnType<typeof h> => h('div');
      }
    })
  );
}

describe('useBindings edit commands', () => {
  afterEach((): void => {
    vi.clearAllMocks();
  });

  it('only dispatches undo to the active cached editor tab', (): void => {
    const inactiveUndo = vi.fn();
    const activeUndo = vi.fn();

    const inactiveWrapper = mountBindings({
      fileId: ref('inactive-file'),
      fileState: ref(createFileState('inactive-file')),
      editorInstance: ref({ undo: inactiveUndo, redo: vi.fn() }),
      isActive: ref(false)
    });
    const activeWrapper = mountBindings({
      fileId: ref('active-file'),
      fileState: ref(createFileState('active-file')),
      editorInstance: ref({ undo: activeUndo, redo: vi.fn() }),
      isActive: ref(true)
    });

    emitter.emit('edit:undo');

    expect(inactiveUndo).not.toHaveBeenCalled();
    expect(activeUndo).toHaveBeenCalledTimes(1);

    inactiveWrapper.unmount();
    activeWrapper.unmount();
  });
});
