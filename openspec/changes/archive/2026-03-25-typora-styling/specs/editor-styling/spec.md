## ADDED Requirements

### Requirement: Typora 风格样式
编辑器 SHALL 使用 Typora 风格的 Markdown 样式，提供美观的编辑体验。

#### Scenario: 标题样式
- **WHEN** 渲染 Markdown 标题
- **THEN** 标题使用更大更醒目的样式，字重加粗，上下间距合理

#### Scenario: 段落样式
- **WHEN** 渲染 Markdown 段落
- **THEN** 行高 1.8，段落间距 1em

#### Scenario: 代码块样式
- **WHEN** 渲染 Markdown 代码块
- **THEN** 使用等宽字体，有背景色，圆角边框

#### Scenario: 列表样式
- **WHEN** 渲染 Markdown 列表
- **THEN** 缩进美观，项目符号清晰

#### Scenario: 引用块样式
- **WHEN** 渲染 Markdown 引用
- **THEN** 左边框明显，背景色区分

#### Scenario: 链接样式
- **WHEN** 渲染 Markdown 链接
- **THEN** 蓝色下划线，hover 效果