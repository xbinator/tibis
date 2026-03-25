## Context

当前项目使用纯 Vue 3 + Tiptap 构建 Markdown 编辑器，缺少：
- 完整 UI 组件库（当前只有基础样式）
- 路由管理
- 状态管理

项目技术栈：Vue 3 + Tauri + Tiptap + UnoCSS + Less

## Goals / Non-Goals

**Goals:**
- 安装并集成 ant-design-vue 4.x
- 安装并集成 vue-router 4.x
- 安装并集成 pinia
- 创建基础项目结构（路由、store）

**Non-Goals:**
- 不重构现有编辑器核心逻辑
- 不改变现有的 Tauri 功能

## Decisions

1. **UI 库版本选择**
   - ant-design-vue 4.x (最新稳定版)
   - 理由：与 Vue 3 完全兼容，组件丰富

2. **路由结构设计**
   - 使用 vue-router 4.x
   - 创建基础路由：/ (编辑器首页)
   - 预留扩展：未来可添加设置页、历史页等

3. **状态管理**
   - 使用 pinia
   - 创建 editor store 管理编辑器状态
   - 创建 settings store 管理应用设置

## Risks / Trade-offs

- **风险**: ant-design-vue 样式与现有样式冲突
  - **缓解**: 使用 CSS Scoped 或调整 UnoCSS 配置

- **风险**: 打包体积增加
  - **缓解**: 按需引入组件，使用 tree-shaking