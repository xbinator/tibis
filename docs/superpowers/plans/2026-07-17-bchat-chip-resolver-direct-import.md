# BChat ChipResolver Direct Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一消息气泡引用片段判别值，并移除文件、技能 ChipResolver 子目录的代理导出入口。

**Architecture:** 保留顶层 `chipResolver/index.ts` 作为组合解析器，但让它和其他消费者直接依赖实际的 `widget.ts`、`presentation.ts`。消息气泡继续将共享引用分段结果投影为本地展示片段，只把判别值从 `fileRef`、`skillRef` 收敛为 `file`、`skill`。

**Tech Stack:** TypeScript、Vue 3、CodeMirror 6、Vitest。

## Global Constraints

- 不改变文件或技能 Chip 的界面、解析规则与点击行为。
- 删除 `src/components/BChat/utils/chipResolver/file/index.ts` 和 `src/components/BChat/utils/chipResolver/skill/index.ts`，不新增替代代理入口。
- 由于这是纯导入路径与判别值重构，用户已同意不编造结构型 RED 测试；使用现有行为测试和 TypeScript 检查验证。
- 当前工作区包含同一功能的未提交基础改动，不自动提交实现文件，避免把既有改动错误归入新提交。

---

### Task 1: 收敛引用片段和模块入口

**Files:**
- Modify: `src/components/BChat/components/MessageBubble/BubblePartUserInput/index.vue`
- Modify: `src/components/BChat/utils/chipResolver/index.ts`
- Delete: `src/components/BChat/utils/chipResolver/file/index.ts`
- Delete: `src/components/BChat/utils/chipResolver/skill/index.ts`
- Modify: `test/components/BChat/chip-resolver.test.ts`
- Modify: `changelog/2026-07-17.md`

**Interfaces:**
- Consumes: `createFileRefChipPresentation(options): FileRefChipPresentation` from `file/presentation.ts`.
- Consumes: `createFileReferenceWidget(parsed, onOpenFile)` from `file/widget.ts`.
- Consumes: `createSkillReferenceWidget(skillName)` from `skill/widget.ts`.
- Produces: `Segment` discriminated by `'text' | 'file' | 'skill'` inside `BubblePartUserInput`.

- [ ] **Step 1: Run the behavior baseline**

Run:

```bash
pnpm exec vitest run test/components/BChat/chip-resolver.test.ts test/components/BChat/bubble-part-user-input.test.ts
```

Expected: both test files pass before the structural refactor.

- [ ] **Step 2: Point tests at concrete Widget modules**

Change the test imports to:

```ts
import { createFileReferenceWidget } from '@/components/BChat/utils/chipResolver/file/widget';
import { createSkillReferenceWidget } from '@/components/BChat/utils/chipResolver/skill/widget';
```

- [ ] **Step 3: Update production imports and discriminants**

In `BubblePartUserInput/index.vue`, import presentation helpers directly:

```ts
import type { FileRefChipPresentation } from '@/components/BChat/utils/chipResolver/file/presentation';
import { createFileRefChipPresentation } from '@/components/BChat/utils/chipResolver/file/presentation';
```

Use the unified discriminants:

```ts
interface FileRefSegment {
  type: 'file';
  fullPath: string | null;
  fileId: string | null;
  startLine: number;
  endLine: number;
  isUnsaved: boolean;
  presentation: FileRefChipPresentation;
}

interface SkillRefSegment {
  type: 'skill';
  name: string;
}
```

Return `{ type: 'file', ... }` and `{ type: 'skill', ... }`, and update the template condition to `segment.type === 'skill'`.

In `chipResolver/index.ts`, import Widget factories directly:

```ts
import { createFileReferenceWidget } from './file/widget';
import { createSkillReferenceWidget } from './skill/widget';
```

- [ ] **Step 4: Delete the subgroup barrel files**

Delete exactly:

```text
src/components/BChat/utils/chipResolver/file/index.ts
src/components/BChat/utils/chipResolver/skill/index.ts
```

- [ ] **Step 5: Verify stale names and imports are gone**

Run:

```bash
rg -n "fileRef|skillRef|chipResolver/file['\"]|chipResolver/skill['\"]|from './file'|from './skill'" src test electron types
```

Expected: no matches for the removed discriminants or subgroup directory imports.

- [ ] **Step 6: Run focused tests**

Run:

```bash
pnpm exec vitest run test/components/BChat/chip-resolver.test.ts test/components/BChat/bubble-part-user-input.test.ts test/components/BChat/file-part-parser.test.ts
```

Expected: 3 test files pass.

- [ ] **Step 7: Record the change**

Add this entry under `## Changed` in `changelog/2026-07-17.md`:

```markdown
- 统一用户输入引用片段的文件、技能判别值，并移除 ChipResolver 子目录代理导出入口。
```

- [ ] **Step 8: Run static verification**

Run:

```bash
pnpm exec eslint src/components/BChat/components/MessageBubble/BubblePartUserInput/index.vue src/components/BChat/utils/chipResolver/index.ts src/components/BChat/utils/chipResolver/file/presentation.ts src/components/BChat/utils/chipResolver/file/widget.ts src/components/BChat/utils/chipResolver/skill/widget.ts test/components/BChat/chip-resolver.test.ts
pnpm exec stylelint 'src/components/BChat/**/*.{vue,less,css}'
pnpm exec tsc --noEmit
git diff --check
```

Expected: all commands exit with code 0.

- [ ] **Step 9: Leave implementation changes for review**

Do not stage or commit implementation files. Report the deleted entries, direct imports, focused test counts, and static verification results to the user.
