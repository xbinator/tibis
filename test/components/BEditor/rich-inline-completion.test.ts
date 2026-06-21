/**
 * @file rich-inline-completion.test.ts
 * @description Rich inline completion adapter tests.
 * @vitest-environment jsdom
 */
import { nextTick } from 'vue';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { describe, expect, it, vi } from 'vitest';
import { RichInlineCompletion, createRichInlineCompletionAdapter, richInlineCompletionPluginKey } from '@/components/BEditor/extensions/richInlineCompletion';
import { useInlineCompletion } from '@/components/BEditor/hooks/useInlineCompletion';

/**
 * 在 Rich 编辑器文档中定位指定文本的 ProseMirror 位置。
 * @param editor - 当前 Rich 编辑器
 * @param text - 需要定位的文本片段
 * @param offset - 命中文本内部偏移
 * @returns ProseMirror 绝对位置
 */
function findTextPosition(editor: Editor, text: string, offset = 0): number {
  let position: number | null = null;
  editor.state.doc.descendants((node, pos): boolean | void => {
    if (position !== null || !node.isText || !node.text) {
      return;
    }

    const index = node.text.indexOf(text);
    if (index >= 0) {
      position = pos + index + offset;
      return false;
    }
  });

  if (position === null) {
    throw new Error(`TEXT_POSITION_NOT_FOUND:${text}`);
  }

  return position;
}

describe('rich inline completion adapter', (): void => {
  it('renders and clears ghost text through plugin state', (): void => {
    const editor = new Editor({
      content: 'hello',
      extensions: [StarterKit, RichInlineCompletion]
    });
    const adapter = createRichInlineCompletionAdapter(editor, () => true);

    adapter.showGhost(' world', {
      requestId: 'r1',
      docVersion: adapter.getDocVersion(),
      cursorPosition: { absolutePosition: editor.state.selection.from }
    });

    expect(richInlineCompletionPluginKey.getState(editor.state)?.text).toBe(' world');
    adapter.hideGhost();
    expect(richInlineCompletionPluginKey.getState(editor.state)?.text).toBe('');
    editor.destroy();
  });

  it('accepts ghost text at the current cursor', async (): Promise<void> => {
    const editor = new Editor({
      content: 'hello',
      extensions: [StarterKit, RichInlineCompletion]
    });
    const adapter = createRichInlineCompletionAdapter(editor, () => true);

    editor.commands.setTextSelection(6);
    await adapter.acceptGhostText(' world');

    expect(editor.getText()).toContain('hello world');
    editor.destroy();
  });

  it('accepts ghost text as plain text without parsing markdown syntax', async (): Promise<void> => {
    const editor = new Editor({
      content: 'hello',
      extensions: [StarterKit, RichInlineCompletion]
    });
    const adapter = createRichInlineCompletionAdapter(editor, () => true);

    editor.commands.setTextSelection(6);
    await adapter.acceptGhostText(' **bold**');

    expect(editor.getText()).toBe('hello **bold**');
    editor.destroy();
  });

  it('accepts only a single inline line without inserting model newlines', async (): Promise<void> => {
    const editor = new Editor({
      content: 'hello',
      extensions: [StarterKit, RichInlineCompletion]
    });
    const adapter = createRichInlineCompletionAdapter(editor, () => true);

    editor.commands.setTextSelection(6);
    await adapter.acceptGhostText(' world\nnext line');

    expect(editor.getText({ blockSeparator: '\n' })).toBe('hello world');
    editor.destroy();
  });

  it('preserves previous rich editor undo history after accepting ghost text', async (): Promise<void> => {
    const editor = new Editor({
      content: 'hello',
      extensions: [StarterKit, RichInlineCompletion]
    });
    const adapter = createRichInlineCompletionAdapter(editor, () => true);

    editor.commands.setTextSelection(6);
    editor.commands.insertContent(' user');
    adapter.showGhost(' ai', {
      requestId: 'r1',
      docVersion: adapter.getDocVersion(),
      cursorPosition: { absolutePosition: editor.state.selection.from }
    });
    adapter.hideGhost();
    await adapter.acceptGhostText(' ai');

    expect(editor.getText()).toBe('hello user ai');

    editor.commands.undo();
    expect(editor.getText()).toBe('hello user');

    editor.commands.undo();
    expect(editor.getText()).toBe('hello');
    editor.destroy();
  });

  it('emits user interaction callbacks', (): void => {
    const editor = new Editor({
      content: 'hello',
      extensions: [StarterKit, RichInlineCompletion]
    });
    const adapter = createRichInlineCompletionAdapter(editor, () => true);
    const callback = vi.fn();
    const cleanup = adapter.onUserInteraction(callback);

    editor.commands.insertContent('!');
    expect(callback).toHaveBeenCalledWith('input');
    cleanup();
    editor.destroy();
  });

  it('does not emit input callbacks for rich editor undo transactions', (): void => {
    const editor = new Editor({
      content: 'hello',
      extensions: [StarterKit, RichInlineCompletion]
    });
    const adapter = createRichInlineCompletionAdapter(editor, () => true);
    const callback = vi.fn();
    const cleanup = adapter.onUserInteraction(callback);

    editor.commands.setTextSelection(6);
    editor.commands.insertContent('!');
    expect(callback).toHaveBeenCalledWith('input');

    callback.mockClear();
    editor.commands.undo();

    expect(callback.mock.calls.map(([type]) => type)).not.toContain('input');
    cleanup();
    editor.destroy();
  });

  it('does not emit input callbacks for rich editor deletion transactions', (): void => {
    const editor = new Editor({
      content: 'hello',
      extensions: [StarterKit, RichInlineCompletion]
    });
    const adapter = createRichInlineCompletionAdapter(editor, () => true);
    const callback = vi.fn();
    const cleanup = adapter.onUserInteraction(callback);

    editor.commands.deleteRange({ from: 5, to: 6 });

    expect(editor.getText()).toBe('hell');
    expect(callback.mock.calls.map(([type]) => type)).not.toContain('input');
    cleanup();
    editor.destroy();
  });

  it('does not emit input callbacks for rich editor mark-only transactions', (): void => {
    const editor = new Editor({
      content: 'hello',
      extensions: [StarterKit, RichInlineCompletion]
    });
    const adapter = createRichInlineCompletionAdapter(editor, () => true);
    const callback = vi.fn();
    const cleanup = adapter.onUserInteraction(callback);

    editor.commands.setTextSelection({ from: 1, to: 6 });
    editor.commands.toggleBold();

    expect(editor.getText()).toBe('hello');
    expect(callback.mock.calls.map(([type]) => type)).not.toContain('input');
    cleanup();
    editor.destroy();
  });

  it('does not emit input callbacks for rich editor equal-length replacements', (): void => {
    const editor = new Editor({
      content: 'hello',
      extensions: [StarterKit, RichInlineCompletion]
    });
    const adapter = createRichInlineCompletionAdapter(editor, () => true);
    const callback = vi.fn();
    const cleanup = adapter.onUserInteraction(callback);

    editor.commands.setTextSelection({ from: 1, to: 6 });
    editor.commands.insertContent('world');

    expect(editor.getText()).toBe('world');
    expect(callback.mock.calls.map(([type]) => type)).not.toContain('input');
    cleanup();
    editor.destroy();
  });

  it('increments rich document version for equal-length replacements', (): void => {
    const editor = new Editor({
      content: 'hello',
      extensions: [StarterKit, RichInlineCompletion]
    });
    const adapter = createRichInlineCompletionAdapter(editor, () => true);
    const beforeVersion = adapter.getDocVersion();

    editor.commands.setTextSelection({ from: 1, to: 6 });
    editor.commands.insertContent('world');

    expect(adapter.getDocVersion()).toBeGreaterThan(beforeVersion);
    editor.destroy();
  });

  it('emits document change callbacks for rich equal-length replacements without triggering input', (): void => {
    const editor = new Editor({
      content: 'hello',
      extensions: [StarterKit, RichInlineCompletion]
    });
    const adapter = createRichInlineCompletionAdapter(editor, () => true);
    const callback = vi.fn();
    const cleanup = adapter.onUserInteraction(callback);

    editor.commands.setTextSelection({ from: 1, to: 6 });
    callback.mockClear();
    editor.commands.insertContent('world');

    expect(callback).toHaveBeenCalledWith('documentChange');
    expect(callback.mock.calls.map(([type]) => type)).not.toContain('input');
    cleanup();
    editor.destroy();
  });

  it('captures Tab before editor key handlers when ghost text is visible', (): void => {
    const editor = new Editor({
      content: 'hello',
      extensions: [StarterKit, RichInlineCompletion]
    });
    const adapter = createRichInlineCompletionAdapter(editor, () => true);
    const callback = vi.fn();
    const editorTabHandler = vi.fn((event: KeyboardEvent): void => {
      event.preventDefault();
      event.stopImmediatePropagation();
    });

    editor.view.dom.addEventListener('keydown', editorTabHandler);
    const cleanup = adapter.onUserInteraction(callback);
    adapter.showGhost(' world', {
      requestId: 'r1',
      docVersion: adapter.getDocVersion(),
      cursorPosition: { absolutePosition: editor.state.selection.from }
    });

    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    editor.view.dom.dispatchEvent(event);

    expect(callback).toHaveBeenCalledWith('accept');
    expect(event.defaultPrevented).toBe(true);
    expect(editorTabHandler).not.toHaveBeenCalled();
    cleanup();
    editor.destroy();
  });

  it('builds rich prompts with a text snapshot cursor instead of a markdown offset', async (): Promise<void> => {
    vi.useFakeTimers();
    const editor = new Editor({
      content: '<h2>Title</h2><p>hello <strong>world</strong></p>',
      extensions: [StarterKit, RichInlineCompletion]
    });
    const adapter = createRichInlineCompletionAdapter(
      editor,
      () => true,
      () => `# Title\n\nhello ${editor.getText().includes('!') ? '!' : ''}**world**`
    );
    const invokeCompletion = vi.fn(async (_prompt: string): Promise<string> => ' again');

    editor.commands.setTextSelection(findTextPosition(editor, 'world'));
    useInlineCompletion({
      adapter,
      editorState: () => ({ content: editor.getText(), name: 'note.md', path: null, id: 'note-1', ext: 'md' }),
      invokeCompletion,
      debounceMs: 10,
      timeoutMs: 1000
    });
    editor.commands.insertContent('!');
    await vi.advanceTimersByTimeAsync(10);
    await nextTick();

    expect(invokeCompletion).toHaveBeenCalledOnce();
    const prompt = invokeCompletion.mock.calls[0]?.[0] ?? '';
    expect(prompt).toContain('## Current heading path\nTitle');
    expect(prompt).toContain('## Text before cursor\nTitle\nhello !<cursor>');
    expect(prompt).toContain('## Text after cursor\nworld');
    expect(prompt).not.toContain('!**world**');
    editor.destroy();
    vi.useRealTimers();
  });

  it('cleans up safely after the editor view is unmounted', (): void => {
    const editor = new Editor({
      content: 'hello',
      extensions: [StarterKit, RichInlineCompletion]
    });
    const adapter = createRichInlineCompletionAdapter(editor, () => true);
    const cleanup = adapter.onUserInteraction(vi.fn());

    editor.unmount();

    expect(() => cleanup()).not.toThrow();
    expect(() => adapter.destroy()).not.toThrow();
    editor.destroy();
  });
});
