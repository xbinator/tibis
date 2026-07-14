# AI 文件工具磁盘写入语义设计

## 背景

Tibis 的 `write_file` 和 `edit_file` 已迁移到 ChatRuntime 主进程执行，但真实文件的执行结果仍然取决于文件是否已在编辑器中打开：

- 已打开的真实文件通过 renderer bridge 调用 `replaceDocument()`，只更新编辑器内容。
- 未打开的真实文件在 bridge 返回 `EDITOR_UNAVAILABLE` 后才由主进程调用 `fs.writeFile()`。
- 编辑器默认磁盘保存策略是 `off`，因此工具可能返回成功但磁盘内容没有变化。

这使“工具成功”的含义不稳定，也容易被误判为 Windows 没有执行文件写入。另一个缺口是 `write_file` 创建嵌套文件时不会创建缺失的父目录，最终会以 `ENOENT` 失败。

本设计将真实文件的所有权收回主进程：`write_file` 与 `edit_file` 对真实路径只读取和写入磁盘，不读取或修改编辑器状态。`unsaved://` 没有对应磁盘文件，继续作为唯一的草稿例外通过 renderer bridge 更新。

## 目标

- 真实文件路径下，`write_file` 成功必须表示完整内容已经持久化到磁盘。
- 真实文件路径下，`edit_file` 成功必须表示精确替换后的内容已经持久化到磁盘。
- 真实文件不再使用 `file-content-snapshot` 或 `write-file-content` bridge。
- `write_file` 创建新文件时，在用户确认后递归创建缺失的父目录。
- 将 `atomically` 声明为直接依赖，并使用其 `writeFile()` 完成父目录创建和原子写入。
- `unsaved://` 继续通过 renderer bridge 读取和更新草稿。
- 重写 `read_file`、`read_directory`、`write_file`、`edit_file` 的工具描述，明确各自选择边界和 Windows 路径支持。
- 修正 `read_file` 的公开 Schema，使运行时必需的 `path` 同样成为 Schema 必填项。
- 为真实磁盘写入、缺失父目录、取消确认和草稿例外增加自动化测试。

## 非目标

- 不要求文件工具主动同步或保存已打开编辑器。
- 不要求文件工具解决编辑器未保存内容与外部磁盘写入之间的冲突。
- 不修改现有文件监听与外部变化处理策略。
- 不让 `edit_file` 创建不存在的文件或父目录。
- 不改变 `glob`、`grep`、`create_document` 的行为。
- 不引入 renderer 侧磁盘写入 API。

## CR 修订：并发与真实路径边界

真实文件工具不能把“原子替换”误当成“基于已确认版本的条件写入”。用户确认可能持续较长时间，因此真实路径分支在确认后必须重新读取磁盘状态：

- `write_file` 确认后发现目标的存在状态或已有内容发生变化时，返回 `STALE_CONTEXT`，不覆盖新状态。
- `edit_file` 确认后发现文件被修改或删除时，返回 `STALE_CONTEXT`，不重新创建文件，也不覆盖新内容。
- 同一路径的主进程文件工具在“重新验证 + 原子写入”阶段串行执行，避免并发工具调用读取同一旧版本后互相覆盖。

路径边界必须按真实目的地判断：

- 已存在目标通过 `realpath` 解析文件本身。
- 新文件从目标向上查找最近存在的父目录，解析该目录的 `realpath` 后再拼回缺失路径。
- 真实目的地位于工作区外时，确认风险提升为 `dangerous`，确认文案和结果路径都展示真实目的地；仍位于工作区内时保留原规范化展示路径，避免 macOS `/var` 等系统路径别名造成无意义变化。
- 写入使用已经解析的真实目的地，不在确认后重新跟随原始工作区符号链接。
- 保留原始词法路径，确认后在路径锁内重新解析它并与确认前真实目的地比较；如果已有符号链接被重新指向、缺失父目录被创建为符号链接或真实目的地发生其他变化，返回 `STALE_CONTEXT`。

外部进程仍可能在最终重新验证与系统原子替换之间制造极短的竞态；跨进程强制锁不属于本次范围。当前修订保证用户确认等待窗口和 Tibis 内部并发工具调用不会静默覆盖未经确认的版本。

## 工具契约

### `read_file`

读取一个本地文本文件或 `unsaved://` 草稿，支持通过 `offset` 和 `limit` 分段读取。它用于检查文件内容，也用于在调用 `edit_file` 前获取精确的 `oldString`。

公开 Schema 中 `path` 必填。路径接受：

- 当前工作区相对路径
- POSIX 绝对路径
- Windows 盘符绝对路径，例如 `C:\\workspace\\src\\index.ts`
- Windows UNC 路径
- `unsaved://` 草稿路径

建议描述：

> 读取一个本地文本文件或未保存草稿的内容，支持通过 offset 和 limit 分段读取。需要局部修改文件时，先用此工具获取 edit_file 所需的精确原文。

### `read_directory`

只列出目标目录的直接子项，不递归，也不读取文件内容。需要递归按路径查找文件时使用 `glob`，需要读取正文时使用 `read_file`。

建议描述：

> 列出一个本地目录的直接子项，包括文件和子目录；不递归且不读取文件内容。需要递归查找文件时使用 glob，需要读取正文时使用 read_file。

### `write_file`

输入仍为：

```ts
interface WriteFileInput {
  path: string;
  content: string;
}
```

行为按目标类型区分：

- `unsaved://`：确认后更新对应草稿，成功表示草稿内容已更新。
- 无工作区的相对路径：保留现有降级行为，确认后创建未保存草稿。
- 真实文件路径：确认后把完整 `content` 原子写入磁盘；目标不存在时递归创建父目录。

`write_file` 用于创建文件或有意完整覆盖文件。局部修改应使用 `edit_file`，避免模型重新生成并覆盖未涉及的内容。

建议描述：

> 将完整内容写入目标，用于创建新文件或有意完整覆盖已有文件；局部修改请使用 edit_file。真实文件会直接持久化到磁盘，并在创建新文件时创建缺失的父目录；unsaved:// 只更新草稿。

### `edit_file`

输入保持不变：

```ts
interface EditFileInput {
  path: string;
  oldString: string;
  newString: string;
  replaceAll?: boolean;
}
```

行为按目标类型区分：

- `unsaved://`：读取草稿内容，执行精确替换，确认后更新草稿。
- 真实文件路径：只从磁盘读取当前内容，执行精确替换，确认后原子写回磁盘。
- 无工作区的相对路径：继续失败，因为局部编辑需要一个已存在的真实文件或 `unsaved://` 草稿。
- 文件不存在：失败，不创建文件或目录。
- 找不到 `oldString`：失败。
- 匹配多处且 `replaceAll` 不是 `true`：失败，要求模型提供更精确的原文或显式全量替换。

建议描述：

> 在已有文本文件或未保存草稿中执行精确字符串替换，并保留其他内容。通常先用 read_file 获取准确的 oldString；文件不存在、原文未命中或存在未授权的多处匹配时会失败。真实文件会直接持久化到磁盘。

## 磁盘写入架构

### 主进程拥有真实文件写入

`electron/main/modules/chat/runtime/tools/FileTool/index.mts` 继续作为文件工具编排入口。真实文件分支不再调用 renderer bridge：

```text
write_file(real path)
  → 解析目标路径
  → 解析真实目的地与工作区边界
  → 读取磁盘状态
  → 用户确认
  → 按真实路径串行化并重新验证磁盘状态
  → 创建父目录（仅新文件）
  → 原子写入完整内容
  → 返回成功

edit_file(real path)
  → 解析目标路径
  → 解析真实目的地与工作区边界
  → 从磁盘读取当前内容
  → 精确替换与冲突检查
  → 用户确认
  → 按真实路径串行化并重新验证磁盘状态
  → 原子写入替换后内容
  → 返回成功
```

工具不查询文件是否已打开，也不调用 `replaceDocument()`。如果编辑器打开了同一个文件，后续状态由现有文件监听机制处理。

### 草稿继续使用 bridge

`unsaved://` 没有磁盘路径，因此保留 renderer bridge：

```text
write_file(unsaved://)
  → file-content-snapshot
  → 用户确认
  → write-file-content

edit_file(unsaved://)
  → file-content-snapshot
  → 精确替换与冲突检查
  → 用户确认
  → write-file-content
```

这两条分支的成功只承诺草稿状态更新，不承诺磁盘持久化。

### `atomically` 写入后端

将 `atomically` 加入 `package.json` 的直接依赖。虽然当前 lockfile 已经通过其他包间接包含它，但实现不能依赖未声明的传递依赖。

主进程文件工具通过一个带完整 JSDoc 和明确类型的内部 helper 调用 `atomically.writeFile()`。该依赖负责：

- 自动创建缺失的父目录
- 在目标文件同目录写入临时文件并原子替换
- 串行化同一路径的并发写入
- 保留已有文件的 mode 和 ownership
- 清理失败或进程退出时遗留的临时文件
- 对 Windows 常见的文件占用和权限错误执行有界重试

内部 helper 负责统一 UTF-8 文本参数和错误映射，不重复实现 `mkdir`、临时文件命名、重命名重试或清理逻辑。函数名不超过四个单词。

`write_file` 只有在确认通过后才调用该 helper，用户取消时不能调用 `atomically.writeFile()`，因此不会创建父目录或临时文件。`edit_file` 的目标已经存在，仍复用同一个 helper，但不承担创建业务目标的语义。

## 权限与确认

保留当前路径边界与风险分级：

- 逃逸工作区的相对路径直接拒绝。
- 工作区内创建新文件使用 `write` 风险。
- 覆盖已有文件使用 `dangerous` 风险。
- 工作区外真实文件继续使用 `dangerous` 风险。
- `edit_file` 对工作区内真实文件使用 `write` 风险，对工作区外文件使用 `dangerous` 风险。

确认必须发生在任何磁盘变更之前。`write_file` 创建新文件的确认文案应明确说明可能创建父目录；覆盖文件继续展示磁盘中的旧内容和完整新内容。`edit_file` 的确认文案展示精确的 `oldString` 和 `newString`。

真实文件的确认内容只基于磁盘状态。编辑器中未保存的内容不参与确认，也不会改变工具执行结果。

## 编辑器一致性边界

真实文件写入完成后，工具不主动更新编辑器。由此产生的行为是明确且可接受的设计边界：

- 文件监听器可以把外部磁盘变化同步到已打开编辑器。
- 编辑器存在未保存修改时，外部变化可能覆盖内容或触发现有冲突处理。
- 如果磁盘新内容恰好等于编辑器当前内容，现有 dirty 基线可能不会立即变化；本设计不为文件工具增加编辑器专用修复逻辑。

这一区域后续如需优化，应作为独立的“外部磁盘变化与编辑器冲突协调”设计处理，不能重新让文件工具依赖编辑器才能宣称磁盘写入成功。

## 错误处理

- `atomically.writeFile()` 失败：返回 `EXECUTION_FAILED`，包含底层文件系统消息；临时文件清理由依赖负责。
- 用户确认期间真实文件状态发生变化：返回 `STALE_CONTEXT`，不覆盖、不创建并提示重新读取。
- `edit_file` 目标不存在：返回 `EXECUTION_FAILED`，不创建任何路径。
- 用户取消确认：返回 `cancelled`，不创建目录、临时文件或目标文件。
- `unsaved://` bridge 失败：保留当前 bridge 错误映射。

工具只有在目标状态满足契约后才能返回 `success`：真实路径已经写入磁盘，草稿路径已经更新草稿。

## 测试策略

按照 TDD 先补失败测试，再修改实现。

### Registry 契约测试

在 `test/ai/tools/tool-registry.test.ts` 验证：

- `read_file.parameters.required` 包含 `path`。
- 四个工具描述包含清晰的选择边界。
- `write_file` 描述明确完整覆盖、父目录创建和真实磁盘写入。
- `edit_file` 描述明确精确替换、文件必须存在和真实磁盘写入。

### 主进程真实文件测试

在 `test/electron/main/modules/chat/runtime/main-tools.test.ts` 使用临时目录和真实文件系统验证：

- `write_file` 能创建多级父目录和新文件。
- `write_file` 能覆盖已有真实文件。
- 真实文件写入不调用 renderer bridge。
- `edit_file` 从磁盘读取并精确替换已有文件。
- `edit_file` 不调用 renderer bridge。
- `edit_file` 不创建不存在的文件。
- 用户取消 `write_file` 后不创建父目录或目标文件。
- 用户取消 `edit_file` 后磁盘内容不变。
- `atomically.writeFile()` 失败后不遗留临时文件。

### 草稿回归测试

验证：

- `write_file` 的 `unsaved://` 分支继续通过 bridge 更新草稿。
- `edit_file` 的 `unsaved://` 分支继续通过 bridge 读取和更新草稿。
- 无工作区相对 `write_file` 继续创建未保存草稿。

### Windows 验证

- 真实文件写入统一使用 `atomically.writeFile()`，不手写临时路径或重命名重试。
- 增加 Windows 盘符与 UNC 路径的纯路径测试。
- 在 Windows 环境运行主进程真实文件测试，验证父目录创建、覆盖替换和临时文件清理。

## 文档与日志

实现完成后同步更新：

- `shared/ai/tools/FileReadTool/index.ts`
- `shared/ai/tools/FileWriteTool/index.ts`
- `shared/ai/tools/FileEditTool/index.ts`
- `package.json` 和 `pnpm-lock.yaml`，将 `atomically` 声明为直接依赖
- `docs/ai-tools/tool-development-guide.md`，统一真实文件成功语义
- 当天 `changelog/YYYY-MM-DD.md`

## 验收标准

- `write_file` 对真实路径返回成功后，立即从磁盘读取可以得到完整新内容。
- `edit_file` 对真实路径返回成功后，立即从磁盘读取可以得到精确替换后的内容。
- 真实路径执行期间不依赖 renderer bridge 或编辑器上下文。
- `write_file` 可以创建缺失的多级父目录。
- 用户取消时文件系统没有任何新增或修改。
- `edit_file` 不会创建不存在的文件。
- `unsaved://` 继续只更新草稿。
- 四个工具描述能让模型稳定区分目录浏览、文件读取、完整覆盖和局部编辑。
- ESLint、TypeScript 类型检查及相关 Vitest 测试全部通过。
