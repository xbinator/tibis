## ADDED Requirements

### Requirement: 使用 Ant Design 组件重构 UI
编辑器 SHALL 使用 ant-design-vue 组件重构 UI，实现专业美观的界面。

#### Scenario: Layout 布局
- **WHEN** 使用 a-layout, a-layout-header, a-layout-content 组件
- **THEN** 页面布局结构清晰，分为头部、内容区

#### Scenario: 工具栏重构
- **WHEN** 使用 a-button, a-dropdown, a-divider 组件
- **THEN** 工具栏按钮样式统一，支持下拉菜单

#### Scenario: 主题切换
- **WHEN** 使用 ConfigProvider 实现亮色/暗色主题
- **THEN** 点击主题按钮时，整个界面主题切换

#### Scenario: 窗口控制按钮
- **WHEN** 使用 a-button (text 类型) 实现窗口控制
- **THEN** 最小化、最大化、关闭按钮显示正常