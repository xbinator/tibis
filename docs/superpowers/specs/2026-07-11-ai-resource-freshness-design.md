# AI 资源新鲜度设计

## 背景

聊天运行时当前通过 Pinia Store 获取 Skill 和 Widget 定义。目录监听正常时，`SKILL.md` 或 `widget.json` 的磁盘变化会增量更新 Store；监听事件丢失、监听尚未建立或生命周期异常时，Store 会继续保留旧定义，直到页面刷新触发重新扫描。

文档工具采用运行时 bridge 请求编辑器快照，但当前编辑器工具上下文捕获的是注册时的文件状态对象。内容更新会替换该对象，而上下文不会因内容变化重新注册，因此 `getContent()` 也可能返回旧内容。

## 目标

- 应用内保存和外部编辑器直接写盘后，下一次聊天请求能够发现最新 Skill 和 Widget 元数据。
- `skill`、`widget`、`open_widget` 真正执行时，使用对应源文件的最新可解析内容。
- 已打开文档以编辑器内存为事实源，未打开文档以磁盘为事实源。
- 文件监听继续提供低延迟更新，但不再承担最终正确性保证。
- Skill 内容变化后，后续请求不再把旧版本 Skill 指令作为有效上下文发送给模型。
- 不修改已经展示给用户的历史 Widget 快照和历史消息。

## 非目标

- 未保存到磁盘的 Widget 或 Skill 草稿不会自动暴露给聊天。
- 不让 Widget 历史消息随源文件变化而重绘；历史消息记录当时实际展示的快照。
- 不重构通用文件会话去感知 Skill Store 或 Widget Store。
- 不为所有文件类型建立新的通用资源框架，只抽取本次需要的共享新鲜度约定。

## 一致性模型

### 事实源

| 资源 | 事实源 | 缓存用途 |
| --- | --- | --- |
| Skill | `SKILL.md` 磁盘内容 | 列表、启用状态、工具发现 |
| Widget | `widget.json` 磁盘内容 | 列表、启用状态、工具发现 |
| 已打开文档 | 当前编辑器内存 | 编辑器工具上下文 |
| 未打开文档 | 文件磁盘内容 | `read_file` 执行结果 |

Store 是可重建的投影，不是执行时的事实源。启用/禁用状态仍由 Store 和本地持久化设置管理，刷新磁盘定义时必须保留该状态。

### 内容版本

Skill 和 Widget 的解析结果增加由完整源文本计算的稳定 `contentHash`。同一内容必须产生相同 hash，内容变化必须产生不同 hash。hash 用于：

- 判断 watcher 推送与主动读取是否为同一内容版本；
- 标记 Skill 工具结果所使用的版本；
- 在准备下一轮运行时消息时识别已经过期的 Skill 指令。

## 数据流

### 目录监听

应用启动后在默认布局级别初始化 Skill 和 Widget 资源监听，监听职责不再属于 `BChat`。初始化顺序为：

1. 订阅目录变化事件；
2. 注册目录 watcher；
3. 执行首次全量扫描；
4. 将扫描结果与监听期间收到的事件合并。

`add`、`change`、`unlink` 继续增量更新 Store。监听只负责加快 UI 和工具描述更新；即使事件没有到达，发送前同步与执行时解析仍能恢复正确状态。

### 发送消息前

`resolveChatRuntimeRequestConfig()` 在读取活跃工具之前，并行执行 Skill 和 Widget 的磁盘同步：

- 重新扫描定义目录，发现新增、删除和重命名；
- 读取并解析源文件；
- 保留已持久化的启用/禁用状态；
- 用完整扫描结果替换 Store 投影。

同步完成后再调用 `getActiveTools()` 和 `toTransportTools()`，确保模型看到的 Skill/Widget 列表、名称、说明和 schema 来自本轮发送前的磁盘快照。

若同步失败，记录错误并沿用当前 Store 作为工具发现降级结果；工具真正执行时仍必须再次读取目标文件，不能因为发送前同步失败而静默执行旧定义。

### Skill 执行

`skill` 工具按名称找到启用的 Store 条目后，通过条目的 `filePath` 重新读取 `SKILL.md`，解析并校验：

- 文件不存在时，从 Store 移除条目并返回 `TOOL_NOT_FOUND`；
- 解析失败时更新 Store 的解析错误并返回失败，不回退到旧内容；
- Skill 名称与调用名称不一致时更新 Store，并返回明确的名称变化错误，避免执行错误资源；
- 解析成功时保留启用状态、更新 Store，并返回最新内容及 `contentHash` 元数据。

Skill 工具结果继续使用模型可读的 XML 文本，其中 `<skill_metadata>` 增加 `<content_hash>`。用户可见的工具摘要保持现有展示。

### Skill 历史失效

Skill 工具结果会进入聊天历史，因此只保证执行时读取仍不足以防止下一轮复用旧指令。构建运行时消息时执行以下投影规则：

- 从历史 `skill` 工具结果读取 Skill 名称和 `contentHash`；
- 与发送前同步后的当前 Skill hash 比较；
- hash 相同则保留原工具结果；
- hash 不同、文件删除或结果没有版本元数据时，把模型可见结果替换成简短失效标记，要求重新调用 `skill`；
- 只修改发送给 runtime 的消息投影，不修改持久化消息和界面历史。

这保证旧 Skill 内容不会继续作为有效指令进入新一轮上下文，同时保留历史审计信息。

### Widget 执行

`widget` 和 `open_widget` 工具按 ID 找到启用条目后，通过 `filePath` 重新读取 `widget.json`：

- 文件不存在时移除 Store 条目并返回 `TOOL_NOT_FOUND`；
- JSON 或 Widget 契约解析失败时更新 Store 错误并返回失败，不执行旧 Widget；
- 目录 ID 与调用 ID 不一致时拒绝执行；
- 解析成功时保留启用状态、更新 Store，然后创建契约或运行态展示快照。

`open_widget` 的 `onExecute` 和首屏 value 必须来自同一次最新文件读取，避免 schema、脚本和元素树跨版本组合。

历史 `open_widget` 消息继续保留当时的完整值快照。源文件更新只影响后续调用。

### 文档执行

编辑器工具上下文不再接收静态 `fileState` 对象，而是接收实时 getter：

```ts
getFileState: () => EditorState
```

`document.getContent()`、标题、路径和 locator 均在读取时从当前 getter 取值。编辑器实例操作函数同样通过 getter 获取当前实例，避免编辑器模式切换后引用旧 controller。

`read_current_document` 和已打开文件的 `read_file` 继续在工具执行时通过 bridge 读取编辑器内存；未打开文件继续由主进程在执行时读取磁盘。

## 组件边界

- `src/ai/skill`：负责 Skill 扫描、解析和内容版本。
- `src/ai/widget`：负责 Widget 扫描、解析和内容版本。
- `src/stores/ai/skill.ts`：负责磁盘同步、启用状态合并和单个 Skill 最新解析。
- `src/stores/ai/widget.ts`：负责磁盘同步、启用状态合并和单个 Widget 最新解析。
- `src/ai/tools/builtin/SkillTool/index.ts`：只通过异步最新资源解析接口执行 Skill。
- `src/ai/tools/builtin/WidgetTool/index.ts`：只通过异步最新资源解析接口执行 Widget。
- `src/components/BChat/index.vue`：发送前等待资源同步，不实现磁盘解析细节。
- `src/components/BChat/utils/messageHelper.ts`：构建 runtime 消息投影时处理旧 Skill 版本失效。
- `src/components/BEditor/hooks/useEditorToolContext.ts`：提供实时编辑器状态和 controller getter。
- 默认布局入口：拥有 Skill/Widget watcher 生命周期。

通用 `src/hooks/useFileSession.ts` 只负责文件编辑与保存，不直接更新 AI 资源 Store。

## 并发与错误处理

- Store 对全量同步和同一资源的执行时读取复用进行中的 Promise，避免同一文件并发重复读取。
- Store 为每个文件路径维护单调操作序号。扫描、watcher 和执行时读取在开始时取得序号，只有序号不早于当前已应用结果的操作才能写回 Store，避免较早但较慢的读取覆盖新结果。
- `contentHash` 只用于判断内容版本是否相同，不承担事件先后排序。
- 解析失败属于最新磁盘状态，必须显式暴露，禁止回退到最后一次有效定义。
- 全量同步失败不阻断普通聊天，但相关工具执行必须通过目标文件最新读取决定成功或失败。
- 文件在读取期间被替换时，以一次完整 `readFile` 返回的文本作为原子快照；后续 watcher 或下一次执行继续收敛。

## 测试策略

### Skill

- watcher 事件更新 Store 并保留禁用状态；
- 发送前同步发现外部新增、修改和删除；
- 工具创建后修改磁盘内容，执行返回新内容而不是旧 Store 内容；
- 最新文件解析失败时执行失败，不回退旧内容；
- Skill hash 变化后，runtime 消息投影替换旧工具结果并要求重新加载。

### Widget

- 应用内保存触发磁盘变化后 Store 更新；
- 外部直接修改 `widget.json` 后发送前同步更新工具描述；
- 工具创建后修改磁盘内容，`widget` 和 `open_widget` 使用新 schema、脚本和元素树；
- 文件删除或解析失败时不执行旧 Widget；
- 历史 Widget 消息保持原快照。

### 文档

- 注册上下文后替换编辑器状态对象，`getContent()` 返回新内容；
- 编辑器 controller 切换后，选区和写操作使用新 controller；
- 已打开文件优先返回未保存的编辑器内存；
- 未打开文件在工具执行时读取最新磁盘内容。

## 验收标准

- 修改并保存 Widget 后无需刷新页面，下一条聊天可使用新 Widget。
- 外部直接修改 `widget.json` 后无需刷新页面，下一条聊天可使用新 Widget。
- 修改 `SKILL.md` 后，下一次 Skill 调用读取新内容，后续轮次不会继续注入旧 Skill 指令。
- 编辑器存在未保存内容时，`read_current_document` 返回当前编辑器内容。
- watcher 被模拟为不发送事件时，发送前同步和执行时读取仍能得到最新磁盘数据。
- 相关单元测试、ESLint、Stylelint 和 TypeScript 检查全部通过。
