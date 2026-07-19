# Controlled Interactive Shell Session Design

## Background

`run_shell_command` 目前是一条命令一次执行完成的模型：renderer 发起命令，主进程通过 shell runner 启动子进程，输出通过 `shell:output` 回挂到同一个工具气泡，最终返回一个 `ShellCommandRunResult`。这种模型适合测试、构建、lint 等短命令，但遇到 `npx skills add ...` 这类会等待确认输入的安装命令时，子进程会停在 prompt，直到工具超时。

直接开放一个裸 `bash` / `zsh` / `pwsh` 交互终端会绕开现有安全检查。安全矩阵现在只在命令启动前分析一次；如果 session 内后续输入的每一行不再经过同等策略，就会形成新的高危旁路。

## Goals

- 支持受控交互命令，让固定命令可以接收用户输入，解决安装器、初始化器等等待 stdin 的场景。
- 保持默认 shell 工具路径非交互，避免普通命令意外变成长生命周期 session。
- 交互命令启动前继续执行现有 shell 安全分析，blocker 直接拒绝，warning 继续要求确认。
- 第一版只允许用户从 UI 写入 stdin，不给模型暴露自动写 stdin 的工具能力。
- 输出继续显示在原工具气泡里，退出后仍产生正常工具结果。

## Non-Goals

- 不做开放式终端应用，不允许第一版启动裸 `bash` / `zsh` / `pwsh` / `powershell`。
- 不让 AI 自动回答 `y`、输入密码、选择菜单或粘贴多行命令。
- 不在第一版实现完整终端快捷键、历史记录、标签页、持久会话恢复。
- 不改变覆盖文件、移动文件、配置修改等其他工具已有确认路径。

## User Experience

模型在需要交互时调用 `run_shell_command` 并传入 `interactive: true`。命令通过安全检查和必要确认后，工具气泡展开为一个轻量终端区域：上方持续显示 stdout/stderr，下方出现输入框和发送按钮。用户输入 `y`、数字选项、短文本或回车后，内容写入当前 session 的 stdin。

如果用户输入像 shell 命令或多行脚本，例如包含 `&&`、`;`、管道到 shell、重定向、删除命令等，第一版拒绝写入并提示用户改用新的 `run_shell_command` 调用。这样可以避免交互 session 变成绕过安全策略的第二个命令入口。

## Architecture

`ShellCommandRunRequest` 新增 `interactive?: boolean`。默认值为 `false`，继续使用当前 `child_process.spawn` 路径。`interactive: true` 进入新的 session 路径，使用 PTY 能力启动固定命令，因为许多 CLI 会根据 TTY 状态决定是否显示 prompt。

主进程 shell runner 维护活跃命令表，交互 session 与一次性命令共享 `commandId`、输出 sink、cancel 机制和最终结果结构。新增写入接口只接收 `{ commandId, input }`，runner 在写入前执行轻量输入策略：允许短回答，拒绝多行命令和明显 shell 控制字符。退出时清理 session，后续写入返回明确失败。

IPC 新增 `shell:write-input`，preload 和 native bridge 暴露为 `writeShellCommandInput`。这个 API 只给 renderer UI 使用，不加入 AI 工具 schema。`run_shell_command` 工具 schema 只新增 `interactive` 布尔值，模型不能直接传 stdin。

## Safety

启动阶段沿用现有 `analyzeShellCommandSafety`。此外，交互模式增加两条专属约束：

- 裸 shell 阻断：`bash`、`zsh`、`sh`、`pwsh`、`powershell` 等命令在 `interactive: true` 下直接拒绝。
- stdin 限制：第一版只允许短输入；包含换行、多命令连接符、重定向、删除命令、网络脚本管道等内容拒绝写入。

所有 session 输出和用户输入写入尝试都保留 `commandId` 关联，便于审计。失败的写入不终止进程，用户仍可停止 session 或输入更小范围的回答。

## Testing

主进程 runner 测试覆盖：

- `interactive: true` 使用 PTY 路径并流式输出。
- `writeInput` 能把用户输入写入活跃 session。
- session 退出后写入返回失败。
- 多行或命令式 stdin 被拒绝。
- 裸 shell 交互启动被拒绝。

桥接层通过 TypeScript 检查覆盖类型暴露。前端组件测试覆盖执行中的 interactive shell 工具气泡显示输入控件，并调用 `writeShellCommandInput`。
