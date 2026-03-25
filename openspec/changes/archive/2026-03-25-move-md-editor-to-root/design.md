## Context

当前项目结构：
```
vault/
├── .opencode/
├── md-editor/          # Tauri + Vue 3 项目
│   ├── src/
│   ├── src-tauri/
│   ├── package.json
│   └── ...
└── openspec/
```

目标结构：
```
vault/
├── .opencode/
├── src/                # 从 md-editor/src 移出
├── src-tauri/          # 从 md-editor/src-tauri 移出
├── package.json        # 从 md-editor/package.json 移出
├── vite.config.ts
├── uno.config.ts
└── openspec/
```

## Goals / Non-Goals

**Goals:**
- 将 `md-editor/` 目录下的所有内容移动到根目录
- 保持项目功能不变
- 确保 Tauri 构建正常工作

**Non-Goals:**
- 不修改应用的业务逻辑代码
- 不添加新功能

## Decisions

1. **直接移动 vs 复制后删除**
   - 选择直接移动 (`mv md-editor/* .`) 并删除空目录
   - 理由：更简洁，不保留冗余副本

2. **配置文件路径**
   - 检查 tauri.conf.json 中的路径配置，如有相对路径需更新
   - 大多数配置已经是相对路径，应该无需修改

## Risks / Trade-offs

- **风险**: 隐藏文件（如 .gitignore）可能需要单独处理
  - **缓解**: 使用 `mv md-editor/.* .` 单独移动隐藏文件，或手动检查

- **风险**: 可能存在硬编码的路径引用
  - **缓解**: 移动后运行构建检查确认