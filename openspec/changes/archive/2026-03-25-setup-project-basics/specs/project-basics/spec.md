## ADDED Requirements

### Requirement: 项目基础配置
项目 SHALL 完成基础配置包括包管理器迁移、Git 初始化和项目结构整理。

#### Scenario: pnpm 迁移
- **WHEN** 删除 package-lock.json，运行 pnpm install
- **THEN** 生成 pnpm-lock.yaml
- **AND** node_modules 由 pnpm 管理

#### Scenario: Git 初始化
- **WHEN** 运行 git init
- **THEN** 创建 .git 目录
- **AND** 可以进行版本控制

#### Scenario: .gitignore 创建
- **WHEN** 创建 .gitignore 文件
- **THEN** 包含正确的忽略规则
- **AND** 提交时不包含不必要的文件

#### Scenario: App.vue 简化
- **WHEN** 修改 App.vue
- **THEN** 使用 router-view 显示页面
- **AND** 显示编辑器内容

#### Scenario: 启动开发版本
- **WHEN** 运行 pnpm dev
- **THEN** 开发服务器正常启动
- **AND** 可以在浏览器中访问