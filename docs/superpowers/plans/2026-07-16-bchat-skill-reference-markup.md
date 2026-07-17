# BChat 技能引用标记实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将技能引用内部标记统一为 `{{$技能名}}`，并在斜杠菜单、输入框和用户消息中无图标地显示纯技能名。

**Architecture:** `message.content` 像文件引用一样保留可逆的技能 Token；输入编辑器和用户消息分别解析同一 Token，并复用 `.b-skill-reference` 样式。`ChatMessageSkillReferencePart` 继续保存结构化 Runtime 数据，不参与气泡识别。

**Tech Stack:** Vue 3、TypeScript、CodeMirror 6、Vitest、Less

## Global Constraints

- 文件引用继续使用 `{{@文件路径}}`，技能引用改用 `{{$技能名}}`。
- 界面仅显示技能名，不显示 `$`、图标、边框或背景。
- 技能名不能包含 `{`、`}` 或换行。
- 禁止引入 `any`，新增和修改的函数必须保留明确类型与 JSDoc。
- 不改变 `skill_reference` Runtime part 和技能快照注入流程。

---

### Task 1: 固化技能标记与无图标展示行为

**Files:**
- Modify: `test/components/BChat/skill-reference.test.ts`
- Modify: `test/components/BChat/chip-resolver.test.ts`
- Modify: `test/components/BText/slash-command-select-scroll.test.ts`
- Modify: `test/components/BChat/file-part-parser.test.ts`
- Modify: `test/components/BChat/bubble-part-user-input.test.ts`

**Interfaces:**
- Consumes: `createSkillReferenceToken(name: string): string`、`parseUserInput(content: string): ParsedBChatUserInput`
- Produces: 对 `{{$技能名}}`、纯技能名展示和无图标行为的回归约束

- [x] **Step 1: 写入失败测试**

  将 Token 预期改为 `{{$天气 / 上海? #1}}`；要求输入框 Widget 和用户气泡显示 `天气 / 上海? #1`，不存在技能图标且不显示 `$`；要求 Slash 菜单不存在 `.slash-command-item-icon`；要求 `parseUserInput()` 的 `content` 保留原始技能 Token。

- [x] **Step 2: 验证测试因旧行为失败**

  Run: `pnpm exec vitest run test/components/BChat/skill-reference.test.ts test/components/BChat/chip-resolver.test.ts test/components/BText/slash-command-select-scroll.test.ts test/components/BChat/file-part-parser.test.ts test/components/BChat/bubble-part-user-input.test.ts`

  Expected: FAIL，失败信息分别指向旧 `$skill:` Token、旧 `$技能名` 投影或残留图标。

### Task 2: 实现统一 Token 解析与展示

**Files:**
- Modify: `src/components/BChat/utils/skillReference.ts`
- Modify: `src/components/BChat/utils/filePartParser.ts`
- Create: `src/components/BChat/utils/chipResolver/file/`
- Create: `src/components/BChat/utils/chipResolver/skill/`
- Modify: `src/components/BChat/utils/chipResolver/index.less`
- Modify: `src/components/BText/components/SlashCommandSelect.vue`
- Modify: `src/components/BChat/components/MessageBubble/BubblePartUserInput/index.vue`

**Interfaces:**
- Consumes: `findSkillReferenceTokens(text: string): SkillReferenceTokenMatch[]`
- Produces: `{{$技能名}}` 的创建、解析、CodeMirror Widget 和消息气泡渲染

- [x] **Step 1: 实现最小 Token 变更**

  `createSkillReferenceToken()` 直接创建 `{{$技能名}}`；`parseSkillReferenceBody()` 解析 `$` 后的原始名称并拒绝空名称、花括号和换行；`projectSkillReference()` 返回纯技能名。

- [x] **Step 2: 保留 content 中的原始 Token**

  `parseUserInput()` 在创建 `skill_reference` part 的同时，将 `match.token` 原样追加到 `content`。

- [x] **Step 3: 移除两处图标**

  删除 Slash 菜单的技能 `BIcon` 与图标样式；简化 `SkillReferenceWidget`，只创建 `.b-skill-reference__name`，不再创建或销毁 Vue 图标应用。

- [x] **Step 4: 在用户消息中解析技能 Token**

  `BubblePartUserInput` 合并文件引用与技能引用匹配并按 offset 排序；技能片段输出 `.b-skill-reference > .b-skill-reference__name`，文本为纯技能名且不可点击。

- [x] **Step 5: 验证目标测试转绿**

  Run: `pnpm exec vitest run test/components/BChat/skill-reference.test.ts test/components/BChat/chip-resolver.test.ts test/components/BText/slash-command-select-scroll.test.ts test/components/BChat/file-part-parser.test.ts test/components/BChat/bubble-part-user-input.test.ts`

  Expected: 5 个测试文件全部通过。

### Task 3: 同步设计与完成验证

**Files:**
- Modify: `docs/superpowers/specs/2026-07-14-bchat-slash-skill-reference-design.md`
- Modify: `changelog/2026-07-16.md`

**Interfaces:**
- Consumes: Task 2 的最终行为
- Produces: 与实现一致的设计说明和变更记录

- [x] **Step 1: 更新设计说明与 changelog**

  将旧 `{{$skill:<encoded>}}`、`$技能名` 和扳手图标描述替换为 `{{$技能名}}`、纯技能名无图标展示，并说明消息 `content` 保留 Token。

- [x] **Step 2: 运行完整相关验证**

  Run: `pnpm exec vitest run test/components/BText/slash-command-select-scroll.test.ts test/components/BText/slash-command-context.test.ts test/components/BChat/chip-resolver.test.ts test/components/BChat/bubble-part-user-input.test.ts test/components/BChat/message-bubble.component.test.ts test/components/BChat/skill-reference.test.ts test/components/BChat/file-part-parser.test.ts test/components/BChat/use-runtime-tools.test.ts test/electron/main/modules/chat/runtime/skill-reference.test.ts`

  Expected: 全部相关测试通过。

- [x] **Step 3: 运行静态检查**

  Run: `pnpm exec eslint src --ext .vue,.ts,.tsx,.js,.jsx`

  Run: `pnpm exec stylelint 'src/**/*.{vue,less,css}'`

  Run: `pnpm exec tsc --noEmit`

  Expected: 三条命令退出码均为 0。

- [x] **Step 4: 检查差异完整性**

  Run: `git diff --check`

  Expected: 无输出，退出码为 0。除非用户明确要求，否则不创建 Git 提交。
