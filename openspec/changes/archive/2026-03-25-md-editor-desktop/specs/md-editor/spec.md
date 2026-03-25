## ADDED Requirements

### Requirement: WYSIWYG 编辑器
桌面端 Markdown 编辑器 SHALL 实现所见即所得（WYSIWYG）编辑体验，用户在编辑器中输入 Markdown 语法时自动转换为富文本渲染，无需切换编辑/预览模式。

#### Scenario: 初始加载显示空编辑器
- **WHEN** 用户首次启动应用
- **THEN** 显示空白编辑器区域，可直接开始输入

#### Scenario: Markdown 自动渲染
- **WHEN** 用户输入 `# 标题一`
- **THEN** 文本立即显示为一级标题样式（非源码形式）

### Requirement: Markdown 语法支持
编辑器 SHALL 支持常见的 Markdown 语法实时渲染，包括标题（h1-h6）、粗体、斜体、删除线、列表（有序/无序）、代码块、行内代码、链接、图片、引用块、水平线、表格等。

#### Scenario: 标题渲染
- **WHEN** 用户输入 `# 标题一` 到 `###### 标题六`
- **THEN** 文本立即显示为对应级别的 HTML 标题元素样式

#### Scenario: 代码块渲染
- **WHEN** 用户输入 \`\`\`javascript\nconsole.log('hello')\n\`\`\`
- **THEN** 文本显示为代码块样式，包含语言标识

#### Scenario: 列表渲染
- **WHEN** 用户输入 `- 项目1\n- 项目2` 或 `1. 项目1\n2. 项目2`
- **THEN** 文本显示为无序或有序列表样式

### Requirement: Markdown 源码查看
用户 SHALL 能够查看当前编辑内容的 Markdown 源码格式。

#### Scenario: 切换到源码模式
- **WHEN** 用户点击"源码"按钮或使用 Ctrl+Shift+M
- **THEN** 编辑器显示为纯 Markdown 源码形式

#### Scenario: 切换回编辑模式
- **WHEN** 用户在源码模式下点击"编辑"按钮或使用 Ctrl+Shift+M
- **THEN** 编辑器恢复 WYSIWYG 渲染模式