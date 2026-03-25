## Context

该项目是一个桌面端 Markdown 编辑器，采用 Tauri + Vue 3 技术栈构建。项目需要实现一个轻量级、简洁实用的 Markdown 编辑工具，支持实时预览和基本文件操作。

技术选型约束：
- 前端框架：Vue 3
- 样式方案：Less + UnoCSS
- 编辑器：@tiptap/vue-3 + @tiptap/starter-kit（实现 WYSIWYG）
- 桌面框架：Tauri
- 工具库：@vueuse/core

## Goals / Non-Goals

**Goals:**
- 实现 WYSIWYG 所见即所得编辑器，编辑时直接看到渲染效果
- 支持 Markdown 语法输入自动转换为富文本
- 支持文件的新建、打开、保存操作
- 支持深色/浅色主题切换
- 窗口基础操作（最小化、最大化、关闭）

**Non-Goals:**
- 不支持传统的源代码编辑模式（纯文本）
- 不支持多人协作
- 不支持云同步
- 不支持插件扩展

## Decisions

### 1. 使用 Tauri 作为桌面框架

**选择理由：**
- 轻量级，比 Electron 更小的打包体积
- Rust 后端，性能更好
- 原生体验更接近系统

**备选方案：** Electron
- Electron 生态更成熟，但打包体积较大

### 2. 使用 Tiptap 作为编辑器

**选择理由：**
- 基于 ProseMirror，功能强大
- 支持 Markdown 快捷键
- 可扩展性好

**备选方案：** CodeMirror
- CodeMirror 更偏代码编辑器，Markdown 生态不如 Tiptap

### 3. 使用 UnoCSS 进行原子化 CSS

**选择理由：**
- 体积小，按需生成
- 与 Less 可共存
- 配置灵活

**备选方案：** Tailwind CSS
- 生态更大，但与 Less 共用时可能产生冲突

### 4. WYSIWYG 编辑方案

采用 Tiptap 实现所见即所得编辑器，用户在编辑器中输入 Markdown 语法时自动转换为富文本渲染。Tiptap 基于 ProseMirror，支持内容和输出格式为 Markdown。

## Risks / Trade-offs

[风险] Tauri Windows 打包可能遇到签名问题
→  Mitigation: 开发阶段使用开发模式测试，最终打包时配置正确的签名

[风险] Tiptap 与 Less 样式可能产生冲突
→  Mitigation: 使用 UnoCSS 的 safelist 或自定义前缀隔离

[风险] 实时预览性能问题
→  Mitigation: 使用防抖处理，避免每次输入都重新渲染

## Migration Plan

1. 初始化 Tauri + Vue 3 项目
2. 安装并配置 UnoCSS
3. 集成 Tiptap 编辑器（WYSIWYG 模式）
4. 配置 Markdown 输入转换
5. 添加文件操作（新建、打开、保存）
6. 实现主题切换
7. 打包发布

## Open Questions

- 是否需要支持 Markdown 导出为 PDF/HTML？
- 是否需要支持自定义 CSS 样式？
- 是否需要支持多个标签页？