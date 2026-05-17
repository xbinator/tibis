# Task 03：编辑器公共读写 API

日期：2026-04-19

## 目标

给 `BMarkdown` 暴露统一的 AI 可调用编辑能力，让富文本模式和源码模式都能被同一套工具使用。

## 这个 Task 要做什么

- 扩展 `BMarkdownPublicInstance`，补齐：
  - `getSelection`
  - `insertAtCursor`
  - `replaceSelection`
  - `replaceDocument`
- 在 `PaneRichEditor.vue` 中实现对应能力。
- 在 `PaneSourceEditor.vue` 中实现对应能力。
- 在 `src/components/BMarkdown/index.vue` 向外统一暴露这些方法。
- 在 `src/views/editor/index.vue` 挂载和注销 active editor context。

## 修改范围

- `src/components/BMarkdown/types.ts`
- `src/components/BMarkdown/hooks/useEditorController.ts`
- `src/components/BMarkdown/components/PaneRichEditor.vue`
- `src/components/BMarkdown/components/PaneSourceEditor.vue`
- `src/components/BMarkdown/index.vue`
- `src/views/editor/index.vue`

## 完成标准

- 富文本模式和源码模式的公共 API 语义一致。
- 上层只依赖 `BMarkdownPublicInstance`，不感知内部编辑器差异。
- 编辑器页面切换或卸载时，上下文能正确清理。
- 无光标、无选区等失败场景能被上层识别。

## 验收

- `pnpm build`
- 手工验证富文本模式和源码模式都能取选区、插入、替换。

## 不包括

- 不实现确认弹窗。
- 不实现工具执行器。
- 不做聊天消息回注。
