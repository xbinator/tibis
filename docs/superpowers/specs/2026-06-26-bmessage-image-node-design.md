# BMessage ImageNode 抽离设计

## 背景

`src/components/BMessage/components/InlineNode.vue` 当前负责所有行内节点分发，同时包含图片节点的加载错误状态、预览、复制、鼠标事件和样式。图片分支已经形成独立职责，适合抽成单独组件，降低 `InlineNode.vue` 的复杂度。

## 目标

- 新增 `src/components/BMessage/components/ImageNode.vue`，专门渲染 `ImageInlineNode`。
- 保持图片预览、复制、加载失败处理、阻止拖拽和文案行为不变。
- `InlineNode.vue` 只负责识别 `node.type === 'image'` 并转交给 `ImageNode`。
- 将图片内部类名从 `b-message__image__img` 调整为更清晰的 `b-message__image-img`。

## 组件边界

`ImageNode.vue` 接收 `node: ImageInlineNode`。组件内部注入 `MESSAGE_NODE_RENDER_CONTEXT_KEY`，使用 `useClipboard().copyImage`，并维护 `imageLoadError` 状态。

`InlineNode.vue` 删除图片专属状态和方法，只保留行内节点递归分发能力。它导入并使用 `ImageNode.vue`，其它行内节点渲染不变。

## 数据流

图片节点由解析器继续生成 `ImageInlineNode`，其中 `src`、`alt`、`title` 和 `imageIndex` 不变。`ImageNode.vue` 根据 `node.src` 监听变化并重置错误状态；点击图片时通过注入上下文调用 `previewImageAt(node.imageIndex)`；点击复制按钮时调用 `copyImage(node.src)`。

## 错误处理

图片 `error` 事件会将 `imageLoadError` 设为 `true`。加载失败后隐藏复制按钮，并阻止预览触发。`node.src` 更新时错误状态重置，便于重新尝试渲染。

## 验证

- 运行 TypeScript 类型检查，确认 `InlineNode.vue` 与新 `ImageNode.vue` 类型收窄正确。
- 运行相关组件测试或全量可用测试命令，确认 BMessage 渲染未回退。
- 更新 `changelog/2026-06-26.md` 记录本次重构。
