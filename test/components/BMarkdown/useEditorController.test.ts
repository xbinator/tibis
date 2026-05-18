import { computed, shallowRef } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import type { EditorController } from '@/components/BEditor/adapters/types';
import { EMPTY_SEARCH_STATE, createNoopEditorController } from '@/components/BEditor/adapters/types';
import { useEditorController } from '@/components/BEditor/hooks/useEditorController';

function createController(tag: string): EditorController {
  return {
    undo(): void {
      void tag;
    },
    redo(): void {
      void tag;
    },
    canUndo(): boolean {
      return true;
    },
    canRedo(): boolean {
      return false;
    },
    focusEditor(): void {
      void tag;
    },
    focusEditorAtStart(): void {
      void tag;
    },
    setSearchTerm(term: string): void {
      void term;
    },
    findNext(): void {
      void tag;
    },
    findPrevious(): void {
      void tag;
    },
    clearSearch(): void {
      void tag;
    },
    getSelection() {
      return { from: 1, to: 3, text: tag };
    },
    async insertAtCursor(content: string): Promise<void> {
      void content;
      void tag;
    },
    async replaceSelection(content: string): Promise<void> {
      void content;
      void tag;
    },
    async replaceDocument(content: string): Promise<void> {
      void content;
      void tag;
    },
    selectLineRange(): boolean {
      return false;
    },
    getSearchState(): ReturnType<EditorController['getSearchState']> {
      return EMPTY_SEARCH_STATE;
    },
    scrollToAnchor(anchorId: string): boolean {
      void anchorId;
      return false;
    },
    getActiveAnchorId(scrollContainer: HTMLElement, thresholdPx: number): string {
      void scrollContainer;
      void thresholdPx;
      return '';
    }
  };
}

describe('useEditorController', () => {
  it('returns the rich controller in rich mode', () => {
    const richController = createController('rich');
    const controller = useEditorController({
      isRichMode: computed(() => true),
      richEditorPaneRef: shallowRef<EditorController | null>(richController),
      sourceEditorPaneRef: shallowRef<EditorController | null>(null)
    });

    expect(controller.value).toBe(richController);
  });

  it('returns the source controller in source mode', () => {
    const sourceController = createController('source');
    const controller = useEditorController({
      isRichMode: computed(() => false),
      richEditorPaneRef: shallowRef<EditorController | null>(null),
      sourceEditorPaneRef: shallowRef<EditorController | null>(sourceController)
    });

    expect(controller.value).toBe(sourceController);
  });

  it('wraps the current focus-only source pane with safe controller methods', () => {
    const focusEditor = vi.fn();
    const focusEditorAtStart = vi.fn();
    const controller = useEditorController({
      isRichMode: computed(() => false),
      richEditorPaneRef: shallowRef<EditorController | null>(null),
      sourceEditorPaneRef: shallowRef({ focusEditor, focusEditorAtStart })
    });

    controller.value.undo();
    controller.value.redo();
    controller.value.focusEditor();
    controller.value.focusEditorAtStart();

    expect(focusEditor).toHaveBeenCalledTimes(3);
    expect(focusEditorAtStart).toHaveBeenCalledTimes(1);
    expect(controller.value.canUndo()).toBe(false);
    expect(controller.value.canRedo()).toBe(false);
    expect(controller.value.getSelection()).toBeNull();
    expect(controller.value.getSearchState()).toEqual(EMPTY_SEARCH_STATE);
  });

  it('returns a safe no-op controller when the pane is not mounted', () => {
    const controller = useEditorController({
      isRichMode: computed(() => true),
      richEditorPaneRef: shallowRef<EditorController | null>(null),
      sourceEditorPaneRef: shallowRef<EditorController | null>(null)
    });
    const noopController = createNoopEditorController();

    expect(controller.value.undo).not.toThrow();
    expect(controller.value.redo).not.toThrow();
    expect(controller.value.canUndo()).toBe(false);
    expect(controller.value.canRedo()).toBe(false);
    expect(controller.value.focusEditor).not.toThrow();
    expect(controller.value.focusEditorAtStart).not.toThrow();
    expect(() => controller.value.setSearchTerm('text')).not.toThrow();
    expect(() => controller.value.findNext()).not.toThrow();
    expect(() => controller.value.findPrevious()).not.toThrow();
    expect(() => controller.value.clearSearch()).not.toThrow();
    expect(controller.value.getSelection()).toBeNull();
    expect(controller.value.getSearchState()).toEqual(EMPTY_SEARCH_STATE);
    expect(controller.value.scrollToAnchor('heading-0')).toBe(false);
    expect(controller.value.getActiveAnchorId(null as unknown as HTMLElement, 100)).toBe('');
    expect(noopController.getSearchState()).toEqual(EMPTY_SEARCH_STATE);
  });

  it('delegates editor write methods to the active controller', async () => {
    const insertAtCursor = vi.fn(async () => undefined);
    const replaceSelection = vi.fn(async () => undefined);
    const replaceDocument = vi.fn(async () => undefined);
    const controller = useEditorController({
      isRichMode: computed(() => true),
      richEditorPaneRef: shallowRef<EditorController | null>({
        ...createController('rich'),
        insertAtCursor,
        replaceSelection,
        replaceDocument
      }),
      sourceEditorPaneRef: shallowRef<EditorController | null>(null)
    });

    expect(controller.value.getSelection()).toEqual({ from: 1, to: 3, text: 'rich' });

    await controller.value.insertAtCursor('A');
    await controller.value.replaceSelection('B');
    await controller.value.replaceDocument('C');

    expect(insertAtCursor).toHaveBeenCalledWith('A');
    expect(replaceSelection).toHaveBeenCalledWith('B');
    expect(replaceDocument).toHaveBeenCalledWith('C');
  });
});
