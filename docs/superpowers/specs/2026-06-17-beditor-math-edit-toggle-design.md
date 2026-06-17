# BEditor Math Edit Toggle Design

## Goal

BEditor Rich 模式中的块级数学公式支持类似 Mermaid 代码块的“预览 / 编辑”切换，用户可以直接修改 LaTeX 内容并继续保持 Markdown 源码同步。

## Scope

- 块级公式 `$$...$$` 使用自定义 Vue NodeView 展示。
- 默认显示 KaTeX 预览。
- 点击按钮切换到编辑态，显示 LaTeX 文本框。
- 切换按钮沿用 BEditor CodeBlock 的 `control-btn` 视觉和 eye/eye-off 图标语义。
- 编辑态输入会更新 `blockMath.attrs.latex`，导出 Markdown 仍保持 `$$...$$`。
- 编辑态 textarea 禁用手动 resize，并使用 VueUse `useTextareaAutosize` 根据内容自动撑高。
- 行内公式 `$...$` 暂不做原地大块编辑，避免撑乱段落布局。

## Architecture

运行时扩展将 `Mathematics` 拆为 `BlockMath` + `InlineMath`。`BlockMath` 通过 `extend().addNodeView()` 接入 `MathBlock.vue`，复用官方扩展的 commands、Markdown parse/render 和 input rules。异步 Rich Markdown parser 仍可使用无 NodeView 的数学 schema，保证大文档解析不依赖 DOM。

## UI Behavior

- 预览态：顶部左侧显示 `Formula`，右侧按钮为 active preview 状态，主体为 KaTeX display preview。
- 编辑态：右侧按钮切回预览；主体为禁用手动 resize 的 LaTeX textarea，textarea 高度跟随内容自动增长。
- KaTeX 使用 `throwOnError: false` 做容错渲染，仍允许切回编辑修改。
- 文本框输入实时同步到节点属性，不额外提供保存/取消按钮。

## Testing

- 新增组件测试挂载 `MathBlock.vue`，验证预览渲染、CodeBlock 风格切换按钮、切换编辑态、输入触发 `updateAttributes`。
- 新增 Rich Editor 集成测试，验证 `RuntimeBlockMath` 在真实 `EditorContent` 中渲染并在编辑后更新 `editor.getMarkdown()`。
- 新增/扩展 parser 测试，确认块级公式仍解析为 `blockMath` 并保留 `latex`。
- 跑 BEditor/BMessage 相关测试、TypeScript、ESLint、Stylelint。

## Commit Policy

本轮不提交代码，等待最终统一提交。
