## 1. 安装依赖

- [x] 1.1 安装 ant-design-vue
- [x] 1.2 安装 vue-router
- [x] 1.3 安装 pinia
- [x] 1.4 安装 unplugin-vue-components（按需引入）

## 2. 配置路由

- [x] 2.1 创建 src/router 目录
- [x] 2.2 创建 src/router/index.ts 路由配置
- [x] 2.3 在 main.ts 中挂载路由

## 3. 配置状态管理

- [x] 3.1 创建 src/stores 目录
- [x] 3.2 创建 src/stores/editor.ts 编辑器 store
- [x] 3.3 创建 src/stores/settings.ts 设置 store
- [x] 3.4 在 main.ts 中挂载 pinia

## 4. 配置 UI 组件库

- [x] 4.1 在 vite.config.ts 配置 unplugin-vue-components
- [x] 4.2 在 uno.config.ts 配置自动导入（跳过，已使用 unplugin-vue-components）
- [x] 4.3 在 main.ts 中引入 ant-design-vue 样式

## 5. 验证

- [x] 5.1 运行 npm run dev 确保开发服务器正常
- [x] 5.2 运行 npm run build 确保构建正常