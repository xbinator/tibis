# 2026-06-18 Chat Input File Drop Design

## Background

`src/components/BChat/index.vue` currently renders the chat input as a container that includes `ImagePreview`, `BPromptEditor`, and `InputToolbar`. `BPromptEditor` already handles paste and drop events inside the CodeMirror editor area through `src/components/BPromptEditor/extensions/pasteHandler.ts`.

The missing behavior is container-level file drop support: users expect dropping a file anywhere on the visible chat input container to work, not only over the editable CodeMirror area.

## Goals

- Allow files dropped onto the full BChat input container to be accepted.
- Keep the current file semantics:
  - image files become draft image attachments through `useImageUpload`.
  - non-image files become file reference tokens through `useFileReference`.
- Resolve dropped local file paths through the shared native file path resolver when available.
- Share the DOM drag/drop state and listener lifecycle through a reusable `src/hooks` hook.
- Show a clear drag-active visual state on the input container.
- Avoid conflicting with the existing `BPromptEditor` drop handler.

## Non-Goals

- Do not add generic non-image file attachments to chat messages.
- Do not change the file reference token format.
- Do not redesign the prompt editor drop implementation.
- Do not add directory traversal or file content reading for dropped files.

## Recommended Approach

Add lightweight container-level drag handling through `src/hooks/useFileDrop.ts`, with `src/components/BChat/index.vue` passing the input container ref and a BChat-specific file consumer callback into the hook.

The hook will listen for `dragenter`, `dragover`, `dragleave`, and `drop` on a provided target element. When a drag event contains files, it prevents the browser default behavior and sets a drag-active state. On drop, the hook sends the dropped `File[]` to its consumer:

- BChat classifies images and non-images, then sends images to `imageUpload.appendImages`.
- BChat converts non-images with `fileReference.onPasteFiles` and inserts the token text into the prompt editor.
- `useFileReference` resolves native paths through `resolveDroppedFilePath(file)` before falling back to the existing filename token.

The existing `BPromptEditor` drop behavior remains in place. If the editor handles a drop first and stops the event, the container handler does not run. If the drop lands on surrounding input UI, the container handler processes it.

## Component Changes

### `src/hooks/useFileDrop.ts`

Create a reusable hook that owns:

- `isDragging`
- drag depth, used to avoid flicker when dragging across children inside the target.
- DOM listener binding and cleanup against the provided container ref.
- `resolveDroppedFilePath(file)`, shared by BChat and the welcome page.

The hook accepts:

- `targetRef`
- `onDropFiles`

### `src/components/BChat/index.vue`

Add `inputContainerRef`, pass it to `useFileDrop`, and bind the returned drag state through `bem('input-container', { dragover: isInputDragActive })`.

### `src/components/BChat/hooks/useFileReference.ts`

Update `onPasteFiles` so dropped files with resolvable native paths produce encoded real-path file reference tokens such as `{{#[](%2Fworkspace%2FMy%20Notes%2Fnote.md)}}`. Files without a resolvable path keep the filename fallback token shape, with the filename encoded when needed.

### `src/views/welcome/components/DropZone.vue`

Reuse `useFileDrop` and `resolveDroppedFilePath` instead of maintaining a separate drag counter and path resolver.

### Styling

Update the existing `.b-chat__input-container` styles with a focused but restrained drop state:

- stronger border color
- subtle background tint
- optional inset shadow

The style should fit the current compact chat UI and should not introduce a large overlay or instructional text.

## Data Flow

1. User drags one or more files over the input container.
2. `dragenter` detects file data and activates the visual state.
3. `dragover` prevents the browser from opening the file and sets `dropEffect = 'copy'`.
4. `drop` resets drag state and passes `event.dataTransfer.files` to BChat.
5. BChat splits dropped files into images and non-images.
6. Images are sent to `imageUpload.appendImages(imageFiles)`.
7. Non-images are converted to a token string with `fileReference.onPasteFiles(otherFiles)`, preferring resolved local paths encoded in `[](...)`.
8. The token string is inserted through the existing prompt editor insertion path.

## Edge Cases

- Empty `dataTransfer.files`: reset drag state and do nothing.
- Mixed files: process image attachments and file reference tokens in the same drop.
- Unsupported vision model: `imageUpload.appendImages` already no-ops when vision is unavailable; non-image references still insert.
- Drag leaves a child element but remains inside the container: `inputDragDepth` prevents the active state from flickering.
- Browser default file open behavior: prevented for file drag events on the input container.

## Testing

Add or update focused tests around BChat input behavior:

- container `dragenter`/`dragleave` toggles the active class.
- dropping a non-image file inserts a file reference token.
- dropping a non-image file uses the native path resolver when available.
- dropping a non-image file falls back to the filename token when no local path is available.
- dropping an image file calls the image upload path.
- dropping mixed files processes both paths.
- welcome page DropZone still opens dropped files through the same native path resolver.

If existing component tests make direct DOM drop simulation difficult, cover the file splitting and drop handler behavior through a small exported or locally testable helper, keeping production code simple.

## Decisions

- File tokens should be inserted at the editor's current saved cursor when available. If no cursor exists, use the existing insertion method behavior rather than introducing a separate fallback.
- No visible instructional copy is added in the first pass; drag-active styling is enough for this scoped improvement.
