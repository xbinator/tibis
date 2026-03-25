## ADDED Requirements

### Requirement: 项目文件移动到根目录
md-editor 目录下的所有项目文件 SHALL 移动到项目根目录。

#### Scenario: 移动所有文件到根目录
- **WHEN** 执行项目结构重组操作
- **THEN** md-editor/src 下的内容移动到根目录 src/
- **AND** md-editor/src-tauri 下的内容移动到根目录 src-tauri/
- **AND** md-editor/package.json 移动到根目录
- **AND** md-editor/vite.config.ts 移动到根目录
- **AND** md-editor/uno.config.ts 移动到根目录

#### Scenario: 删除空目录
- **WHEN** 所有文件移动完成后
- **THEN** md-editor 目录被删除

#### Scenario: 构建功能正常
- **WHEN** 文件移动完成后运行构建命令
- **THEN** Tauri 应用能正常构建