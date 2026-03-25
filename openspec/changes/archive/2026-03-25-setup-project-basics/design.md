## Context

当前项目使用 npm 作为包管理器，缺少 Git 仓库和 .gitignore。App.vue 内容需要简化并显示编辑器页面。

## Goals / Non-Goals

**Goals:**
- 安装 pnpm 并迁移到 pnpm 包管理
- 初始化 Git 仓库
- 创建 .gitignore 文件
- 简化 App.vue，添加编辑器页面内容

**Non-Goals:**
- 不修改项目业务逻辑

## Decisions

1. **包管理器选择 pnpm**
   - 理由：更快、更好的依赖管理、节省磁盘空间
   - 使用 corepack 启用 pnpm

2. **.gitignore 内容**
   - node_modules
   - dist
   - .DS_Store
   - src-tauri/target
   - *.log

3. **App.vue 简化方案**
   - 使用路由视图
   - 添加简单的编辑器组件展示

## Risks / Trade-offs

- **风险**: pnpm 安装问题
  - **缓解**: 使用 corepack 启用或全局安装 pnpm