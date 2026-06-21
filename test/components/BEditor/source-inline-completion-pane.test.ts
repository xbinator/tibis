/**
 * @file source-inline-completion-pane.test.ts
 * @description Source 编辑器窗格内联补全触发链路测试。
 * @vitest-environment jsdom
 */
import type { VueWrapper } from '@vue/test-utils';
import type { AIInvokeResult, AIRequestOptions } from 'types/ai';
import type { ModelServiceType } from 'types/model';
import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sourceInlineCompletionField } from '@/components/BEditor/extensions/sourceInlineCompletion';
import PaneSourceEditor from '@/components/BEditor/panes/PaneSourceEditor.vue';
import type { AvailableServiceModelConfig } from '@/stores/ai/serviceModel';

/**
 * Source pane 内联补全测试 mock 状态。
 */
const sourcePaneMocks = vi.hoisted(() => ({
  invokeCalls: [] as AIRequestOptions[],
  serviceTypes: [] as ModelServiceType[],
  config: { providerId: 'provider-1', modelId: 'model-1', updatedAt: 1 } as AvailableServiceModelConfig | null,
  result: { text: ' completion' } as AIInvokeResult
}));

vi.mock('@/hooks/useChat', () => ({
  useChat: () => ({
    agent: {
      /**
       * 记录 Source pane 发出的 AI 调用。
       * @param payload - AI 请求载荷
       * @returns AI 调用结果
       */
      invoke: async (payload: AIRequestOptions): AsyncResult<AIInvokeResult, { message: string }> => {
        sourcePaneMocks.invokeCalls.push(payload);
        return [undefined, sourcePaneMocks.result];
      }
    }
  })
}));

vi.mock('@/stores/ai/serviceModel', () => ({
  useServiceModelStore: () => ({
    /**
     * 返回测试用 polish 模型配置。
     * @param serviceType - 服务模型类型
     * @returns 测试配置
     */
    getAvailableServiceConfig: async (serviceType: ModelServiceType): Promise<AvailableServiceModelConfig | null> => {
      sourcePaneMocks.serviceTypes.push(serviceType);
      return sourcePaneMocks.config;
    }
  })
}));

let wrapper: VueWrapper | null = null;

/**
 * 挂载 Source 编辑器窗格。
 * @returns CodeMirror editor view
 */
async function mountSourcePane(): Promise<EditorView> {
  wrapper = mount(PaneSourceEditor, {
    attachTo: document.body,
    props: {
      value: 'hello',
      editorState: {
        content: 'hello',
        name: 'note.md',
        path: null,
        id: 'note-1',
        ext: 'md'
      }
    }
  });

  await flushPromises();

  const editorElement = wrapper.element.querySelector('.cm-editor');
  if (!editorElement) {
    throw new Error('SOURCE_EDITOR_NOT_FOUND');
  }

  const view = EditorView.findFromDOM(editorElement);
  if (!view) {
    throw new Error('SOURCE_EDITOR_VIEW_NOT_FOUND');
  }

  return view;
}

describe('PaneSourceEditor inline completion', (): void => {
  beforeEach((): void => {
    vi.useFakeTimers();
    sourcePaneMocks.invokeCalls.length = 0;
    sourcePaneMocks.serviceTypes.length = 0;
    sourcePaneMocks.config = { providerId: 'provider-1', modelId: 'model-1', updatedAt: 1 };
    sourcePaneMocks.result = { text: ' completion' };
  });

  afterEach((): void => {
    wrapper?.unmount();
    wrapper = null;
    vi.useRealTimers();
  });

  it('invokes the polish model after source pane user input', async (): Promise<void> => {
    const view = await mountSourcePane();

    view.dispatch({
      changes: {
        from: 5,
        insert: '!'
      },
      selection: EditorSelection.cursor(6),
      userEvent: 'input.type'
    });
    await vi.advanceTimersByTimeAsync(700);
    await flushPromises();

    expect(sourcePaneMocks.serviceTypes).toEqual(['polish']);
    expect(sourcePaneMocks.invokeCalls).toEqual([
      expect.objectContaining({
        providerId: 'provider-1',
        modelId: 'model-1',
        temperature: 0.2,
        reasoning: { enabled: false }
      })
    ]);
  });

  it('clears source ghost text and prevents Tab accept when editor becomes readonly', async (): Promise<void> => {
    const view = await mountSourcePane();

    view.dispatch({
      changes: {
        from: 5,
        insert: '!'
      },
      selection: EditorSelection.cursor(6),
      userEvent: 'input.type'
    });
    await vi.advanceTimersByTimeAsync(700);
    await flushPromises();
    expect(view.state.field(sourceInlineCompletionField).text).toBe(' completion');

    await wrapper?.setProps({ editable: false });
    await flushPromises();

    expect(view.state.field(sourceInlineCompletionField).text).toBe('');

    const beforeTab = view.state.doc.toString();
    view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));

    expect(view.state.doc.toString()).toBe(beforeTab);
  });
});
