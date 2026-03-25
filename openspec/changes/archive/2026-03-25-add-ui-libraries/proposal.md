## Why

当前 Markdown 编辑器项目缺少完整的 Vue 生态支持。使用 ant-design-vue 可以快速构建专业美观的 UI，vue-router 实现路由管理，pinia 提供状态管理解决方案。这些是 Vue 3 项目中最常用的核心库。

## What Changes

- 安装 ant-design-vue 作为 UI 组件库
- 安装 vue-router 实现路由管理
- 安装 pinia 实现状态管理
- 创建基础路由结构
- 创建状态管理 store
- 使用 ant-design-vue 组件重构部分 UI

## Capabilities

### New Capabilities
- ui-component-library: 集成 ant-design-vue 组件库
- routing: 集成 vue-router 路由管理
- state-management: 集成 pinia 状态管理

### Modified Capabilities
- (无)

## Impact

- 新增依赖: ant-design-vue, vue-router, pinia
- 新增文件: 路由配置、store 配置
- 代码改动: 部分组件使用 ant-design-vue 重构