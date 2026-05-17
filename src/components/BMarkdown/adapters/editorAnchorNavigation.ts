import type { AnchorRecord } from '../hooks/useAnchors';

interface EditorAnchorNavigationHandlers {
  scrollEditorAnchor: (anchorId: string) => boolean;
  scrollRichAnchor: (record: AnchorRecord) => void;
  scrollToTop: () => void;
  setActiveAnchorId: (anchorId: string) => void;
}

interface EditorAnchorNavigationParams {
  record: AnchorRecord;
  isRichMode: boolean;
  scrollEditorAnchor: EditorAnchorNavigationHandlers['scrollEditorAnchor'];
  scrollRichAnchor: EditorAnchorNavigationHandlers['scrollRichAnchor'];
  scrollToTop: EditorAnchorNavigationHandlers['scrollToTop'];
  setActiveAnchorId: EditorAnchorNavigationHandlers['setActiveAnchorId'];
}

export function handleEditorAnchorNavigation({
  record,
  isRichMode,
  scrollEditorAnchor,
  scrollRichAnchor,
  scrollToTop,
  setActiveAnchorId
}: EditorAnchorNavigationParams): void {
  setActiveAnchorId(record.id);

  if (!record.id) {
    scrollToTop();
    return;
  }

  if (isRichMode) {
    scrollRichAnchor(record);
    return;
  }

  scrollEditorAnchor(record.id);
}
