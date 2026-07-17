# BText 通用 SlashCommand 配置设计

## 背景

`src/components/BText/types.ts` 当前通过 `SlashCommandActionOption` 与 `SlashCommandSkillOption` 区分命令和技能，并定义了具体命令 ID、`skill:${string}` ID 以及 `command/skill` 分组。`useSlashCommand` 也直接判断 `command.type === 'skill'`。这些信息属于 BChat 领域，不应由通用文本编辑器理解。

## 目标

- BText 只定义斜杠菜单的通用展示字段和选中行为。
- BText 不再理解 Skill、具体命令 ID 或业务分组名称。
- BChat 继续负责生成技能引用 Token、命令派发和领域类型约束。
- 保持现有命令触发、技能 Token 插入、过滤、分组展示和键盘交互不变。

## 类型设计

BText 使用通用的选中行为判别联合：

```ts
export type SlashCommandSelectAction =
  | { type: 'emit' }
  | { type: 'insert'; text: string };

export interface SlashCommandOption {
  id: string;
  trigger: string;
  title: string;
  description: string;
  group?: string;
  groupTitle?: string;
  selectAction: SlashCommandSelectAction;
}
```

删除 BText 中的领域类型：

- `SlashCommandId`
- `SlashCommandActionId`
- `SlashCommandType`
- `SlashCommandGroup`
- `SlashCommandActionOption`
- `SlashCommandSkillOption`

## 选中流程

`useSlashCommand` 根据 `selectAction.type` 执行通用行为：

- `emit`：删除当前斜杠查询文本，向上层发出 `slash-command` 事件。
- `insert`：使用 `selectAction.text` 替换当前斜杠查询文本，按现有规则补充空格，不发出领域事件。

两种行为都会关闭菜单并恢复编辑器焦点。BText 不根据 ID、分组或业务名称推断行为。

## BChat 领域配置

- 普通命令配置 `selectAction: { type: 'emit' }`，继续通过命令 ID 映射派发 handler。
- 技能条目配置 `selectAction: { type: 'insert', text: createSkillReferenceToken(skill.name) }`。
- `CommandId` 继续由 `COMMAND_HANDLER_MAP` 在 BChat 内部派生。
- `command`、`skill` 分组值只是 BChat 传入的字符串，BText 仅用于相邻项分组比较。

## 验证

- 类型测试覆盖普通命令配置与插入配置。
- Hook 测试验证 `emit` 行为清除查询并发出事件。
- Hook 测试验证 `insert` 行为写入配置文本且不发出事件。
- BChat 测试验证普通命令和技能条目生成正确的 `selectAction`。
- 运行相关 Vitest、ESLint、Stylelint 与 TypeScript 检查。

## 非目标

- 不把 handler 函数直接放入配置对象。
- 不改变 SlashCommandSelect 的视觉布局或分组标题规则。
- 不改变技能引用 Token 格式或 BChat 命令并发策略。
