# Glob 与 Grep 工具设计

## 背景

Tibis 已经有一组主进程 AI 工具，用于读取文件、读取目录、写入文件、编辑文件、查询日志和操作 WebView。当前工具集还缺少两个常见的代码导航能力：

- 按 glob 风格的路径模式列出文件
- 按正则表达式搜索文件内容

最初参考对象是 opencode 的 `glob` / `grep` 工具，但 Tibis 已确认采用不同方向：不依赖 `rg`，不自动检测并切换 `rg` 与 `grep`，也不在这一阶段打包 ripgrep。Tibis 会暴露相同的高层工具名，但实现上使用受控的 Node 遍历层和系统 `grep` 做内容搜索。

## 目标

- 新增名为 `glob` 和 `grep` 的内置主进程工具。
- 两个工具都注册在 `shared/ai/tools/FileReadTool/index.ts`。
- 两个工具都通过 `electron/main/modules/chat/runtime/tools/FileTool/index.mts` 分发执行。
- `glob` 使用 Node 目录遍历和 `picomatch` 实现路径匹配。
- `grep` 只使用系统 `grep` 命令实现。
- 新增通用 `SubprocessRunner`，统一处理 spawn、AbortSignal、timeout、kill process group、stdout / stderr 上限和生命周期管理。
- 将搜索后端隔离到小型适配层里，后续替换为 `rg` 或 bundled ripgrep 时不需要修改工具 registry 契约。
- 扫描前执行工作区路径边界检查。
- 读取工作区外绝对路径前请求用户确认。
- 无条件排除 `.git` 目录。
- 结果最多返回 100 条，通过额外读取第 101 条设置 `truncated`。
- grep 候选文件按遍历流分批送入子进程，不一次性构建完整候选数组。
- 取消或超时时 kill 当前活跃的 `grep` 子进程。
- 限制 stdout 和 stderr 缓冲区大小，避免无界内存占用。
- 返回便于模型和 UI 使用的结构化结果。

## 非目标

- 本阶段不打包 ripgrep。
- 不调用 `rg`。
- 不自动检测搜索后端。
- 不承诺 opencode 或 ripgrep 的正则语义。
- 不使用系统 `grep` 实现文件 glob 列表。
- 不新增 renderer-local 工具。
- 不修改现有 shell 工具。
- 不新增网络下载、二进制缓存或平台包管理逻辑。
- 不把现有 shell 工具迁移到新的 `SubprocessRunner`。首版只让 `grep` 使用该 runner，后续再按需要复用。

## 工具契约

`glob` 输入：

```ts
interface GlobToolInput {
  pattern: string;
  path?: string;
}
```

`pattern` 是文件路径 glob，会匹配相对工作区或相对搜索根目录的路径。首版支持 `*`、`?` 和 `**` 路径匹配。`glob` 不通过 `pattern` 暴露正则匹配能力。

`glob` 输出：

```ts
interface GlobToolResult {
  path: string;
  files: string[];
  count: number;
  truncated: boolean;
  incomplete: boolean;
  warnings: FileSearchWarning[];
  warningsTruncated: boolean;
  skippedWarningCount: number;
  elapsedMs: number;
}

interface FileSearchWarning {
  path?: string;
  reason: string;
}
```

`grep` 输入：

```ts
interface GrepToolInput {
  pattern: string;
  path?: string;
  include?: string;
}
```

`pattern` 会作为扩展正则传给系统 `grep -E`。`include` 是文件 glob，由 Tibis 在启动 `grep` 前过滤候选文件；它不会传给各平台差异较大的 `grep --include` 参数。

`grep` 输出：

```ts
interface GrepToolMatch {
  path: string;
  line: number;
  text: string;
}

interface GrepToolResult {
  path: string;
  matches: GrepToolMatch[];
  count: number;
  truncated: boolean;
  incomplete: boolean;
  warnings: FileSearchWarning[];
  warningsTruncated: boolean;
  skippedWarningCount: number;
  elapsedMs: number;
}
```

两个工具都使用 `runtime: 'main'`、`group: 'file'`、`riskLevel: 'read'`、`permissionCategory: 'system'` 和 `exposure: 'conditional-readonly'`。

## 架构

实现会在主进程工具层新增两个 helper 模块：

- `electron/main/modules/chat/runtime/tools/file-search.mts`
- `electron/main/modules/chat/runtime/tools/subprocess-runner.mts`

`file-search.mts` 负责：

- 递归文件遍历
- `excludedDirs` 排除
- glob 匹配
- 结果数量限制
- 非致命读取错误 warning
- grep 分批执行
- 将 grep 输出解析为结构化 match

`subprocess-runner.mts` 负责：

- spawn 子进程
- 绑定 `AbortSignal`
- 处理 timeout
- kill 子进程或进程组
- 限制 stdout / stderr 字节数
- 汇总退出码、signal、stdout、stderr 和耗时

`FileTool/index.mts` 仍然作为编排层。它负责校验工具输入、通过现有路径 helper 解析读取目标、对工作区外绝对路径请求确认，并把具体搜索执行委托给 `file-search.mts`。

为未来替换后端预留一个内部接口：

```ts
interface RuntimeContentSearchBackend {
  search(input: RuntimeGrepSearchInput, signal: AbortSignal): Promise<RuntimeGrepSearchResult>;
}
```

首版实现是 `grep` 后端。未来如果新增 ripgrep 后端，只需要实现同一个接口，不需要修改公开的 `glob` / `grep` 工具 schema 或 `FileTool` 分发结构。

`SubprocessRunner` 是比搜索后端更底层的通用能力。首版只服务 `grep`，但接口应避免写死 grep 概念，使未来的 ripgrep、git、fd 或其它主进程命令型工具可以复用。

文件遍历 API 优先使用内部 async generator，例如：

```ts
async function* walkRuntimeFiles(input: RuntimeFileWalkInput): AsyncGenerator<RuntimeFileWalkBatch> {
  // 每次 yield 一个文件批次和本批次产生的 warning。
}
```

工具最终仍返回数组结果，但内部用批次流转，避免大型 monorepo 下一次性保存几十万候选文件路径。这个遍历器后续也可以复用于 replace、index 或其它文件级工具。

## 路径与权限模型

两个工具复用 `electron/main/modules/chat/runtime/tools/paths.mts` 中已有的只读目标策略。

规则：

- 没有 workspace root 时，相对路径非法。
- 相对路径基于 workspace root 解析。
- 逃逸工作区的相对路径直接返回 `PERMISSION_DENIED`，不请求用户确认。
- 位于工作区内的绝对路径允许读取。
- 位于工作区外的绝对路径需要以 read 风险请求用户确认。
- `glob` 要求解析后的目标是目录。
- `grep` 接受解析后的目标是文件或目录。
- `unsaved://` 路径会被拒绝，因为这两个工具只操作文件系统路径。

确认请求需要展示解析后的目标路径，并说明模型想要搜索本地文件系统内容。

## Glob 行为

`glob` 使用 Node 文件系统 API 遍历目标目录。它只返回文件，不返回目录。返回路径统一为绝对路径，并按路径排序以保证输出稳定。

遍历规则：

- 进入子目录前跳过 `.git` 目录
- 忽略非文件、非目录条目
- 遵循 `fs.readdir` 和 `fs.stat` 的文件系统行为
- 收集到 101 个匹配文件后停止

当找到 101 个匹配项时，工具返回前 100 个，并设置 `truncated: true`。

如果遍历某个子目录失败，工具跳过该子目录，保留已找到的文件，并把失败路径与原因加入 `warnings`。此时 `incomplete: true`。当只是结果超过上限时，也设置 `incomplete: true`，同时保留 `truncated: true` 表示不完整原因是数量截断。`warnings` 默认最多返回 20 条，超出后设置 `warningsTruncated: true`，并通过 `skippedWarningCount` 返回被省略数量。

glob matcher 使用直接依赖 `picomatch`，不要从 `pnpm-lock.yaml` 的传递依赖中隐式导入。工具文档只承诺支持本工具需要的路径匹配能力：

- `*` 匹配单个路径段内的任意字符
- `?` 匹配单个路径段内的一个字符
- `**` 跨路径段匹配
- 路径分隔符统一规范化为 `/`

由于底层使用成熟 matcher，`**/*.{ts,tsx}` 等社区常见写法可以自然工作，但公开契约先只承诺 `*`、`?` 和 `**`，避免把所有高级 glob 语法变成长期兼容承诺。

## Grep 行为

`grep` 会按流式遍历构建候选文件批次，而不是先保存完整候选数组：

- 如果目标是文件，且它满足 `include`，候选列表只包含这个文件
- 如果目标是目录，递归遍历文件并跳过 `.git`
- 如果传入 `include`，Tibis 使用 `picomatch` 过滤候选文件
- 遍历器按批次产出候选文件，默认每批 64 个文件
- 已经获得足够 match 后停止继续遍历和启动新批次
- 候选生成过程必须响应取消

命令后端只使用系统 `grep`。命令形态为：

```text
grep -H -n -E -- <pattern> <file...>
```

实现需要按配置化批次执行文件，避免命令行参数过长。每个批次对应一个独立子进程。如果某个批次已经达到 match 上限，则不再启动后续批次。默认 `batchSize` 为 64，测试可以注入更小值，未来也可以按平台调整。

输出解析器读取如下形态的行：

```text
path:line:text
```

解析规则必须明确：

- 优先使用当前 grep 批次的候选文件路径匹配 `path:` 前缀，再解析紧随其后的 `line:`。
- 没有候选文件上下文时，才退回到从左往右寻找首个可解析的 `:<数字>:` 片段。
- `line` 部分必须全部为数字。
- `path` 可以包含 `:`。
- `text` 可以包含任意字符，包括 `:`。
- 无法安全解析的行直接跳过，而不是让整个工具失败。

退出码处理：

- `0` 表示当前批次找到匹配项。
- `1` 表示当前批次没有匹配项。
- `2` 或其他非零退出码表示 grep 执行失败。

如果 stderr 表明正则解析失败，应返回 `INVALID_INPUT`。其他批次执行失败先降级拆成单文件 grep，尽量保留可读取文件的匹配结果；单文件仍失败时跳过该文件并加入 `warnings`。此时工具结果设置 `incomplete: true`。系统缺少 `grep`、取消、总超时、stdout/stderr 超过上限仍作为硬失败处理。

grep stdout 必须流式解析。达到 `limit + 1` 条匹配后主动终止当前子进程，用第 101 条只判断 `truncated: true`，避免高命中搜索先撞到 stdout 缓冲上限。

## 进程限制与取消

`grep` 子进程执行必须有明确边界。

默认限制：

- 结果上限：100 条 match
- 批次大小：64 个文件
- stdout 上限：1 MiB
- stderr 上限：64 KiB
- 单次工具超时：30 秒
- 单行文本上限：2 KiB
- 排除目录：`['.git']`

进程 runner 必须：

- 创建支持 `AbortController` 的执行路径
- 取消时 kill 当前活跃子进程
- 超时时 kill 当前活跃子进程
- 取消或超时时等待子进程 `close`，必要时用 `SIGKILL` 兜底清理进程组
- 取消或超时后停止启动新批次
- 超时时返回 `TOOL_TIMEOUT`
- stdout 或 stderr 超过上限时返回 `EXECUTION_FAILED`
- 返回 `elapsedMs`，供工具结果、UI 展示和 profiling 使用

在类 Unix 系统上，runner 应使用 `detached: true` 启动子进程，并通过 `process.kill(-pid)` kill 整个进程组。在 Windows 上，退化为直接 kill 子进程。这与现有命令执行代码中的更安全生命周期模式一致，同时把实现范围限制在文件搜索功能内部。

`excludedDirs` 首版默认只包含 `.git`。它需要作为内部配置存在，而不是散落在遍历逻辑里。后续如果要扩展 `.hg`、`.svn` 或项目级忽略目录，可以在配置层调整。

## 错误处理

稳定失败场景：

- `pattern` 为空：`INVALID_INPUT`
- `path` 无效：`INVALID_INPUT`
- 相对路径逃逸工作区：`PERMISSION_DENIED`
- `glob` 目标不是目录：`EXECUTION_FAILED`
- `grep` 目标既不是文件也不是目录：`EXECUTION_FAILED`
- grep 正则无效：`INVALID_INPUT`
- 系统缺少 `grep`：`EXECUTION_FAILED`
- grep 超时：`TOOL_TIMEOUT`
- 输出超过上限：`EXECUTION_FAILED`
- 用户拒绝工作区外确认：返回 cancelled result

非致命场景：

- 遍历某个子目录失败：跳过该目录，结果中返回 `warnings`
- grep 某个文件失败：跳过该文件，结果中返回 `warnings`
- 结果数量达到上限：返回前 100 条并设置 `truncated: true`

工具不应泄漏原始 stack trace。错误消息应简短且可操作。

## Registry 与 Renderer 暴露

共享 registry 改动：

- 新增 `GLOB_TOOL_NAME = 'glob'`。
- 新增 `GREP_TOOL_NAME = 'grep'`。
- 新增 `globToolRegistryEntry`。
- 新增 `grepToolRegistryEntry`。
- 从 `shared/ai/tools/index.ts` 导出两个工具名。
- 将两个 entry 加入 `TOOL_REGISTRY`，位置靠近 `readDirectoryToolRegistryEntry`。

Renderer 侧仍通过 `src/ai/tools/catalog/runtimeTools.ts` 保持 schema-only 行为。因为工厂映射已经从 `TOOL_REGISTRY` 派生，把 entry 加入 registry 后应自动暴露 schema-only runtime factory。可以额外添加命名导出，便于使用和测试。

## 测试计划

测试需要先于实现编写。

Registry 测试：

- `TOOL_REGISTRY` 包含 `glob` 和 `grep`。
- `getToolNamesByRuntimeGroup('main', 'file')` 包含两个工具。
- `getToolNamesByExposure('conditional-readonly')` 包含两个工具。
- renderer runtime factory map 从共享 registry 派生出两个 schema。

依赖检查：

- 新增直接依赖 `picomatch`，不依赖传递依赖。

主进程工具测试：

- `glob` 能列出匹配 `**/*.ts` 的文件。
- `glob` 能列出匹配 `**/*.{ts,tsx}` 的文件。
- `glob` 会排除 `.git` 下的文件。
- `glob` 会拒绝文件目标。
- `glob` 会拦截逃逸工作区的相对路径，且不请求确认。
- `glob` 搜索工作区外绝对目录前会请求确认。
- `glob` 超过 100 个结果时返回 `truncated: true`。
- `glob` 返回 `elapsedMs`。
- `grep` 能按 `grep -E` 正则语法找到文本。
- `grep` 返回行号和文本。
- `grep.include` 会在执行前过滤候选文件。
- `grep` 按批次消费候选文件，不一次性保存完整候选列表。
- `grep` 使用配置化 `batchSize`。
- `grep` 能解析路径中包含 `:` 的输出行。
- `grep` 会排除 `.git`。
- `grep` 会把无效正则映射为 `INVALID_INPUT`。
- `grep` 会拦截逃逸工作区的相对路径，且不请求确认。
- `grep` 搜索工作区外绝对文件或目录前会请求确认。
- `grep` 超过 100 个 match 时返回 `truncated: true`。
- `grep` 返回 `elapsedMs`。
- `grep` 超时时会 kill 子进程并返回 `TOOL_TIMEOUT`。
- `grep` stdout 或 stderr 超过上限时返回稳定失败。

超时和输出上限测试应使用注入的搜索配置，或窄范围导出 helper，避免测试等待 30 秒或分配大缓冲区。

## 发布说明

本设计刻意把内容搜索工具命名为 `grep`，因为已确认后端是系统 `grep`。工具描述不应声称自己兼容 ripgrep。工具描述必须告诉模型：`pattern` 使用系统 `grep -E` 语义。

helper 边界的设计目标，是让后续新增 ripgrep 后端时不需要改变：

- 公开工具名
- registry entry
- renderer schema-only transport
- 主进程分发
- 路径权限流程

未来改造只需要替换内部内容搜索后端，并在语义变化时同步更新工具描述。
