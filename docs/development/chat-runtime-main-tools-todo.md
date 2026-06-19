# ChatRuntime Main Tools TODO

## Goal

将 BChat 工具执行逐步收敛到主进程 ChatRuntime：主进程负责工具语义、权限确认、路径解析和结果结构，renderer 仅通过 bridge 提供 UI/编辑器状态快照或执行必要的 UI 写入动作。

## Current Status

- [x] `read_current_document`：主进程执行，renderer bridge 提供当前文档快照。
- [x] `read_current_drawing`：主进程执行，renderer bridge 提供当前画板快照。
- [x] `read_current_webpage`：主进程执行，renderer bridge 提供当前 WebView 快照。
- [x] `get_current_time`：主进程执行。
- [x] `query_logs`：主进程读取日志。
- [x] `read_file`：主进程执行，优先通过 bridge 读取已打开编辑器或 `unsaved://` 草稿内容，必要时读取工作区文件。
- [x] `read_directory`：主进程执行，读取工作区目录。
- [x] `get_settings`：主进程执行，renderer bridge 提供设置快照。
- [x] `open_resource`：主进程执行，renderer bridge 执行打开文件、WebView 或外部链接动作。
- [x] `update_settings`：主进程执行，主进程确认后 renderer bridge 应用设置。
- [x] `create_document`：主进程执行，renderer bridge 创建并打开未保存草稿。
- [x] `write_file`：主进程执行，主进程解析路径和确认，renderer bridge 仅写入已打开编辑器或未保存草稿。
- [x] `edit_file`：主进程执行，主进程精确匹配、替换和确认，复用文件内容 bridge 写回。

## Remaining TODO

### Task 1: 收敛 Drawing 运行逻辑

- [x] 主进程新增 `electron/main/modules/chat/runtime/drawing-runtime.mts`，承载空画板创建、操作应用、草稿内容序列化和结果组装逻辑。
- [x] renderer `src/ai/tools/builtin` 不再保留 Drawing 执行器，仅通过 `src/ai/tools/catalog/runtimeTools.ts` 暴露 schema-only 工具定义。
- [x] 补充 `test/ai/tools/builtin-main-process-tool.test.ts`，确保迁移后的工具仍能注册 schema，且不会在 renderer 本地执行。

### Task 2: 迁移 `create_drawing`

- [x] 在 `test/electron/main/modules/chat/runtime/stream-executor.test.ts` 添加 RED 测试，证明 `create_drawing` 应由 main executor 执行。
- [x] 在 `electron/main/modules/chat/runtime/stream-executor.mts` 将 `create_drawing` 加入 `MAIN_PROCESS_TOOL_NAMES`。
- [x] 在 `src/components/BChat/utils/runtimeBridge.ts` 复用或扩展 `open-draft` bridge，用于创建 `.tibis` 未保存画板草稿。
- [x] 在 `electron/main/modules/chat/runtime/service.mts` 添加 `create_drawing` 分支：归一化标题、应用初始 operations、生成草稿内容、调用 `open-draft` bridge、返回 Drawing 结果。
- [x] 更新 `changelog/2026-06-19.md`。
- [x] 验证：运行 stream executor、runtime bridge、Drawing tool 测试。

### Task 3: 迁移 `apply_drawing_operations`

- [x] 在 `test/electron/main/modules/chat/runtime/stream-executor.test.ts` 添加 RED 测试，证明 `apply_drawing_operations` 应由 main executor 执行。
- [x] 在 `test/components/BChat/runtime-bridge.test.ts` 添加 bridge 测试，覆盖读取当前画板数据和写回当前画板数据。
- [x] 在 `src/components/BChat/utils/runtimeBridge.ts` 增加 `apply-drawing-data` 或等价 bridge kind，renderer 只负责替换当前画板数据。
- [x] 在 `electron/main/modules/chat/runtime/service.mts` 添加 `apply_drawing_operations` 分支：通过 `drawing-snapshot` 读取当前数据，主进程应用 operations，发起确认，确认后调用 bridge 写回。
- [x] 更新 `changelog/2026-06-19.md`。
- [x] 验证：运行 Drawing tool、runtime bridge、stream executor 测试。

### Task 4: 梳理 MCP Settings 工具来源

- [x] 阅读 `src/ai/tools/builtin/MCPTool` 相关实现，确认 `get_mcp_settings` 和写操作当前依赖的 store/API。
- [x] 判断 MCP 配置是否可直接主进程读取；如果不行，先定义 bridge 快照和应用动作。
- [x] 在 TODO 文档中补充 MCP 迁移的最终代码路径和测试路径。

结论：

- 现有 renderer MCP 工具位于 `src/ai/tools/builtin/MCPTool/index.ts`，读写配置通过 `useToolSettingsStore()`，store 底层持久化走 `src/shared/storage/tool-settings/sqlite.ts`。
- 主进程直接按 `src/shared/storage/tool-settings/types.ts` 的 MCP 数据模型读取/写入 `~/.tibis/settings.json`；renderer `toolSettingsStorage` 会穿过 `native` 抽象，不在主进程直接 import。
- `refresh_mcp_discovery` 可直接调用 `electron/main/modules/mcp/session.mts` 的 `refreshMcpDiscovery(server)`，不需要经由 preload IPC。
- 迁移代码落点：优先先放入 `electron/main/modules/chat/runtime/service.mts` 的 main tool 分支，后续 Task 7 再按 `electron/main/modules/chat/runtime/tools/**/index.mts` 文件夹结构拆分。
- 测试落点：先补 `test/electron/main/modules/chat/runtime/stream-executor.test.ts` 的 main executor 路由测试；涉及入口分发的细粒度逻辑在 Task 7 抽出后补 `test/electron/main/modules/chat/runtime/main-tools.test.ts`。

### Task 5: 迁移 MCP 只读工具

- [x] 为 `get_mcp_settings` 添加 stream executor RED 测试。
- [x] 将 `get_mcp_settings` 加入 main-process tool 集合。
- [x] 在主进程实现读取逻辑或 bridge 快照逻辑。
- [x] 更新 changelog 并运行相关测试。

### Task 6: 迁移 MCP 写工具

- [x] 依次迁移 `add_mcp_server`、`update_mcp_server`、`remove_mcp_server`、`refresh_mcp_discovery`。
- [x] 每个工具先写 RED 测试，再加 main-process 路由，再实现确认和执行。
- [x] 对写操作保留现有确认文案和风险等级。
- [x] 更新 changelog 并运行 MCP 工具相关测试。

### Task 7: 抽出 main tools executor

- [x] 先移除 `electron/main/modules/chat/runtime/service.mts` 对 renderer `src/` 模块的直接 import，避免 Electron main 编译在 `src/` 下生成旁路 `.js` 文件。
- [x] 新增主进程边界测试，禁止 ChatRuntime main runtime 源码再直接 import `src/` 模块。
- [x] 新建 `electron/main/modules/chat/runtime/tools/**/index.mts` 文件夹结构。
- [x] 将 `service.mts` 中的工具常量、输入归一化、bridge payload guard、工具执行分支迁移到 `tools/**/index.mts`。
- [x] 在 `service.mts` 中只保留 runtime 生命周期、pending bridge/confirmation 管理和 executor 注入。
- [x] 新建 `test/electron/main/modules/chat/runtime/main-tools.test.ts`，覆盖主进程工具入口分发、bridge 依赖和未知工具失败。
- [x] 确认 `service.test.ts` 仍覆盖 runtime 生命周期和 bridge/confirmation 协议。

### Task 8: 移除 renderer 工具执行器

- [x] 新增 `src/ai/tools/catalog/runtimeTools.ts`，集中维护已迁移工具的 schema-only 定义。
- [x] `src/ai/tools/builtin/index.ts` 改为从 catalog 注册主进程工具 schema，renderer `builtin` 目录仅保留 Question、Todo、Memory、Shell、Skill 等本地执行器。
- [x] 删除已迁移工具的 renderer 执行器目录：Document、Drawing、Environment、File、Logs、MCP、OpenResource、Settings、Webpage。

### Task 9: 最终回归

- [x] 运行 BChat runtime 相关测试。
- [x] 运行 Drawing tool 相关测试。
- [x] 运行 MCP tool 相关测试。
- [x] 运行 TypeScript 类型检查。
- [x] 运行 ESLint。
- [x] 检查 `docs/development/chat-runtime-main-tools-todo.md`，把完成项勾选。

## Verification Commands

```bash
pnpm test test/components/BChat/runtime-bridge.test.ts test/electron/main/modules/chat/runtime/stream-executor.test.ts test/electron/main/modules/chat/runtime/service.test.ts test/components/BChat/use-chat-runtime.test.ts -- --runInBand
pnpm test test/ai/tools/builtin-index.test.ts test/ai/tools/builtin-main-process-tool.test.ts test/electron/main/modules/chat/runtime/main-tools.test.ts -- --runInBand
pnpm exec tsc --noEmit
pnpm exec eslint electron/main/modules/chat/runtime/service.mts electron/main/modules/chat/runtime/stream-executor.mts electron/main/modules/chat/runtime/tools/**/*.mts src/ai/tools/builtin/index.ts src/ai/tools/catalog/runtimeTools.ts src/components/BChat/utils/runtimeBridge.ts src/components/BChat/index.vue test/ai/tools/builtin-main-process-tool.test.ts test/components/BChat/runtime-bridge.test.ts test/electron/main/modules/chat/runtime/stream-executor.test.ts test/electron/main/modules/chat/runtime/main-tools.test.ts --ext .mts,.ts,.vue
```
