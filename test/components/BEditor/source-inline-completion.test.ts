/**
 * @file source-inline-completion.test.ts
 * @description Source inline completion adapter tests.
 * @vitest-environment jsdom
 */
import { nextTick } from 'vue';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { describe, expect, it, vi } from 'vitest';
import {
  createSourceInlineCompletionAdapter,
  createSourceInlineCompletionExtension,
  sourceInlineCompletionField
} from '@/components/BEditor/extensions/sourceInlineCompletion';
import { useInlineCompletion } from '@/components/BEditor/hooks/useInlineCompletion';

/**
 * 创建 Source inline completion 测试 editor。
 * @param doc - 初始文档
 * @returns CodeMirror editor view
 */
function createView(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [createSourceInlineCompletionExtension()]
    })
  });
}

describe('source inline completion adapter', (): void => {
  it('renders and clears ghost text through state field', (): void => {
    const view = createView('hello');
    const adapter = createSourceInlineCompletionAdapter(view, () => true);

    adapter.showGhost(' world', {
      requestId: 'r1',
      docVersion: adapter.getDocVersion(),
      cursorPosition: { absolutePosition: view.state.selection.main.from }
    });

    expect(view.state.field(sourceInlineCompletionField).text).toBe(' world');
    adapter.hideGhost();
    expect(view.state.field(sourceInlineCompletionField).text).toBe('');
    view.destroy();
  });

  it('accepts ghost text at the current cursor', async (): Promise<void> => {
    const view = createView('hello');
    const adapter = createSourceInlineCompletionAdapter(view, () => true);

    view.dispatch({ selection: EditorSelection.cursor(5) });
    await adapter.acceptGhostText(' world');

    expect(view.state.doc.toString()).toBe('hello world');
    expect(view.state.selection.main.from).toBe(11);
    view.destroy();
  });

  it('emits input callbacks when source user input grows the document', (): void => {
    const view = createView('hello');
    const adapter = createSourceInlineCompletionAdapter(view, () => true);
    const callback = vi.fn();
    const cleanup = adapter.onUserInteraction(callback);

    view.dispatch({
      changes: {
        from: 5,
        insert: '!'
      },
      userEvent: 'input.type'
    });

    expect(callback).toHaveBeenCalledWith('input');
    cleanup();
    view.destroy();
  });

  it('emits cursor callbacks when source selection changes without text input', (): void => {
    const view = createView('hello');
    const adapter = createSourceInlineCompletionAdapter(view, () => true);
    const callback = vi.fn();
    const cleanup = adapter.onUserInteraction(callback);

    view.dispatch({
      selection: EditorSelection.cursor(3),
      userEvent: 'select'
    });

    expect(callback).toHaveBeenCalledWith('cursor');
    cleanup();
    view.destroy();
  });

  it('increments source document version for equal-length replacements', (): void => {
    const view = createView('hello');
    const adapter = createSourceInlineCompletionAdapter(view, () => true);
    const beforeVersion = adapter.getDocVersion();

    view.dispatch({
      changes: {
        from: 0,
        to: 5,
        insert: 'world'
      },
      selection: EditorSelection.cursor(5),
      userEvent: 'input.type'
    });

    expect(adapter.getDocVersion()).toBeGreaterThan(beforeVersion);
    view.destroy();
  });

  it('emits document change callbacks for source equal-length replacements without triggering input', (): void => {
    const view = createView('hello');
    const adapter = createSourceInlineCompletionAdapter(view, () => true);
    const callback = vi.fn();
    const cleanup = adapter.onUserInteraction(callback);

    view.dispatch({
      changes: {
        from: 0,
        to: 5,
        insert: 'world'
      },
      selection: EditorSelection.cursor(5),
      userEvent: 'input.type'
    });

    expect(callback).toHaveBeenCalledWith('documentChange');
    expect(callback.mock.calls.map(([type]) => type)).not.toContain('input');
    cleanup();
    view.destroy();
  });

  it('keeps the scheduled source completion after the keyup that follows typing', async (): Promise<void> => {
    vi.useFakeTimers();
    const view = createView('hello');
    const adapter = createSourceInlineCompletionAdapter(view, () => true);
    const invokeCompletion = vi.fn(async (): Promise<string> => ' world');

    useInlineCompletion({
      adapter,
      editorState: () => ({ content: view.state.doc.toString(), name: 'note.md', path: null, id: 'note-1', ext: 'md' }),
      invokeCompletion,
      debounceMs: 10,
      timeoutMs: 1000
    });

    view.dispatch({
      changes: {
        from: 5,
        insert: '!'
      },
      selection: EditorSelection.cursor(6),
      userEvent: 'input.type'
    });
    view.dom.dispatchEvent(new KeyboardEvent('keyup', { key: '!', bubbles: true }));
    await vi.advanceTimersByTimeAsync(10);
    await nextTick();

    expect(invokeCompletion).toHaveBeenCalledOnce();
    expect(view.state.field(sourceInlineCompletionField).text).toBe(' world');
    vi.useRealTimers();
    view.destroy();
  });

  it('drops stale source completion results after equal-length replacement while loading', async (): Promise<void> => {
    vi.useFakeTimers();
    const view = createView('hello');
    const adapter = createSourceInlineCompletionAdapter(view, () => true);
    let resolveCompletion: ((text: string) => void) | null = null;
    const invokeCompletion = vi.fn(
      async (): Promise<string> =>
        new Promise((resolve): void => {
          resolveCompletion = resolve;
        })
    );
    /**
     * 解析当前挂起的补全请求。
     * @param text - 模型返回文本
     */
    function resolvePendingCompletion(text: string): void {
      if (!resolveCompletion) {
        throw new Error('INLINE_COMPLETION_RESOLVER_NOT_READY');
      }

      resolveCompletion(text);
    }

    useInlineCompletion({
      adapter,
      editorState: () => ({ content: view.state.doc.toString(), name: 'note.md', path: null, id: 'note-1', ext: 'md' }),
      invokeCompletion,
      debounceMs: 10,
      timeoutMs: 1000
    });

    view.dispatch({
      changes: {
        from: 5,
        insert: '!'
      },
      selection: EditorSelection.cursor(6),
      userEvent: 'input.type'
    });
    await vi.advanceTimersByTimeAsync(10);
    expect(invokeCompletion).toHaveBeenCalledOnce();

    view.dispatch({
      changes: {
        from: 0,
        to: 6,
        insert: 'world!'
      },
      selection: EditorSelection.cursor(6),
      userEvent: 'input.type'
    });
    resolvePendingCompletion(' stale');
    await vi.advanceTimersByTimeAsync(0);
    await nextTick();

    expect(view.state.field(sourceInlineCompletionField).text).toBe('');
    vi.useRealTimers();
    view.destroy();
  });

  it('does not emit input callbacks for source deletion events', (): void => {
    const view = createView('hello');
    const adapter = createSourceInlineCompletionAdapter(view, () => true);
    const callback = vi.fn();
    const cleanup = adapter.onUserInteraction(callback);

    view.dispatch({
      changes: {
        from: 4,
        to: 5
      },
      userEvent: 'delete.backward'
    });
    view.dom.dispatchEvent(new InputEvent('input', { bubbles: true }));

    expect(view.state.doc.toString()).toBe('hell');
    expect(callback.mock.calls.map(([type]) => type)).not.toContain('input');
    cleanup();
    view.destroy();
  });

  it('does not emit input callbacks for source undo events even when text grows', (): void => {
    const view = createView('hello');
    const adapter = createSourceInlineCompletionAdapter(view, () => true);
    const callback = vi.fn();
    const cleanup = adapter.onUserInteraction(callback);

    view.dispatch({
      changes: {
        from: 5,
        insert: '!'
      },
      userEvent: 'undo'
    });
    view.dom.dispatchEvent(new InputEvent('input', { bubbles: true }));

    expect(view.state.doc.toString()).toBe('hello!');
    expect(callback.mock.calls.map(([type]) => type)).not.toContain('input');
    cleanup();
    view.destroy();
  });

  it('does not emit input callbacks for source equal-length replacements', (): void => {
    const view = createView('hello');
    const adapter = createSourceInlineCompletionAdapter(view, () => true);
    const callback = vi.fn();
    const cleanup = adapter.onUserInteraction(callback);

    view.dispatch({
      changes: {
        from: 0,
        to: 5,
        insert: 'world'
      },
      userEvent: 'input.type'
    });
    view.dom.dispatchEvent(new InputEvent('input', { bubbles: true }));

    expect(view.state.doc.toString()).toBe('world');
    expect(callback.mock.calls.map(([type]) => type)).not.toContain('input');
    cleanup();
    view.destroy();
  });

  it('captures Tab before editor key handlers when ghost text is visible', (): void => {
    const view = createView('hello');
    const adapter = createSourceInlineCompletionAdapter(view, () => true);
    const callback = vi.fn();
    const editorTabHandler = vi.fn((event: KeyboardEvent): void => {
      event.preventDefault();
      event.stopImmediatePropagation();
    });

    view.dom.addEventListener('keydown', editorTabHandler);
    const cleanup = adapter.onUserInteraction(callback);
    adapter.showGhost(' world', {
      requestId: 'r1',
      docVersion: adapter.getDocVersion(),
      cursorPosition: { absolutePosition: view.state.selection.main.from }
    });

    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    view.dom.dispatchEvent(event);

    expect(callback).toHaveBeenCalledWith('accept');
    expect(event.defaultPrevented).toBe(true);
    expect(editorTabHandler).not.toHaveBeenCalled();
    cleanup();
    view.destroy();
  });
});
