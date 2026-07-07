# Widget Record Type Design

## Goal

Widget editor sessions should be first-class recent records with `type: 'widget'`.

The widget editor should no longer depend on a `.tibis` container format or a content-level `{ type: 'widget', version: 1 }` wrapper to decide routing. A widget record is identified by its storage record type, and its content is the widget JSON payload itself.

## Storage Model

`src/shared/storage/files/types.ts` should split file-like recent records into a shared base and concrete record types:

- `StoredFile`: ordinary editor record with `type: 'file'`.
- `StoredWidget`: widget editor record with `type: 'widget'`.
- `WebviewRecord`: unchanged webview record with `type: 'webview'`.
- `RecentRecord`: union of the three record types.

The shared base keeps the existing document fields:

- `id`
- `path`
- `content`
- `savedContent`
- `name`
- `ext`
- timestamp fields
- workspace/pinning reserved fields

`StoredWidget.content` should store the widget JSON directly. It should not be serialized through `createTibisDocumentContent`, and it should not require a `.tibis` extension.

## Normalization

`src/shared/storage/files/recent.ts` should stop treating every non-webview record as `file`.

Normalization should follow these rules:

- `type: 'webview'` keeps the existing webview path.
- `type: 'widget'` normalizes through the file-like record path but preserves `type: 'widget'`.
- `type: 'file'` normalizes through the file-like record path and preserves `type: 'file'`.
- missing or unknown `type` migrates to `type: 'file'`.

This keeps old records stable while allowing new widget records to survive reads and writes.

## Widget Open Flow

`src/views/settings/tools/widget/index.vue` should create widget records with `type: 'widget'`.

Opening a scanned widget should:

1. Read the latest `widget.json`.
2. Store the raw widget JSON content as the recent record content.
3. Create or update a recent record with `type: 'widget'`.
4. Navigate to the `widget` route using the stored record ID.

The widget settings page should not wrap the data with `.tibis` document content.

## File Session Flow

`src/hooks/useFileSession.ts` should support a storage record type option for file-like sessions.

The widget page should pass `recordType: 'widget'`. Ordinary editor pages should keep the default `recordType: 'file'`.

All save, autosave, load, external-change, and delete paths should preserve the session record type. A widget record must not be rewritten as `type: 'file'` after the widget editor loads or saves.

The widget session should serialize `WidgetData` directly to JSON content. It should not call `.tibis` container helpers for widget records.

## Routing

Opening a recent record should use record type first:

- `type: 'widget'` routes to `widget`.
- `type: 'file'` routes to `editor`.
- `type: 'webview'` routes to webview behavior.

Content-level `.tibis` route detection can be removed from the widget path. If any ordinary `file` route detection remains for other future document formats, it should not be required for widgets.

## File-Like Record Helpers

Code that works with both ordinary files and widgets should use a type guard instead of repeating string checks.

Expected helper:

```ts
isDocumentRecord(record): record is StoredFile | StoredWidget
```

Use it in recent store getters, command panel source, welcome page, file references, runtime tools, and recent-file synchronization where both `file` and `widget` should behave as file-like records.

## UI Behavior

Widget records should continue to appear in:

- welcome recent records
- command panel recent records
- system recent-file synchronization when they have a path
- file reference lookup

The difference is opening behavior and optional icon/title treatment. A widget record opens the widget editor even if its file extension is `json`.

## Main Files

Expected implementation areas:

- `src/shared/storage/files/types.ts`
- `src/shared/storage/files/recent.ts`
- `src/stores/workspace/recent.ts`
- `src/hooks/useFileSession.ts`
- `src/hooks/useOpenFile.ts`
- `src/views/settings/tools/widget/index.vue`
- `src/views/widget/index.vue`
- `src/components/BCommandPanel/sources/recent.ts`
- `src/components/BRecent/Icon.vue`
- `src/views/welcome/index.vue`
- `src/utils/file/reference.ts`
- `src/ai/tools/shared/fileTool.ts`
- `src/components/BChat/utils/runtimeBridge.ts`

## Test Strategy

Update or add focused tests for:

- `RecentRecord` normalization preserves `type: 'widget'`.
- missing or unknown record type still migrates to `file`.
- widget settings open creates a `widget` recent record with raw widget JSON content.
- widget session load/save/autosave preserves `type: 'widget'`.
- command panel and welcome page open widget records through the widget route.
- file-like helpers include both `file` and `widget` records.

Final verification should run:

```bash
pnpm lint
pnpm lint:style
pnpm exec tsc --noEmit
```
