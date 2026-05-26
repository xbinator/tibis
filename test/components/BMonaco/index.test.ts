/**
 * @file index.test.ts
 * @description BMonaco 基础交互与协议兼容测试。
 */
/* @vitest-environment jsdom */

import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { EditorSelection } from '@/components/BEditor/types';
import BMonaco from '@/components/BMonaco/index.vue';
import type { MonacoEditorHandle } from '@/components/BMonaco/utils/createMonaco';

const setThemeMock = vi.fn();

const mockMonacoModule = {
  editor: {
    setTheme: setThemeMock
  },
  Range: class MockRange {
    startLineNumber: number;

    startColumn: number;

    endLineNumber: number;

    endColumn: number;

    constructor(startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number) {
      this.startLineNumber = startLineNumber;
      this.startColumn = startColumn;
      this.endLineNumber = endLineNumber;
      this.endColumn = endColumn;
    }
  }
};

let currentValue = '{\n  "name": "demo"\n}';
let selectionRange: EditorSelection = {
  from: 0,
  to: 4,
  text: '{\n  '
};
const updateOptionsMock = vi.fn();
const focusMock = vi.fn();
const disposeMock = vi.fn();
const setValueMock = vi.fn((value: string): void => {
  currentValue = value;
});

const editorInstanceMock = {
  createDecorationsCollection: vi.fn(() => ({
    set: vi.fn(),
    clear: vi.fn()
  })),
  getSelection: vi.fn(() => ({
    isEmpty: (): boolean => selectionRange.from === selectionRange.to,
    startLineNumber: 1,
    startColumn: 1,
    endLineNumber: 1,
    endColumn: 5
  })),
  setSelection: vi.fn(),
  revealRangeInCenter: vi.fn(),
  setPosition: vi.fn(),
  revealPositionInCenter: vi.fn(),
  focus: focusMock,
  pushUndoStop: vi.fn(),
  executeEdits: vi.fn(),
  trigger: vi.fn()
};

const modelChangeCallbacks: Array<() => void> = [];

const modelMock = {
  getValue: vi.fn(() => currentValue),
  setValue: setValueMock,
  getOffsetAt: vi.fn(({ column }: { lineNumber: number; column: number }) => column - 1),
  getValueInRange: vi.fn(() => selectionRange.text),
  getLineCount: vi.fn(() => 3),
  getLineMaxColumn: vi.fn(() => 10),
  findMatches: vi.fn(() => []),
  onDidChangeContent: vi.fn((callback: () => void) => {
    modelChangeCallbacks.push(callback);
    return {
      dispose: vi.fn()
    };
  })
};

const editorHandleMock: MonacoEditorHandle = {
  getValue: () => currentValue,
  setValue: setValueMock,
  updateOptions: updateOptionsMock,
  focus: focusMock,
  getEditor: () => editorInstanceMock as never,
  getModel: () => modelMock as never,
  dispose: disposeMock
};

vi.mock('monaco-editor/esm/vs/editor/editor.api', () => mockMonacoModule);
vi.mock('@/components/BMonaco/utils/createMonacoEditor', () => ({
  createMonacoEditor: vi.fn(async () => editorHandleMock)
}));

describe('BMonaco', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      })
    });
    setActivePinia(createPinia());
    currentValue = '{\n  "name": "demo"\n}';
    selectionRange = {
      from: 0,
      to: 4,
      text: '{\n  '
    };
    updateOptionsMock.mockClear();
    focusMock.mockClear();
    disposeMock.mockClear();
    setValueMock.mockClear();
    editorInstanceMock.executeEdits.mockClear();
    editorInstanceMock.trigger.mockClear();
    editorInstanceMock.setSelection.mockClear();
    editorInstanceMock.revealRangeInCenter.mockClear();
    setThemeMock.mockClear();
    modelChangeCallbacks.length = 0;
  });

  it('exposes editor methods and initializes Monaco with the current json content', async () => {
    const wrapper = mount(BMonaco, {
      props: {
        value: currentValue,
        language: 'json',
        editable: true,
        editorState: {
          id: 'json-1',
          name: 'config',
          ext: 'json',
          content: currentValue,
          path: null
        }
      },
      global: {
        plugins: [createPinia()]
      }
    });

    await Promise.resolve();

    expect(typeof wrapper.vm.focusEditor).toBe('function');
    wrapper.vm.focusEditor();
    expect(focusMock).toHaveBeenCalledTimes(1);
  });

  it('updates readOnly option when editable changes', async () => {
    const wrapper = mount(BMonaco, {
      props: {
        value: currentValue,
        language: 'json',
        editable: true,
        editorState: {
          id: 'json-2',
          name: 'config',
          ext: 'json',
          content: currentValue,
          path: null
        }
      },
      global: {
        plugins: [createPinia()]
      }
    });

    await Promise.resolve();
    await wrapper.setProps({ editable: false });

    expect(updateOptionsMock).toHaveBeenCalledWith({ readOnly: true });
  });

  it('replaces the document through the exposed controller API', async () => {
    const wrapper = mount(BMonaco, {
      props: {
        value: currentValue,
        language: 'json',
        editable: true,
        editorState: {
          id: 'json-3',
          name: 'config',
          ext: 'json',
          content: currentValue,
          path: null
        }
      },
      global: {
        plugins: [createPinia()]
      }
    });

    await Promise.resolve();
    await wrapper.vm.replaceDocument('{"updated":true}');

    expect(setValueMock).toHaveBeenCalledWith('{"updated":true}');
    expect(wrapper.emitted('update:value')?.at(-1)).toEqual(['{"updated":true}']);
  });

  it('disposes Monaco resources on unmount', async () => {
    const wrapper = mount(BMonaco, {
      props: {
        value: currentValue,
        language: 'json',
        editable: true,
        editorState: {
          id: 'json-4',
          name: 'config',
          ext: 'json',
          content: currentValue,
          path: null
        }
      },
      global: {
        plugins: [createPinia()]
      }
    });

    await Promise.resolve();
    wrapper.unmount();

    expect(disposeMock).toHaveBeenCalledTimes(1);
  });
});
