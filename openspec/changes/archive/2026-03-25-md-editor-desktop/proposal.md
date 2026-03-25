## Why

需要一个桌面端 Markdown 编辑器，支持实时预览和编辑功能。目前市场上缺少轻量级、开源的 Markdown 桌面编辑器，用户需要一款界面简洁、功能实用的工具来满足日常文档编辑需求。

## What Changes

- 新建桌面端 Markdown 编辑器应用
- 实现 WYSIWYG 所见即所得编辑器，类似 Notion 的块编辑体验
- 编辑器直接渲染 Markdown 语法，无需单独的预览窗口
- 支持基本的 Markdown 语法高亮
- 支持文件的新建、打开、保存功能
- 支持常见的 Markdown 语法渲染（标题、列表、代码块、链接、图片等）
- 窗口支持最小化、最大化、关闭等基础操作
- 应用支持深色/浅色主题切换

## Capabilities

### New Capabilities

- `md-editor`: 桌面端 Markdown 编辑器核心功能，包括编辑区和预览区的实现
- `file-operations`: 文件操作能力，支持新建、打开、保存 Markdown 文件
- `theme-switching`: 主题切换能力，支持深色和浅色模式

### Modified Capabilities

- (无)

## Impact

- 新增 Tauri + Vue 3 桌面应用项目
- 引入依赖：@tiptap/vue-3, @tiptap/pm, @tiptap/starter-kit, unocss, @vueuse/core
- 不使用 markdown-it，利用 Tiptap 实现 WYSIWYG 编辑