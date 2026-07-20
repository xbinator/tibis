# Shell Tool Phase 2: PTY Auto-Default Interaction Design

## 背景

一期 `run_shell_command` 已实现命令安全分析、风险确认、主进程执行、实时输出、超时、取消和进程树清理。现有 runner 使用 `child_process.spawn` 的管道模式，适合测试、构建、lint 和短脚本，但无法处理需要真实 TTY 的交互式 CLI。

典型问题是命令进入多层 wizard 后等待键盘输入，工具调用会一直挂起，直到命令总超时。第二期需要在不依赖具体 CLI 名称或参数规则的前提下，自动选择 CLI 当前提供的默认选项。

本设计是一期文档 `docs/superpowers/specs/2026-05-24-shell-tool-design.md` 的增量扩展，不改变已有安全分析和普通管道执行语义。

## 目标

- 为 `run_shell_command` 增加显式的自动默认交互模式。
- 使用 PTY 运行交互命令，使单层和多层 wizard 能按真实终端方式工作。
- 自动按 Enter 选择当前高亮或明确标记的默认项。
- 支持 `Y/n`、`y/N` 等带明确默认值的确认提示。
- 不依赖 `skills add`、`npm`、`apt` 等具体 CLI 的命令参数规则。
- 使用保守的启发式检测，避免在 spinner、下载、编译和持续日志输出期间误发 Enter。
- 将自动回答行为作为事件实时展示给用户，但不产生新的确认弹窗。
- 严格区分命令总超时、交互判断超时、不支持的输入和自动回答次数超限。
- 保持现有非交互模式的 stdout/stderr、超时、取消和工具续轮行为不变。

## 非目标

- 不支持用户在聊天界面中输入终端内容。
- 不支持路径、文件名或任意自由文本输入。
- 不支持 Token、API Key、账号、邮箱、用户名或密码输入。
- 不支持模型生成自定义交互答案。
- 不支持后台任务、detach、resume 或持久化终端会话。
- 不实现完整终端 UI。
- 不尝试识别所有 CLI 提示形式。
- 不新增针对某个 CLI 的命令重写规则。
- 不因自动选择默认项而新增一次用户确认。

## 方案比较

### 方案 A：预先写入多次换行

在进程启动后向 stdin 预先写入若干换行。实现简单，但输入会被缓冲，可能被后续非预期提示消费；同时很多 CLI 在非 TTY 环境下不会进入正常 wizard。

不采用。

### 方案 B：按具体 CLI 补充非交互参数

为常见命令补充 `--yes`、`--non-interactive` 等参数。对已知 CLI 有效，但无法覆盖未知工具，且会把通用 ShellTool 变成命令规则目录。

不采用。

### 方案 C：PTY + Screen Snapshot + 保守的自动默认控制器

使用真实 PTY 运行命令，通过 headless terminal 将原始控制序列转换成 Screen Snapshot，再由纯检测器和状态控制器决定是否发送 Enter。该方案支持终端重绘和多层 wizard，并且不依赖具体 CLI 名称。

采用此方案。

## 工具契约

`run_shell_command` 新增可选参数：

```ts
interface RunShellCommandInput {
  shell?: unknown
  command?: unknown
  cwd?: unknown
  timeoutMs?: unknown
  interactionMode?: unknown
  commandId?: unknown
  abortSignal?: unknown
}
```

模型 schema 中只暴露：

```ts
interface RunShellCommandModelInput {
  shell: 'bash' | 'powershell'
  command: string
  cwd?: string
  timeoutMs?: number
  interactionMode?: 'none' | 'auto-default'
}
```

- `none` 是默认值，继续使用现有管道 runner。
- `auto-default` 使用 PTY runner 和自动默认交互控制器。
- `commandId` 和 `abortSignal` 继续由 Runtime 注入，不进入模型 schema。
- 自动回答次数、置信度阈值和判断超时是宿主安全常量，不允许模型覆盖。

## 总体架构

```text
ShellCommandRunner
├── PipeShellProcess
│   └── 现有 child_process.spawn 路径
└── PtyShellProcess
    ├── PtyProcessAdapter
    ├── TerminalSnapshotProjector
    ├── PromptRegionStabilizer
    ├── PromptDetector
    ├── AutoDefaultController
    └── PtyTerminationStrategy
```

各组件保持单一职责：

| 组件 | 职责 | 明确不负责 |
|------|------|------------|
| `PtyProcessAdapter` | PTY 启动、数据订阅、写入、退出和底层终止调用 | 提示识别、自动回答策略 |
| `TerminalSnapshotProjector` | 将 ANSI、光标和终端重绘投影为结构化 Screen Snapshot | 自动回答、PTY 生命周期 |
| `PromptRegionStabilizer` | 从 Screen Snapshot 提取、规范化 prompt region 并计算稳定 hash | 活动判断、置信度评分、PTY 生命周期 |
| `PromptDetector` | 根据快照和近期活动产生纯 `PromptDecision` | 置信度阈值、写入 Enter、进程终止 |
| `AutoDefaultController` | 管理阈值、checkpoint、交互历史、回答上限和 stop request | 直接管理 PTY、平台信号 |
| `PtyTerminationStrategy` | 平台相关的优雅中断、终止和强制终止 | 业务错误映射、提示识别 |
| `ShellCommandRunner` | 编排生命周期、输出、事件、超时和最终结果 | 具体提示规则 |

`AutoDefaultController` 只通过端口发出 `submitEnter` 或 `requestStop` 意图。`PTYRunner` 执行意图，不允许 Controller 持有 PTY 实例。

## 依赖与打包

第二期使用：

- `node-pty@1.1.0`：主进程 PTY 实现，支持 macOS、Linux 和 Windows ConPTY。
- `@xterm/headless@6.0.0`：主进程 headless terminal，用于解析控制序列和维护终端屏幕状态。

依赖只允许从 Electron 主进程加载。

构建配置需要同步调整：

- `postinstall` 对 `better-sqlite3` 和 `node-pty` 一起执行 Electron rebuild。
- `pnpm.onlyBuiltDependencies` 加入 `node-pty`。
- `electron-builder.yml` 确保 `node-pty` 的 `.node` 文件、平台辅助程序和必要资源从 asar 解包。
- Web 平台继续让 `supportsShellCommand()` 返回 `false`，不加载任何 PTY 依赖。

## Screen Snapshot

原始 PTY 数据不直接交给 PromptDetector，也不直接进入 IPC。`TerminalSnapshotProjector` 先通过 headless terminal 应用 ANSI 控制序列、光标移动、清屏和行重绘，再生成结构化快照。

```ts
interface ShellScreenSnapshot {
  sequence: number
  content: string
  cursor: {
    row: number
    column: number
    visible: boolean
  }
  selectedIndex?: number
  activity: {
    spinner: boolean
    progress: boolean
    compiling: boolean
    streamingLogs: boolean
  }
  createdAt: number
}
```

`content` 是规范化后的可见终端画面，不是 terminal buffer，也不是原始输出 diff。

### Prompt Region

`screenHash` 不对整个终端画面直接哈希。`PromptRegionStabilizer` 从 Screen Snapshot 中提取与当前交互相关的稳定 prompt region：

- boolean prompt 保留问题行和必要的相邻上下文。
- wizard 保留标题、可见选项和当前选中项。
- prompt region 之前的安装日志、下载记录和编译输出不参与 hash。
- 无法形成 prompt region 时不创建 checkpoint。

```ts
interface StablePromptRegion {
  content: string
  cursor: {
    row: number
    column: number
    visible: boolean
  }
  selectedIndex?: number
}
```

### 稳定化规则

计算 `screenHash` 前必须执行以下稳定化：

1. ANSI 和终端控制序列已经由 headless terminal 消费，不进入规范化文本。
2. 统一 CRLF/LF 为 LF。
3. 对文本执行 Unicode NFC 归一化。
4. 将不间断空格归一化为普通空格。
5. 删除每行尾部空格和 prompt region 尾部空行。
6. 保留行首缩进、选项标记、选项顺序和当前高亮状态。
7. 光标行、光标列、光标可见性和当前选中项进入 hash 输入。
8. 终端标题、时间戳和 prompt region 之外的历史输出不进入 hash。
9. spinner 帧、百分比、下载速度和 ETA 作为 `active_output` 信号处理，不作为 prompt 身份的一部分。

最终对规范化后的 `StablePromptRegion` 使用项目共享 hash 工具生成 `screenHash`。

同一个 `screenHash` 必须连续保持至少 `promptSettleMs` 才能作为可回答 checkpoint。该稳定窗口只证明 prompt region 身份稳定，不能单独证明进程正在等待输入；是否允许回答仍由 Detector 的提示结构和活动反向信号共同决定。

## Prompt Detection

Detector 是纯函数，只返回观察结论：

```ts
type PromptDecision =
  | {
      type: 'auto_default'
      promptKind: 'boolean_default' | 'wizard_default'
      /** 内部评分，不进入 IPC 和 UI。 */
      confidence: number
    }
  | {
      type: 'unsupported_input'
      reason: 'text' | 'path' | 'account' | 'secret'
    }
  | {
      type: 'active_output'
    }
  | {
      type: 'unknown'
    }
```

所有 `unsupported_input` 和 `auto_default` 判断都只针对稳定 prompt region，不扫描 prompt region 之前的日志文本。日志中出现 “password”、路径或问号不能触发交互判断。

### 固定优先级

Detector 必须按固定顺序判断：

```text
unsupported_input
  > active_output
  > auto_default
  > unknown
```

该顺序意味着：

- 即使画面存在默认按钮，只要同时要求 Token、账号、密码、路径或自由文本，就不得自动回答。
- 即使画面看起来像选择列表，只要 spinner、下载、编译或持续日志仍在活动，就不得自动发送 Enter。
- 只有前两类均不成立时，才评估默认选择。

### 第一版支持的正向提示

- `Y/n`、`y/N`、`[Y/n]`、`[y/N]` 等具有明确默认值的 boolean prompt。
- 当前选项已高亮、按 Enter 可接受默认值的单层 wizard。
- 当前选项已高亮、每次回答后进入新快照的多层 wizard。
- 具有明确当前选中项、明确等待光标且不存在活动输出的列表选择器。

按 Enter 始终选择 CLI 自己声明的默认值。`Y/n` 默认确认，`y/N` 默认拒绝；Tibis 不将 Enter 改写成 `y` 或 `n`。

### 第一版明确拒绝的提示

- 路径、目录、文件名或保存位置。
- Token、API Key、Secret、密码或验证码。
- 账号、邮箱、用户名或登录信息。
- 任意自由文本。
- 没有默认值或没有当前高亮项的选择器。
- Detector 无法保守判定的自定义交互控件。

### 活动输出反向信号

Detector 使用近期快照窗口判断活动，而不是单次文本变化：

- spinner 字符或光标区域持续轮换。
- 百分比、已下载字节、速度或 ETA 持续变化。
- 编译器持续产生新行或重绘状态行。
- tail、watch、dev server 等持续日志。
- 快照更新频率和输出吞吐仍高于稳定窗口阈值。

活动输出期间返回 `active_output`，不启动交互判断超时，也不发送输入。

活动状态需要在最近 `activeOutputWindowMs` 的快照窗口内评估。只有活动信号消失，并且 prompt region 再稳定至少 `promptSettleMs` 后，Detector 才能返回 `auto_default`。

## AutoDefaultController

Controller 接收稳定化后的 prompt observation、`PromptDecision` 和单调时间，不读取原始 PTY 数据。

```ts
interface StablePromptObservation {
  snapshot: ShellScreenSnapshot
  screenHash?: string
  decision: PromptDecision
}

interface AutoDefaultOptions {
  minConfidence: number
  maxAnswers: number
  interactionTimeoutMs: number
  promptSettleMs: number
  transitionSettleMs: number
  activeOutputWindowMs: number
}
```

第一版固定配置：

- `minConfidence = 0.85`
- `maxAnswers = 20`
- `interactionTimeoutMs = 8_000`
- `promptSettleMs = 400`
- `transitionSettleMs = 250`
- `activeOutputWindowMs = 1_000`

Detector 只给出 `confidence`，不能读取或应用阈值。是否自动回答由 Controller 决定。

### Checkpoint

```ts
interface InteractionCheckpoint {
  screenHash: string
  answered: boolean
}

interface InteractionHistoryEntry {
  checkpoint: InteractionCheckpoint
  generation: number
  closed: boolean
}

interface InteractionHistory {
  entries: InteractionHistoryEntry[]
  currentIndex: number
}
```

历史中允许多次出现相同 `screenHash`。数组位置和显式 `generation` 共同表示不同交互轮次，不能只比较最后一次 hash。`closed` 明确标记已通过转换屏障的历史项，避免根据 `answered` 猜测 checkpoint 是否已经离开当前轮次。

### Checkpoint 生命周期

1. **观察**：出现稳定 prompt region 后创建当前 checkpoint，`answered = false`。
2. **回答**：Controller 达到置信度阈值并成功发出 `submitEnter` 意图后，将当前 checkpoint 标记为 `answered = true`。
3. **等待转换**：已回答 checkpoint 禁止再次回答，直到满足转换屏障。
4. **确认转换**：观察到不同的稳定 prompt region，或观察到持续活动输出，并且中间状态持续至少 `transitionSettleMs`，视为已离开当前轮次；当前 history entry 标记为 `closed = true`。
5. **新轮次**：转换后再次出现 prompt 时追加新 checkpoint。即使 `screenHash` 与更早历史相同，也属于新的交互轮次。
6. **结束**：进程退出、Controller 请求停止、命令取消或超时后，冻结历史并释放所有计时器。

单次重绘、光标闪烁或短暂 screen diff 不满足转换屏障，不得创建新 checkpoint。

checkpoint 历史最多保留 40 条，当前 checkpoint 不得被淘汰。超过容量时只淘汰已关闭的最早记录。自动回答次数仍严格限制为 20。

## 自动回答与停止请求

Controller 只产生内部意图：

```ts
type AutoDefaultIntent =
  | { type: 'submit_enter' }
  | {
      type: 'request_stop'
      reason: 'interaction_timeout' | 'answer_limit' | 'unsupported_prompt'
    }
```

- `auto_default` 且 `confidence >= minConfidence`：产生一次 `submit_enter`。
- `unsupported_input`：产生 `request_stop('unsupported_prompt')`。
- `active_output`：继续观察，不启动交互判断超时。
- `unknown`：只在已经进入 prompt-like 等待状态、PTY 仍存活且不存在活动输出时累计交互判断时间。
- prompt-like 状态持续超过 `interactionTimeoutMs`：产生 `request_stop('interaction_timeout')`。
- 已成功回答 20 次：产生 `request_stop('answer_limit')`。

Controller 不直接写 PTY，不发送平台 signal，也不管理宽限期。

## PTY 生命周期与平台终止

```ts
interface PtyTerminationStrategy {
  trackTree(process: PtyProcess): void
  interruptTree(process: PtyProcess): void
  terminateTree(process: PtyProcess): void
  forceTree(process: PtyProcess): void
  isTreeAlive(process: PtyProcess): boolean
  releaseTree(process: PtyProcess): void
}
```

Runner 在收到输出时按固定间隔调用 `trackTree`，累计保存运行期间出现的后代；不能只在停止瞬间读取一次进程表。进程表读取失败必须 fail-closed，最终返回 `process_cleanup_failed`，不得把未知状态当成已清空。

`PTYRunner` 根据操作系统选择策略：

### macOS / Linux

1. 在发送中断前保存当前后代关系，再向 PTY 写入 `Ctrl+C` 请求优雅中断。
2. 等待 3 秒宽限期。
3. 仍未退出时向进程组发送 `SIGTERM`。
4. 再等待 3 秒。
5. 仍未退出时向进程组及已捕获的 detached 后代发送 `SIGKILL`。

### Windows

1. 通过 ConPTY 写入 `Ctrl+C` 请求优雅中断。
2. 等待 3 秒宽限期。
3. 调用 PTY 平台终止能力结束 shell。
4. 再等待 3 秒。
5. 使用 Windows 进程树强制终止策略兜底。

Controller 发出的任何 stop request 都必须进入同一个终止状态机，防止重复安排定时器或多次触发 `finished`。

PTY leader 退出不等于终止完成。存在已捕获后代时必须保留升级定时器；强制终止后仍无法清空进程树时返回 `process_cleanup_failed`，不得把原始 interaction termination 当作已完成结果。

## 运行事件

主进程通过一个有序事件流向 renderer 报告终端状态和自动行为：

```ts
type ShellRunEvent =
  | {
      type: 'terminal_update'
      content: string
    }
  | {
      type: 'auto_answer'
      count: number
    }
  | {
      type: 'finished'
      result: ShellCommandRunResult
    }

interface ShellRunEventEnvelope {
  commandId: string
  sequence: number
  createdAt: string
  event: ShellRunEvent
}
```

事件语义：

- `terminal_update.content` 是最新 Screen Snapshot 的纯文本投影，renderer 原位替换当前终端画面，不把它当作 raw diff 追加。
- `auto_answer.count` 是累计回答次数。renderer 保留该内部状态用于诊断，不插入可见行为行，也不弹出 ConfirmationSheet。
- `finished.result` 冻结 UI 状态，但不替代正常工具结果通道。
- `ShellTool.execute()` 仍等待 runner 完成并返回同一个 `ShellCommandRunResult`，ChatRuntime 仍通过正常 tool-result 继续模型循环。
- 三类事件共享同一 `sequence`，保证显示顺序稳定。
- `terminal_update` 以 50ms 窗口合并，`auto_answer` 与 `finished` 前强制刷新待发送 snapshot。
- 主进程使用由 `runtimeId + toolCallId` 编码的跨 Runtime 唯一 commandId；路由回目标 Session 后恢复原始 toolCallId。
- renderer 找不到对应 `commandId` 时直接丢弃事件，不创建新消息。
- `finished` 必须且只能发送一次。

UI 示例：

```text
Installing package...

Continue?
```

自动选择记录只作为 Tibis 的内部状态保留，不伪装成命令输出、不展示次数，也不产生确认弹窗。

## 结果结构

```ts
type ShellCommandTermination =
  | { kind: 'exit'; exitCode: number }
  | { kind: 'signal'; signal: string }
  | { kind: 'cancelled' }
  | { kind: 'tool_timeout' }
  | { kind: 'interaction_timeout' }
  | { kind: 'answer_limit' }
  | {
      kind: 'unsupported_prompt'
      reason: 'text' | 'path' | 'account' | 'secret'
    }
  | {
      kind: 'process_cleanup_failed'
      message: string
    }
  | {
      kind: 'spawn_error'
      message: string
    }

interface ShellCommandRunResult {
  commandId: string
  shell: 'bash' | 'powershell'
  command: string
  cwd: string
  /** 兼容一期消费方；PTY 模式下由 termination 派生。 */
  exitCode: number | null
  /** 兼容一期消费方；无 signal 时为 null。 */
  signal: string | null
  durationMs: number
  /** 兼容一期消费方，仅 tool_timeout 时为 true。 */
  timedOut: boolean
  truncated: boolean
  outputMode: 'pipes' | 'pty'
  stdout?: string
  stderr?: string
  terminalOutput?: string
  termination: ShellCommandTermination
  autoInteraction?: {
    enabled: boolean
    answerCount: number
    stopReason?:
      | 'completed'
      | 'tool_timeout'
      | 'interaction_timeout'
      | 'answer_limit'
      | 'process_exit'
      | 'unsupported_prompt'
      | 'cancelled'
  }
}
```

- 管道模式提供 `stdout` 和 `stderr`，不提供 `terminalOutput`。
- PTY 模式提供 `terminalOutput`，不伪造 stdout/stderr 分流。
- `autoInteraction` 只在自动默认模式存在，是 optional metadata，不使用裸 `autoAnswerCount`。
- `termination` 是第二期的权威终止语义；`exitCode`、`signal` 和 `timedOut` 为一期兼容字段，必须从 `termination` 确定性派生。
- 非零退出码仍属于命令正常执行完成：`termination = { kind: 'exit', exitCode }`。
- `npm install` 返回 exit code 1 时不能包装成交互错误。

## 超时和失败语义

`TOOL_TIMEOUT` 与 `INTERACTION_TIMEOUT` 必须严格区分：

### TOOL_TIMEOUT

- 从命令启动时开始计算整个 command 生命周期。
- 超过用户归一化后的 `timeoutMs` 即触发。
- 不关心命令是在下载、编译、等待输入还是正常运行。
- 结果使用 `termination.kind = 'tool_timeout'`。

### INTERACTION_TIMEOUT

- 命令和 PTY 仍然存活。
- 已进入 prompt-like 等待状态。
- Detector 长时间只能返回 `unknown`。
- 期间不存在 spinner、下载、编译或持续日志等 `active_output` 信号。
- 结果使用 `termination.kind = 'interaction_timeout'`。

### 工具结果映射

| termination | 工具结果 |
|-------------|----------|
| `exit`，包括非零 exit code | success |
| `signal` | success，保留 signal 供模型判断 |
| `cancelled` | cancelled |
| `tool_timeout` | failure / `TOOL_TIMEOUT` |
| `interaction_timeout` | failure / `INTERACTION_TIMEOUT` |
| `answer_limit` | failure / `INTERACTION_LIMIT_EXCEEDED` |
| `unsupported_prompt` | failure / `UNSUPPORTED_INTERACTION` |
| `process_cleanup_failed` | failure / `PROCESS_CLEANUP_FAILED` |
| `spawn_error` | failure / `EXECUTION_FAILED` |

失败工具结果必须携带有界的运行 metadata 和终端输出，使模型能够区分命令慢、卡在无法判断的交互、要求不支持的输入或 PTY 启动失败。

## 输出边界

- `terminal_update.content` 最多 12,000 个字符，超出时保留尾部。
- `terminalOutput` 复用 `maxOutputChars`，默认最多 20,000 个字符，超出时保留尾部并设置 `truncated = true`。
- 管道模式继续对 stdout 和 stderr 分别应用现有 20,000 字符默认上限。
- UI 只保留最新 terminal snapshot 和最多 20 条 `auto_answer` 行为记录。
- 原始 PTY buffer 不进入 IPC、聊天消息持久化或工具结果。
- Screen Snapshot 更新需要节流和去重，但节流不得改变 `auto_answer` 与 `finished` 的事件顺序。

## 数据流

1. 模型调用 `run_shell_command`，设置 `interactionMode: 'auto-default'`。
2. ShellTool 完成现有输入校验、工作区边界和安全分析。
3. 命令按现有安全策略决定是否展示命令确认；自动回答本身不新增确认。
4. ShellTool 调用主进程 `runShellCommand`。
5. Runner 根据 `interactionMode` 选择 PTY 路径。
6. PTY 数据进入 headless terminal，生成 Screen Snapshot。
7. Detector 按固定优先级产生 `PromptDecision`。
8. Controller 根据置信度、checkpoint 和历史决定提交 Enter、继续观察或请求停止。
9. 每次成功提交 Enter 后发出 `auto_answer` 事件。
10. PTY 退出或终止状态机完成后发出唯一的 `finished` 事件。
11. `runShellCommand` Promise 返回同一个最终结果。
12. ShellTool 将结果映射为 success、cancelled 或具体 failure。
13. ChatRuntime 通过正常 tool-result 进入下一轮模型推理。

## UI 行为

- Shell 工具执行区显示最新终端快照。
- `auto_answer` 事件仅更新内部累计状态，不在工具气泡中显示。
- 系统行为不作为 stdout 内容发送给模型。
- 自动回答不触发 ConfirmationSheet。
- `finished` 后冻结终端快照并显示结构化终止摘要。
- 摘要至少区分正常退出、非零退出、signal、命令总超时、交互超时、回答超限和不支持的输入。
- `interactionMode: 'none'` 的 UI 行为保持兼容。

## 测试设计

### PromptDetector 纯单元测试

- 识别 `Y/n`、`y/N` 和等价括号形式。
- 识别单层 wizard 当前默认项。
- 识别多层 wizard 的后续默认项。
- 路径、账号、Token、密码和自由文本返回 `unsupported_input`。
- spinner、下载、编译和 tail 日志优先返回 `active_output`。
- `unsupported_input > active_output > auto_default > unknown` 优先级固定。
- Detector 返回 confidence，但不读取 Controller 阈值。
- ANSI 重绘、CRLF、Unicode、尾部空格和光标闪烁经过稳定化后得到预期 hash。
- 终端窗口尺寸变化不应仅因重排产生重复回答。
- prompt region 之前的日志变化不改变 `screenHash`。

### AutoDefaultController 状态测试

- confidence 低于 0.85 时不提交 Enter。
- 同一 checkpoint 只能回答一次。
- 单次 screen diff 或光标闪烁不创建新 checkpoint。
- 离开 prompt 后返回相同 hash 会追加新的历史 checkpoint。
- 历史中允许相同 hash 出现多次，每个轮次独立回答。
- checkpoint 历史最多 40 条，当前 checkpoint 不被淘汰。
- 多层 wizard 产生单调递增的 `auto_answer.count`。
- 回答达到 20 次后发出 `answer_limit` stop request。
- `active_output` 不累计交互判断超时。
- Controller 不直接调用 PTY 生命周期或平台终止方法。
- 结束后所有内部 timer 和 checkpoint 引用均被释放。

### PTY Runner 测试

- 通过可注入 PTY factory 验证启动、数据、写入和退出。
- `terminal_update → auto_answer → finished` 事件顺序稳定。
- `finished` 在每条终止路径中只发送一次。
- 用户取消、工具总超时、交互超时、不支持提示和回答超限都进入同一个终止状态机。
- macOS/Linux 策略按 interrupt → SIGTERM → SIGKILL 顺序降级。
- Windows 策略按 ConPTY interrupt → terminate → process-tree force terminate 顺序降级。
- 正常退出不会触发额外终止调用。
- 非零退出码保留为 `termination.kind = 'exit'`。
- `terminalOutput` 和 terminal snapshot 严格执行长度限制。

### PTY Cleanup 测试

以下每条路径都必须验证进程、timer、listener、headless terminal 和 active command registry 已清理：

- 正常 exit 0。
- 正常非零 exit。
- 用户取消。
- `TOOL_TIMEOUT`。
- `INTERACTION_TIMEOUT`。
- `UNSUPPORTED_INTERACTION`。
- `INTERACTION_LIMIT_EXCEEDED`。
- PTY spawn error。
- renderer 监听器断开。
- graceful interrupt 成功退出。
- graceful interrupt 无效后强制结束进程树。

测试需要验证 active command registry 最终为空、所有 disposable 只释放一次、终止宽限期 timer 全部清除，并在可观测平台上确认子进程树不再存活。

### 本地集成 Fixture

仓库内提供不访问网络的本地 fixture：

- 单次 boolean prompt。
- 多层默认 wizard。
- 重复返回相同画面的 wizard。
- 要求路径输入。
- 要求账号和密码。
- 永不结束的 spinner。
- 持续下载进度模拟。
- 持续编译或 tail 日志模拟。
- 存活但保持未知 prompt-like 状态的进程。

fixture 必须在 PTY 中运行，避免把普通 pipe 行为误当成交互能力。

### Renderer 与 ChatRuntime 回归

- `terminal_update` 原位更新对应 Shell 工具显示。
- `auto_answer` 实时更新计数且不出现确认弹窗。
- 找不到对应 `commandId` 时丢弃事件。
- `finished` 不替代正常 tool-result。
- 模型只在最终工具结果返回后继续。
- 非零退出码不会变成交互失败。
- `interactionMode: 'none'` 的 stdout/stderr、超时、取消和进程树清理保持不变。

## Native ABI 验收

`node-pty` 是原生依赖，不能只用 TypeScript 编译成功作为验收。

每个发布平台和架构必须完成：

1. `electron-rebuild` 针对当前 Electron ABI 重建或确认兼容的预编译二进制。
2. 在 Electron 主进程中成功加载 `node-pty`，不能出现 `NODE_MODULE_VERSION` 或动态库加载错误。
3. 启动本地 PTY fixture，接收至少一次输出，写入一次 Enter，并正常退出。
4. 验证打包产物中的原生模块和辅助程序位于可执行、可加载的位置，不被 asar 阻塞。
5. 对每个实际发布的 OS/arch 组合执行 packaged artifact smoke test。

开发环境 Node 进程直接 `import node-pty` 成功不能替代 Electron ABI 验收。

## Release Gate

第二期进入发布分支前必须同时满足：

- Shell 相关纯单元测试全部通过。
- PTY runner、cleanup 和本地 fixture 集成测试全部通过。
- Renderer/ChatRuntime 回归测试全部通过。
- `pnpm exec tsc --noEmit` 通过。
- `pnpm lint` 通过。
- `pnpm electron:build-main` 通过。
- 每个发布平台完成 Electron 主进程 native ABI smoke test。
- 每个发布平台完成 packaged artifact PTY smoke test。
- 普通 pipe 模式回归通过。
- 不存在 active command registry、timer、listener、headless terminal 或子进程树泄漏。
- `finished` exactly-once 约束在全部终止路径通过。

以下任一情况必须阻止发布：

- node-pty ABI 不匹配或原生模块无法加载。
- 打包后 PTY 辅助程序不可执行。
- 任一终止路径残留进程树。
- 同一 checkpoint 重复发送 Enter。
- `active_output` 期间发生自动回答。
- Token、密码、账号、路径或自由文本提示被自动填写。
- `TOOL_TIMEOUT` 与 `INTERACTION_TIMEOUT` 无法在结果中区分。
- `finished` 重复发送或正常 tool-result 未返回。

## Rollout

- `interactionMode` 缺省为 `none`，不会改变现有调用。
- 当前阶段是 internal-only prototype；默认不向模型暴露 `auto-default`。
- 只有 `TIBIS_SHELL_AUTO_DEFAULT_CAPABILITY` 精确匹配当前 `platform-arch:v1` release verification token 时，模型 schema 才暴露 `auto-default`。
- capability 同时在 ShellTool executor 和主进程 runner 校验，避免旧 schema 缓存或直接 IPC 请求绕过。
- `v1` token 只可在 native ABI、prompt safety、checkpoint re-entry、进程树 cleanup 和 packaged artifact smoke 全部通过后为对应平台签发。
- 自动默认模式仍经过现有 Shell 安全分析和工作区约束。
- 自动回答不产生新的用户确认，但 UI 必须通过事件明确展示系统行为。
- 若平台 PTY 不可用，工具返回明确的 `EXECUTION_FAILED`，不得静默降级为向 stdin 预写换行。
- 发布后重点记录 `interaction_timeout`、`unsupported_prompt`、`answer_limit` 和强制终止次数，用于调整启发式，但日志不得包含秘密输入内容。

## 验收标准

第二期完成时，以下场景必须成立：

1. 一个包含多个默认选择页面的本地 wizard 能在单次 Shell tool call 内连续完成。
2. 每个默认选择只发送一次 Enter，并产生实时 `auto_answer` 事件。
3. spinner、下载、编译和持续日志运行期间不会自动按 Enter。
4. 路径、账号、Token、密码和自由文本提示不会被自动回答。
5. 回到相同画面时，只有经过有效转换屏障才会作为新的交互轮次回答。
6. 命令总超时和交互判断超时返回不同 termination 与工具错误码。
7. 非零退出码保持普通执行结果。
8. 所有退出和失败路径都完成 PTY、timer、listener、terminal 和进程树清理。
9. 用户能在 Shell 工具 UI 中实时看到终端状态和累计自动选择次数，不会出现额外确认弹窗。
10. 最终结果仍通过正常 ChatRuntime tool-result 返回，大模型能够继续回答。
11. 每个发布平台的开发环境和打包产物都通过 Electron native ABI 验收。

## 实现状态（2026-07-20）

代码层已经完成 pipe/PTY dispatch、Screen Snapshot、保守 detector、checkpoint re-entry、结构化结果、有序 UI 事件、跨 Runtime 路由、原生依赖延迟加载和进程树清理，并覆盖单层确认、多层 wizard、相同画面重入、活动输出、不支持输入、timeout 区分、leader 先退出与 detached 后代测试。

`pnpm shell:pty:smoke` 和 `pnpm shell:pty:packaged-smoke` 已在当前 macOS arm64 通过。发布工作流已把 Shell 测试、静态检查、开发 Electron ABI smoke 和 packaged artifact smoke 接入 macOS arm64、macOS x64、Windows 与 Linux matrix；其余平台 CI 和打包产物实际通过前，`auto-default` 仍保持 internal-only，不视为已完成公开 release gate。具体矩阵见 `docs/release/shell-pty-release-gate.md`。
