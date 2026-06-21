/**
 * @file use-inline-completion.test.ts
 * @description BEditor inline completion state machine tests.
 */
import { nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import type { InlineCompletionAdapter, InlineCompletionUserInteraction } from '@/components/BEditor/adapters/inlineCompletionAdapter';
import { useInlineCompletion } from '@/components/BEditor/hooks/useInlineCompletion';

/**
 * 创建可主动发出交互事件的内联补全 adapter 测试替身。
 * @returns 测试 adapter
 */
function createAdapter(): InlineCompletionAdapter & { emit: (type: InlineCompletionUserInteraction) => void } {
  let callback: ((type: InlineCompletionUserInteraction) => void) | null = null;
  return {
    pane: 'rich',
    isEditable: () => true,
    canTriggerInlineCompletion: () => true,
    getCursorPosition: () => ({ absolutePosition: 5 }),
    getDocVersion: () => 10,
    getDocumentText: () => 'hello world',
    showGhost: vi.fn(),
    hideGhost: vi.fn(),
    acceptGhostText: vi.fn(async (): Promise<void> => undefined),
    onUserInteraction: (handler: (type: InlineCompletionUserInteraction) => void): (() => void) => {
      callback = handler;
      return (): void => {
        callback = null;
      };
    },
    destroy: vi.fn(),
    emit: (type: InlineCompletionUserInteraction): void => callback?.(type)
  };
}

describe('useInlineCompletion', (): void => {
  it('shows ghost text after a valid invoke response', async (): Promise<void> => {
    vi.useFakeTimers();
    const adapter = createAdapter();
    const invoke = vi.fn(async (): Promise<string> => ' completion');
    const completion = useInlineCompletion({
      adapter,
      editorState: () => ({ id: 'a', name: 'note.md', path: null, ext: '.md', content: 'hello world' }),
      invokeCompletion: invoke,
      debounceMs: 10,
      timeoutMs: 1000
    });

    adapter.emit('input');
    await vi.advanceTimersByTimeAsync(10);
    await nextTick();

    expect(invoke).toHaveBeenCalledOnce();
    expect(adapter.showGhost).toHaveBeenCalledWith(' completion', expect.objectContaining({ docVersion: 10 }));
    expect(completion.state.value.status).toBe('showing');
    vi.useRealTimers();
  });

  it('requests completion without an explicit output token budget', async (): Promise<void> => {
    vi.useFakeTimers();
    const adapter = createAdapter();
    const invoke = vi.fn(async (): Promise<string> => ' completion');
    useInlineCompletion({
      adapter,
      editorState: () => ({ id: 'a', name: 'note.md', path: null, ext: '.md', content: 'hello world' }),
      invokeCompletion: invoke,
      debounceMs: 10,
      timeoutMs: 1000
    });

    adapter.emit('input');
    await vi.advanceTimersByTimeAsync(10);

    expect(invoke).toHaveBeenCalledWith(expect.any(String));
    vi.useRealTimers();
  });

  it('keeps pending completion after unchanged cursor noise', async (): Promise<void> => {
    vi.useFakeTimers();
    const adapter = createAdapter();
    const invoke = vi.fn(async (): Promise<string> => ' completion');
    useInlineCompletion({
      adapter,
      editorState: () => ({ id: 'a', name: 'note.md', path: null, ext: '.md', content: 'hello world' }),
      invokeCompletion: invoke,
      debounceMs: 10,
      timeoutMs: 1000
    });

    adapter.emit('input');
    adapter.emit('cursor');
    await vi.advanceTimersByTimeAsync(10);

    expect(invoke).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('cancels pending completion after cursor movement', async (): Promise<void> => {
    vi.useFakeTimers();
    const adapter = createAdapter();
    let cursorPosition = 5;
    adapter.getCursorPosition = (): { absolutePosition: number } => ({ absolutePosition: cursorPosition });
    const invoke = vi.fn(async (): Promise<string> => ' completion');
    useInlineCompletion({
      adapter,
      editorState: () => ({ id: 'a', name: 'note.md', path: null, ext: '.md', content: 'hello world' }),
      invokeCompletion: invoke,
      debounceMs: 10,
      timeoutMs: 1000
    });

    adapter.emit('input');
    cursorPosition = 6;
    adapter.emit('cursor');
    await vi.advanceTimersByTimeAsync(10);

    expect(invoke).not.toHaveBeenCalled();
    expect(adapter.hideGhost).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('cancels stale results after cursor movement while loading', async (): Promise<void> => {
    vi.useFakeTimers();
    const adapter = createAdapter();
    let cursorPosition = 5;
    adapter.getCursorPosition = (): { absolutePosition: number } => ({ absolutePosition: cursorPosition });
    const invoke = vi.fn(
      async (): Promise<string> =>
        new Promise((resolve) => {
          setTimeout(() => resolve(' stale'), 20);
        })
    );
    useInlineCompletion({
      adapter,
      editorState: () => ({ id: 'a', name: 'note.md', path: null, ext: '.md', content: 'hello world' }),
      invokeCompletion: invoke,
      debounceMs: 10,
      timeoutMs: 1000
    });

    adapter.emit('input');
    await vi.advanceTimersByTimeAsync(10);
    cursorPosition = 6;
    adapter.emit('cursor');
    await vi.advanceTimersByTimeAsync(30);

    expect(adapter.showGhost).not.toHaveBeenCalled();
    expect(adapter.hideGhost).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('accepts visible ghost text with a single adapter call', async (): Promise<void> => {
    vi.useFakeTimers();
    const adapter = createAdapter();
    const completion = useInlineCompletion({
      adapter,
      editorState: () => ({ id: 'a', name: 'note.md', path: null, ext: '.md', content: 'hello world' }),
      invokeCompletion: async (): Promise<string> => ' accepted',
      debounceMs: 10,
      timeoutMs: 1000
    });

    adapter.emit('input');
    await vi.advanceTimersByTimeAsync(10);
    await nextTick();
    await completion.accept();

    expect(adapter.acceptGhostText).toHaveBeenCalledWith(' accepted');
    expect(completion.state.value.status).toBe('idle');
    vi.useRealTimers();
  });

  it('resets to idle when accepting ghost text fails', async (): Promise<void> => {
    vi.useFakeTimers();
    const adapter = createAdapter();
    adapter.acceptGhostText = vi.fn(async (): Promise<void> => {
      throw new Error('accept failed');
    });
    const completion = useInlineCompletion({
      adapter,
      editorState: () => ({ id: 'a', name: 'note.md', path: null, ext: '.md', content: 'hello world' }),
      invokeCompletion: async (): Promise<string> => ' accepted',
      debounceMs: 10,
      timeoutMs: 1000
    });

    adapter.emit('input');
    await vi.advanceTimersByTimeAsync(10);
    await nextTick();
    await expect(completion.accept()).resolves.toBeUndefined();

    expect(adapter.acceptGhostText).toHaveBeenCalledWith(' accepted');
    expect(completion.state.value.status).toBe('idle');
    vi.useRealTimers();
  });

  it('does not request again when accepting ghost text emits an input event', async (): Promise<void> => {
    vi.useFakeTimers();
    const adapter = createAdapter();
    adapter.acceptGhostText = vi.fn(async (): Promise<void> => {
      setTimeout((): void => adapter.emit('input'), 0);
    });
    const invoke = vi.fn(async (): Promise<string> => ' accepted');
    const completion = useInlineCompletion({
      adapter,
      editorState: () => ({ id: 'a', name: 'note.md', path: null, ext: '.md', content: 'hello world' }),
      invokeCompletion: invoke,
      debounceMs: 10,
      timeoutMs: 1000
    });

    adapter.emit('input');
    await vi.advanceTimersByTimeAsync(10);
    await nextTick();
    await completion.accept();
    await vi.advanceTimersByTimeAsync(10);

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(adapter.acceptGhostText).toHaveBeenCalledWith(' accepted');
    vi.useRealTimers();
  });

  it('does not cancel accepting state when accepting ghost text emits programmatic editor events', async (): Promise<void> => {
    vi.useFakeTimers();
    const adapter = createAdapter();
    adapter.acceptGhostText = vi.fn(async (): Promise<void> => {
      adapter.emit('cursor');
      adapter.emit('documentChange');
      adapter.emit('input');
    });
    const completion = useInlineCompletion({
      adapter,
      editorState: () => ({ id: 'a', name: 'note.md', path: null, ext: '.md', content: 'hello world' }),
      invokeCompletion: async (): Promise<string> => ' accepted',
      debounceMs: 10,
      timeoutMs: 1000
    });

    adapter.emit('input');
    await vi.advanceTimersByTimeAsync(10);
    await nextTick();
    await completion.accept();

    expect(adapter.acceptGhostText).toHaveBeenCalledWith(' accepted');
    expect(adapter.hideGhost).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('does not request completion when composition ends without text input', async (): Promise<void> => {
    vi.useFakeTimers();
    const adapter = createAdapter();
    const invoke = vi.fn(async (): Promise<string> => ' completion');
    useInlineCompletion({
      adapter,
      editorState: () => ({ id: 'a', name: 'note.md', path: null, ext: '.md', content: 'hello world' }),
      invokeCompletion: invoke,
      debounceMs: 10,
      timeoutMs: 1000
    });

    adapter.emit('compositionStart');
    adapter.emit('compositionEnd');
    await vi.advanceTimersByTimeAsync(10);

    expect(invoke).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('returns to idle without requesting when prefix has no meaningful text', async (): Promise<void> => {
    vi.useFakeTimers();
    const adapter = createAdapter();
    adapter.getDocumentText = (): string => '   ';
    adapter.getCursorPosition = (): { absolutePosition: number } => ({ absolutePosition: 3 });
    const invoke = vi.fn(async (): Promise<string> => ' completion');
    const completion = useInlineCompletion({
      adapter,
      editorState: () => ({ id: 'a', name: 'blank.md', path: null, ext: '.md', content: '   ' }),
      invokeCompletion: invoke,
      debounceMs: 10,
      timeoutMs: 1000
    });

    adapter.emit('input');
    await vi.advanceTimersByTimeAsync(10);

    expect(invoke).not.toHaveBeenCalled();
    expect(completion.state.value.status).toBe('idle');
    vi.useRealTimers();
  });

  it('requests completion after composition input finishes', async (): Promise<void> => {
    vi.useFakeTimers();
    const adapter = createAdapter();
    const invoke = vi.fn(async (): Promise<string> => ' completion');
    useInlineCompletion({
      adapter,
      editorState: () => ({ id: 'a', name: 'note.md', path: null, ext: '.md', content: 'hello world' }),
      invokeCompletion: invoke,
      debounceMs: 10,
      timeoutMs: 1000
    });

    adapter.emit('compositionStart');
    adapter.emit('input');
    adapter.emit('compositionEnd');
    await vi.advanceTimersByTimeAsync(10);

    expect(invoke).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('requests completion after composition document change finishes', async (): Promise<void> => {
    vi.useFakeTimers();
    const adapter = createAdapter();
    const invoke = vi.fn(async (): Promise<string> => ' completion');
    useInlineCompletion({
      adapter,
      editorState: () => ({ id: 'a', name: 'note.md', path: null, ext: '.md', content: 'hello world' }),
      invokeCompletion: invoke,
      debounceMs: 10,
      timeoutMs: 1000
    });

    adapter.emit('compositionStart');
    adapter.emit('documentChange');
    adapter.emit('compositionEnd');
    await vi.advanceTimersByTimeAsync(10);

    expect(invoke).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
