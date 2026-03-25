## Context

当前编辑器使用原生 HTML + CSS 实现工具栏和布局，缺少专业的 UI 组件体验。项目已集成 ant-design-vue，但未充分利用其组件。

## Goals / Non-Goals

**Goals:**
- 使用 Ant Design Layout 组件重构整体布局
- 使用 Ant Design Button、Dropdown 组件重构工具栏
- 实现主题切换（使用 Ant Design ConfigProvider）
- 保持编辑器功能不变

**Non-Goals:**
- 不修改编辑器核心逻辑（Tiptap 配置）
- 不添加新功能

## Decisions

1. **布局组件选择**
   - 使用 a-layout, a-layout-header, a-layout-content
   - 理由：结构清晰，易于主题配置

2. **工具栏组件**
   - 使用 a-button 替换原生按钮
   - 使用 a-dropdown 实现下拉菜单
   - 使用 a-divider 分割工具区域

3. **主题方案**
   - 使用 Ant Design 的 ConfigProvider 实现主题
   -亮色主题 + 暗色主题切换

4. **窗口控制**
   - 使用 a-button (text 类型) 作为窗口控制按钮

## Risks / Trade-offs

- **风险**: Tiptap 编辑器样式与 Ant Design 样式冲突
  - **缓解**: 使用 scoped CSS 隔离编辑器样式