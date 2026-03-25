## 1. 准备阶段

- [x] 1.1 检查 md-editor 目录结构，确认所有需要移动的文件
- [x] 1.2 备份当前状态（可选）

## 2. 文件移动

- [x] 2.1 移动 src/ 目录到根目录
- [x] 2.2 移动 src-tauri/ 目录到根目录
- [x] 2.3 移动 package.json 到根目录
- [x] 2.4 移动 vite.config.ts 到根目录
- [x] 2.5 移动 uno.config.ts 到根目录
- [x] 2.6 移动其他配置文件（如 tsconfig.json, .gitignore 等）

## 3. 清理

- [x] 3.1 删除空的 md-editor 目录

## 4. 验证

- [x] 4.1 运行 npm install 确保依赖正常
- [x] 4.2 运行 Tauri 构建确保项目正常工作