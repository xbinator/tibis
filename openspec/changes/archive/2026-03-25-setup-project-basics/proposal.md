## Why

项目当前缺少基础配置：未使用 pnpm 包管理、未初始化 Git、缺少 .gitignore 文件。App.vue 内容也需要简化并添加页面显示内容。这些是项目启动的基础配置。

## What Changes

- 删除 package-lock.json，改用 pnpm-lock.yaml
- 初始化 Git 仓库
- 创建 .gitignore 忽略文件
- 简化 App.vue，添加编辑器页面显示

## Capabilities

### New Capabilities
- pnpm-migration: 从 npm 迁移到 pnpm
- git-initialization: 初始化 Git 仓库
- project-cleanup: 清理项目结构

### Modified Capabilities
- (无)

## Impact

- 包管理器变更：npm → pnpm
- 新增：.gitignore
- 新增：.git 仓库