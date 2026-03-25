## Why

当前项目结构将 Markdown 编辑器应用放在 `md-editor/` 子目录中，这种结构不够简洁，不利于项目的根目录管理。将项目文件移到根目录可以简化路径引用，提升开发体验。

## What Changes

- 将 `md-editor/` 目录下的所有内容移动到项目根目录
- 删除空的 `md-editor/` 目录
- 更新配置文件中的路径引用（如有需要）
- 确保 Tauri 构建配置正确指向新的项目结构

## Capabilities

### New Capabilities
- 项目结构重组: 将子目录项目提升到根目录

### Modified Capabilities
- (无)

## Impact

- 文件移动：`md-editor/` → 根目录
- 配置文件：可能需要更新 tauri.conf.json 等配置中的路径引用
- 构建脚本：确保构建命令能正确找到项目文件