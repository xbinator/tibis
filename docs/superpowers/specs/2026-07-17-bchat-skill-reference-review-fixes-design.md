# BChat SkillReference 审核问题修复设计

## 背景

当前 BChat 斜杠技能引用已经完成菜单选择、`{{$技能名}}` Token、消息持久化与 Runtime 临时上下文注入，但代码审核发现续跑错误展示、引用身份、空闲上下文用量和名称约束存在行为缺口。同时，Runtime 临时上下文参数与用户输入 Token 扫描在多处重复，增加了后续扩展成本。

本次修复覆盖行为缺陷和直接相关的结构收敛，不删除 Renderer 中现有的模型转换器，也不处理与本功能无关的展示层微优化。

## 目标

- Skill 在用户选择续跑前失效时，恢复交互状态并展示包含技能名称的错误。
- 所有进入斜杠菜单的 Skill 名称都能稳定编码为 `{{$技能名}}`，非法名称在解析阶段标记错误。
- 文件引用 Widget 的等价判断覆盖完整导航身份，避免同名不同路径复用旧 DOM。
- Runtime 完成后的空闲上下文用量仅统计持久化消息，不保留本轮临时 Skill 内容。
- Skill 内容不能破坏 Runtime 使用的上下文定界结构。
- Runtime 显式 Skill 上下文使用不可拆分的数据结构，并减少四条 Runtime 创建路径的字段复制。
- 文件与技能引用的收集、排序和文本分段只保留一套共享实现。
- SlashCommand 类型用判别联合约束插入型 Skill 条目必须提供 `insertText`。

## 非目标

- 不删除 `src/components/BChat/utils/messageHelper.ts` 中现有的 Renderer 模型转换器。
- 不改变 Skill 工具自主调用、Skill Store 扫描目录或安装格式。
- 不改变文件引用和技能引用的视觉样式。
- 不引入通用插件式 Runtime 上下文协议；本次只建立可继续扩展的统一上下文容器。

## 设计

### Skill 名称策略

在 `src/ai/skill/` 下提供与 UI 无关的 Skill 名称校验函数，名称必须非空且不能包含 `{`、`}`、回车或换行。`parseSkillMarkdown()` 使用该策略生成 `parseError`，`skillReference` Token 创建和解析复用同一策略，避免 Store、菜单和 Token 使用不同规则。

Token 创建函数遇到非法名称时抛出明确错误；正常菜单数据在解析阶段已经被过滤，因此该异常只用于阻止未来调用方构造不可逆 Token。

### Runtime Skill 上下文

把独立的 `skillSnapshots` 与 `skillTargetMessageId` 合并到统一 Runtime 上下文容器：

```typescript
interface ChatRuntimeSkillContext {
  targetMessageId: string;
  snapshots: ChatRuntimeSkillSnapshot[];
}

interface ChatRuntimeContext {
  skill?: ChatRuntimeSkillContext;
}
```

各 Runtime 请求和 `ActiveChatRuntime` 只携带 `runtimeContext?: ChatRuntimeContext`。主进程的 `runtime-context` 投影器注册表保持不变，Skill 投影器从 `runtimeContext.skill` 读取数据。

四个 Runtime 工厂通过共享基础字段构造函数复制通用配置，具体工厂只补充 session、phase 和 compaction 差异。未来增加新的临时上下文时只扩展 `ChatRuntimeContext`、请求准备和投影器，四类 Runtime 请求与工厂继续透传同一个 `runtimeContext` 字段。

Skill 内容在注入前转义为 XML 文本，名称、哈希和路径继续按 XML 属性转义。这样 Skill Markdown 中出现 `</skill>` 或其他边界文本时只作为内容传递。

### 上下文用量生命周期

真实模型请求和自动压缩后的重放继续调用 `applyRuntimeContext()`，确保当前 Runtime 的 Skill 内容进入容量检查。Runtime 完成后的最终用量投影改用原始持久化消息，只表示下一次空闲请求的历史上下文，与页面刷新后的 `estimateContext()` 结果保持一致。

### 用户输入引用分段

新增共享引用 Token 工具，统一收集文件与 Skill 匹配、按 offset 排序并跳过重叠项。工具输出稳定的判别联合以及文本/引用交替 segment。

`filePartParser` 使用共享 segment 创建 Runtime parts，直接返回原始 `content`；`BubblePartUserInput` 使用相同 segment 创建展示模型。两端只保留各自的业务映射，不再重复扫描和游标切片。

### FileRefWidget 身份

`FileRefWidget.eq()` 比较 `rawPath`、`filePath`、`fileId`、文件名、起止行和未保存状态。只要导航目标变化就重新创建 DOM，确保标题和点击闭包与当前 Token 一致。

### SlashCommand 类型

`SlashCommandOption` 改为判别联合：动作和提示词命令不要求 `insertText`，Skill 命令必须提供 `type: 'skill'`、`id: \`skill:${string}\`` 和非可选 `insertText`。选择逻辑直接读取 `command.insertText`，不再用空字符串兜底无效状态。

### 错误处理

用户选择续跑准备失败时继续调用现有状态机恢复流程，并通过 `showRuntimeError()` 展示错误。错误创建继续集中在 `src/components/BChat/utils/runtimeError.ts`，不新增独立错误展示机制。

## 测试

- Skill parser 与 Slash 菜单拒绝花括号、回车和换行名称。
- Token 创建函数拒绝非法名称。
- FileRefWidget 同名不同路径不等价，并打开当前路径。
- 用户选择续跑时 Skill 失效会调用错误展示并恢复提交状态。
- Runtime 最终上下文用量不包含本轮临时 Skill 内容，模型请求阶段仍包含。
- Skill 内容中的 XML 关闭标签被转义。
- Runtime Skill 上下文不可构造只有快照或只有目标消息的半配置状态。
- 文件与 Skill 混合 Token 在 Runtime parts 和用户气泡中保持相同顺序。
- 相关 Vitest、TypeScript、ESLint、Stylelint 与 `git diff --check` 全部通过。
