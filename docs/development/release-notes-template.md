# 发版说明模版

发版说明（Release Notes）用于记录每个版本的变更内容，发布在 GitHub Release 页面供用户查阅。

## 使用方法

### 1. 生成变更记录

基于上一个 tag 到最新 commit 之间的提交记录，整理出本版本的变更：

```bash
# 查看上一个 tag
git tag --sort=-creatordate | head -1

# 查看从上一个 tag 到 HEAD 的所有提交
git log v0.1.13..HEAD --oneline
```

### 2. 填写模版

复制下方模版，按以下规则填写：

- **版本号**：替换 `vX.Y.Z` 为实际版本号，与 `package.json` 中的 `version` 一致
- **发布日期**：替换 `YYYY-MM-DD` 为实际发布日期
- **一句话概括**：用一句话总结本版本最核心的变更
- **各分类**：根据 commit 记录归类填写，每条以 `* ` 开头，按模块分组

### 3. 分类规则

| 前缀 | 分类 | 说明 |
|------|------|------|
| `feat` | 🚀 新功能 | 新增的功能或特性 |
| `refactor` | ✨ 优化 | 重构、逻辑改进、架构调整 |
| `style` | ✨ 优化 | 样式调整、UI 优化 |
| `fix` | 🐞 问题修复 | Bug 修复 |
| `perf` | ✨ 优化 | 性能优化 |
| `docs` | 不记录 | 文档变更通常不写入发版说明 |
| `test` | 不记录 | 测试变更通常不写入发版说明 |
| `chore` | 不记录 | 构建/工具变更通常不写入发版说明 |

> `docs`、`test`、`chore` 类型的提交一般不写入发版说明，除非对用户有直接影响。

### 4. 按模块分组

每个分类下按模块分组，使用三级标题，便于用户快速定位关心的变更：

```markdown
## 🚀 新功能

### 编辑器

* 新增 Monaco 包装组件，支持自动换行切换

### 对话

* Markdown 图片接入 BImageViewer 预览
```

### 5. 发布

发版说明填写完成后，在 GitHub Release 页面粘贴即可。如果使用 GitHub Actions 自动发版（参见 [github-release.md](./github-release.md)），工作流会自动创建 Release 草稿，粘贴内容后发布即可。

---

## 模版

```markdown
# Release vX.Y.Z

发布日期：YYYY-MM-DD

一句话概括本次版本。

## 🚀 新功能

## ✨ 优化

## 🐞 问题修复

## ⚠️ 升级说明

## 🙏 致谢
```
