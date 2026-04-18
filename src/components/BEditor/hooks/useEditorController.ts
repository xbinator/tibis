import type { ComputedRef, Ref } from 'vue';
import { computed } from 'vue';
import { createNoopEditorController, type EditorController } from '../adapters/types';

type SourceEditorFocusController = Pick<EditorController, 'focusEditor' | 'focusEditorAtStart'>;
type SourceEditorPaneRef = Ref<EditorController | SourceEditorFocusController | null>;

interface UseEditorControllerParams {
  isRichMode: ComputedRef<boolean>;
  richEditorPaneRef: Ref<EditorController | null>;
  sourceEditorPaneRef: SourceEditorPaneRef;
}

function isEditorController(controller: EditorController | SourceEditorFocusController): controller is EditorController {
  return (
    'undo' in controller &&
    'redo' in controller &&
    'canUndo' in controller &&
    'canRedo' in controller &&
    'setSearchTerm' in controller &&
    'findNext' in controller &&
    'findPrevious' in controller &&
    'clearSearch' in controller &&
    'getSearchState' in controller &&
    'scrollToAnchor' in controller &&
    'getActiveAnchorId' in controller
  );
}

function createSourceEditorController(sourceEditorPaneRef: SourceEditorPaneRef, fallbackController: EditorController): EditorController {
  return {
    ...fallbackController,
    undo(): void {
      sourceEditorPaneRef.value?.focusEditor();
    },
    redo(): void {
      sourceEditorPaneRef.value?.focusEditor();
    },
    focusEditor(): void {
      sourceEditorPaneRef.value?.focusEditor();
    },
    focusEditorAtStart(): void {
      sourceEditorPaneRef.value?.focusEditorAtStart();
    }
  };
}

export function useEditorController({ isRichMode, richEditorPaneRef, sourceEditorPaneRef }: UseEditorControllerParams): ComputedRef<EditorController> {
  const noopController = createNoopEditorController();
  const sourceFallbackController = createSourceEditorController(sourceEditorPaneRef, noopController);

  return computed<EditorController>(() => {
    if (isRichMode.value) {
      return richEditorPaneRef.value ?? noopController;
    }

    const sourceController = sourceEditorPaneRef.value;
    if (!sourceController) {
      return noopController;
    }

    return isEditorController(sourceController) ? sourceController : sourceFallbackController;
  });
}

export type { EditorController } from '../adapters/types';
