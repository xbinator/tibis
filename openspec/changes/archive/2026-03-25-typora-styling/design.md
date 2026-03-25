## Context

当前编辑器使用基础 CSS 样式，Markdown 渲染效果简单。目标是让编辑器样式接近 Typora：简洁、干净、舒适的阅读体验。

## Goals / Non-Goals

**Goals:**
- 调整标题样式，更大更醒目
- 优化段落间距
- 美化列表样式
- 添加代码块样式和语法高亮
- 优化引用块样式
- 添加链接和图片样式

**Non-Goals:**
- 不修改编辑器功能逻辑
- 不添加新功能

## Decisions

1. **字体选择**
   - 中文：PingFang SC, Hiragino Sans GB, Microsoft YaHei
   - 英文：Roboto, Helvetica Neue, Arial
   - 代码：Fira Code, Consolas, Monaco

2. **颜色方案**
   - 标题：#37352f（深灰，接近黑色）
   - 正文：#4a4a4a
   - 链接：#409eff
   - 代码背景：#f6f8fa

3. **间距系统**
   - 段落间距：1em
   - 标题间距：0.8em
   - 列表缩进：2em

## Risks / Trade-offs

- **风险**: 与 Ant Design 主题冲突
  - **缓解**: 使用更高优先级的 CSS 选择器