# BText Generic SlashCommand Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 BText 通过通用 `selectAction` 配置执行斜杠选中行为，不再理解 Skill、具体命令 ID 或业务分组。

**Architecture:** `SlashCommandOption` 保留通用展示字段，并通过 `SlashCommandSelectAction` 判别联合描述 `emit`、`insert` 行为。BChat 负责把普通命令和技能分别投影为对应行为配置，BText 只执行配置而不推断业务类型。

**Tech Stack:** TypeScript、Vue 3、CodeMirror 6、Vitest。

## Global Constraints

- 保持现有命令触发、技能 Token 插入、过滤、分组展示和键盘交互不变。
- BText 不定义 Skill、具体命令 ID 或 `command/skill` 分组联合类型。
- 不把 handler 函数放入配置对象，普通命令仍由 BChat 事件派发。
- 当前工作区包含同一功能的未提交基础改动，不自动提交实现文件。

---

### Task 1: 用通用选中行为替换领域类型

**Files:**
- Modify: `src/components/BText/types.ts`
- Modify: `src/components/BText/hooks/useSlashCommand.ts`
- Modify: `src/components/BChat/hooks/useSlashCommands.ts`
- Modify: `test/components/BText/slash-command-context.test.ts`
- Modify: `test/components/BText/use-slash-command-scroll.test.ts`
- Modify: `test/components/BText/slash-command-select-scroll.test.ts`
- Modify: `test/components/BChat/use-slash-commands.test.ts`
- Modify: `changelog/2026-07-17.md`

**Interfaces:**
- Produces: `SlashCommandSelectAction = { type: 'emit' } | { type: 'insert'; text: string }`.
- Produces: `SlashCommandOption` with `id: string`, optional string `group`, and required `selectAction`.
- Consumes: BChat ordinary commands use `{ type: 'emit' }`; Skill entries use `{ type: 'insert', text: SkillReferenceToken }`.

- [ ] **Step 1: Update the behavior test to describe the generic API**

In `test/components/BText/slash-command-context.test.ts`, replace the fixtures with:

```ts
const COMMANDS: SlashCommandOption[] = [
  {
    id: 'model',
    trigger: '/model',
    title: '模型',
    description: '切换当前模型',
    group: 'command',
    selectAction: { type: 'emit' }
  },
  {
    id: 'skill:weather',
    trigger: '/weather',
    title: '天气助手',
    description: '查询城市天气',
    group: 'skill',
    selectAction: { type: 'insert', text: '{{$weather}}' }
  }
];
```

Keep the existing insertion assertion and add:

```ts
it('removes the active range and emits a generic command action', (): void => {
  const parent = document.createElement('div');
  const editor = new EditorView({
    parent,
    state: EditorState.create({ doc: '/mod', selection: { anchor: 4 } })
  });
  const view = shallowRef<EditorView | null>(editor);
  const emit = vi.fn();
  const slashCommand = useSlashCommand(
    view,
    computed(() => COMMANDS),
    emit
  );
  slashCommand.syncSlashCommandState(editor.state, editor);

  slashCommand.handleSlashCommandSelect(COMMANDS[0]);

  expect(editor.state.doc.toString()).toBe('');
  expect(emit).toHaveBeenCalledWith('slash-command', COMMANDS[0]);
  editor.destroy();
});
```

- [ ] **Step 2: Run the behavior test and verify RED**

Run:

```bash
pnpm exec vitest run test/components/BText/slash-command-context.test.ts
```

Expected: the insertion test fails because the current implementation does not read `selectAction.text`.

- [ ] **Step 3: Replace BText domain types with generic configuration**

In `src/components/BText/types.ts`, replace the SlashCommand domain types with:

```ts
/** 斜杠命令选中后的通用行为。 */
export type SlashCommandSelectAction =
  | { type: 'emit' }
  | { type: 'insert'; text: string };

/** 供提示词编辑器和上层业务使用的通用斜杠选项。 */
export interface SlashCommandOption {
  /** 稳定选项标识。 */
  id: string;
  /** 展示给用户的斜杠触发文本。 */
  trigger: string;
  /** 人类可读标题。 */
  title: string;
  /** UI 提示描述。 */
  description: string;
  /** 上层业务定义的分组标识。 */
  group?: string;
  /** 分组首项上方的展示标题。 */
  groupTitle?: string;
  /** 选中条目后由编辑器执行的行为。 */
  selectAction: SlashCommandSelectAction;
}
```

Delete `SlashCommandId`、`SlashCommandActionId`、`SlashCommandType`、`SlashCommandGroup`、`SlashCommandOptionBase`、`SlashCommandActionOption` and `SlashCommandSkillOption`.

- [ ] **Step 4: Execute `selectAction` in the editor Hook**

In `handleSlashCommandSelect`, use:

```ts
const { from, to } = slashRange.value;
const selectAction = command.selectAction;
const nextCharacter = view.value.state.sliceDoc(to, Math.min(to + 1, view.value.state.doc.length));
const suffix = nextCharacter && /\s/u.test(nextCharacter) ? '' : ' ';
const insert = selectAction.type === 'insert' ? `${selectAction.text}${suffix}` : '';

view.value.dispatch({
  changes: { from, to, insert },
  selection: { anchor: from + insert.length }
});

if (selectAction.type === 'emit') emit('slash-command', command);
```

Keep menu closing and focus restoration unchanged.

- [ ] **Step 5: Run the BText behavior test and verify GREEN**

Run:

```bash
pnpm exec vitest run test/components/BText/slash-command-context.test.ts
```

Expected: all tests in the file pass, including generic emit and insert behavior.

- [ ] **Step 6: Migrate BText test fixtures**

In both scrolling test files:

- Remove the `SlashCommandActionId` import.
- Accept `id: string` in the helper.
- Replace `type: 'action'` with `selectAction: { type: 'emit' }`.
- Replace Skill fixture `type` and `insertText` with `selectAction: { type: 'insert', text: '{{$weather}}' }`.

The shared helper becomes:

```ts
function createSlashCommand(id: string): SlashCommandOption {
  return {
    id,
    trigger: `/${id}`,
    title: id,
    description: `Run ${id}`,
    selectAction: { type: 'emit' }
  };
}
```

The Skill fixture uses:

```ts
const skillCommand: SlashCommandOption = {
  id: 'skill:weather',
  trigger: '/weather',
  title: '天气助手',
  description: '查询天气',
  group: 'skill',
  groupTitle: '技能',
  selectAction: { type: 'insert', text: '{{$weather}}' }
};
```

- [ ] **Step 7: Migrate BChat option factories**

Use this configuration for ordinary commands:

```ts
selectAction: { type: 'emit' as const },
group: 'command'
```

Use this configuration for Skill entries:

```ts
group: 'skill',
groupTitle: '技能',
selectAction: {
  type: 'insert',
  text: createSkillReferenceToken(skill.name)
}
```

Keep `CommandId` derived from `COMMAND_HANDLER_MAP`; `handleSlashCommand` continues to ignore unknown IDs safely.

- [ ] **Step 8: Update BChat expectations**

In `test/components/BChat/use-slash-commands.test.ts`, replace Skill-specific option expectations with:

```ts
expect.objectContaining({
  id: 'skill:weather',
  trigger: '/weather',
  group: 'skill',
  groupTitle: '技能',
  selectAction: { type: 'insert', text: '{{$weather}}' }
})
```

Also assert an ordinary command contains `selectAction: { type: 'emit' }`.

- [ ] **Step 9: Run focused regression tests**

Run:

```bash
pnpm exec vitest run test/components/BText/slash-command-context.test.ts test/components/BText/use-slash-command-scroll.test.ts test/components/BText/slash-command-select-scroll.test.ts test/components/BChat/use-slash-commands.test.ts
```

Expected: 4 test files pass.

- [ ] **Step 10: Record the change**

Add under `## Changed` in `changelog/2026-07-17.md`:

```markdown
- 将 BText 斜杠选项收敛为通用选中行为配置，命令与技能领域语义由 BChat 持有。
```

- [ ] **Step 11: Verify domain types are removed**

Run:

```bash
rg -n "SlashCommandActionId|SlashCommandActionOption|SlashCommandSkillOption|SlashCommandType|SlashCommandGroup|command\.type|\binsertText\s*:" src/components/BText src/components/BChat/hooks/useSlashCommands.ts test/components/BText test/components/BChat/use-slash-commands.test.ts
```

Expected: no removed SlashCommand domain types, `command.type`, or SlashCommand `insertText` configuration remain.

- [ ] **Step 12: Run static verification**

Run:

```bash
pnpm exec eslint src/components/BText/types.ts src/components/BText/hooks/useSlashCommand.ts src/components/BChat/hooks/useSlashCommands.ts test/components/BText/slash-command-context.test.ts test/components/BText/use-slash-command-scroll.test.ts test/components/BText/slash-command-select-scroll.test.ts test/components/BChat/use-slash-commands.test.ts
pnpm exec stylelint 'src/components/BText/**/*.{vue,less,css}'
pnpm exec tsc --noEmit
git diff --check
```

Expected: all commands exit with code 0.

- [ ] **Step 13: Leave implementation changes for review**

Do not stage or commit implementation files. Report the migrated configuration, focused test counts, full verification status, and current workspace state.
