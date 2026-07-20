# Shell Tool Bubble Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the Shell tool bubble so the command input appears before terminal output inside one visually quiet terminal region, with failure summaries visually distinguished from cancellations.

**Architecture:** `BubblePartTool` derives command text independently from result summaries, preferring `part.input.command` and falling back to structured result metadata. The template renders command and Screen Snapshot as two semantic children of one terminal container; only failure or cancellation summaries remain outside that container as weak status text.

**Tech Stack:** Vue 3 `<script setup>`, TypeScript, Less, Vitest, Vue Test Utils.

## Global Constraints

- Do not render `auto_answer` counts in the UI; retain their event and metadata flow internally.
- Do not add dependencies or use `any`.
- Every new computed value and non-trivial branch must have an intent-focused comment.
- Do not stage or commit changes; the user will commit the final code.

---

### Task 1: Correct Shell command and output presentation

**Files:**
- Modify: `src/components/BChat/components/MessageBubble/BubblePartTool/index.vue`
- Test: `test/components/BChat/bubble-part-tool-shell.test.ts`
- Modify: `docs/superpowers/specs/2026-07-20-shell-auto-default-interaction-design.md`
- Modify: `changelog/2026-07-20.md`

**Interfaces:**
- Consumes: `ChatMessageToolPart.input.command`, structured result `command`, `terminalOutput`, `stdout`, `stderr`, and `ToolResultSummary.variant`.
- Produces: `shellCommandContent: ComputedRef<string>`, `shellTerminalContent: ComputedRef<string>`, and a single `.bubble-part-tool__shell-terminal` presentation containing `.bubble-part-tool__shell-command` before `.bubble-part-tool__shell-output`.

- [x] **Step 1: Write failing component tests**

Update the executing-state assertion so it verifies the command and output are children of one terminal container and command text precedes output text:

```ts
const terminal = wrapper.find('.bubble-part-tool__shell-terminal');
const command = terminal.find('.bubble-part-tool__shell-command');
const output = terminal.find('.bubble-part-tool__shell-output');

expect(command.text()).toBe('$ interactive');
expect(output.text()).toContain('Continue?');
expect(terminal.text().indexOf('$ interactive')).toBeLessThan(terminal.text().indexOf('Installing package...'));
```

Add a completed-success fixture whose result includes `command: 'printf done'` and `terminalOutput: 'done'`. Assert the command is rendered once before the output and `.bubble-part-tool__shell-finished` does not exist. Keep the structured-failure test and assert its weak failure summary remains visible after restored terminal output.

- [x] **Step 2: Run the component test and verify RED**

Run:

```bash
pnpm exec vitest run test/components/BChat/bubble-part-tool-shell.test.ts
```

Expected: FAIL because `.bubble-part-tool__shell-command` and `.bubble-part-tool__shell-output` do not exist and the successful command is currently rendered as `.bubble-part-tool__shell-finished`.

- [x] **Step 3: Derive command and attention summary separately**

Add a `shellCommandContent` computed value that reads `props.part.input.command` when `input` is a plain object, otherwise falls back to `shellResultData.command`. Update `shellDisplay` so either command input or terminal output opens the Shell-specific view.

Add `shellAttentionText` so only summaries with `variant === 'failure'` or `variant === 'cancelled'` are rendered below the terminal region. A successful summary must return an empty string because its `text` is the command and would duplicate the input.

- [x] **Step 4: Render one weakly separated terminal region**

Replace the current sibling command/output rendering with this structure:

```vue
<div :class="bem('shell-terminal')">
  <div v-if="shellCommandContent" :class="bem('shell-command')">
    <span aria-hidden="true">$</span>
    <span>{{ shellCommandContent }}</span>
  </div>
  <div v-if="shellTerminalContent" :class="bem('shell-output')">{{ shellTerminalContent }}</div>
</div>
<div v-if="shellAttentionText" :class="bem('shell-finished')">{{ shellAttentionText }}</div>
```

Keep a single subtle terminal background. Use text color and a small gap to distinguish command from output; do not add a divider, nested card, second background, or strong border.

- [x] **Step 5: Run the component test and verify GREEN**

Run:

```bash
pnpm exec vitest run test/components/BChat/bubble-part-tool-shell.test.ts
```

Expected: all Shell bubble tests pass.

- [x] **Step 6: Update documentation and changelog**

Keep the approved UI rules in `docs/superpowers/specs/2026-07-20-shell-auto-default-interaction-design.md`. Add a `Changed` changelog entry stating that Shell command input now precedes output in one quiet terminal region and successful commands are not repeated as completion summaries.

- [x] **Step 7: Verify static quality and focused regression coverage**

Run:

```bash
pnpm exec eslint src/components/BChat/components/MessageBubble/BubblePartTool/index.vue test/components/BChat/bubble-part-tool-shell.test.ts
pnpm exec stylelint src/components/BChat/components/MessageBubble/BubblePartTool/index.vue
pnpm exec tsc --noEmit
pnpm exec vitest run test/components/BChat/bubble-part-tool-shell.test.ts test/components/BChat/shell-run-events.test.ts
```

Expected: all commands exit with code 0. Also run `git diff --check` for the files listed above and confirm no whitespace errors.

### Task 2: Distinguish failure and cancellation summaries

**Files:**
- Modify: `src/components/BChat/components/MessageBubble/BubblePartTool/index.vue`
- Test: `test/components/BChat/bubble-part-tool-shell.test.ts`
- Modify: `docs/superpowers/specs/2026-07-20-shell-auto-default-interaction-design.md`
- Modify: `changelog/2026-07-20.md`

**Interfaces:**
- Consumes: the existing `summary.variant` value and `shellAttentionText` visibility rule.
- Produces: the `.bubble-part-tool__shell-finished--failure` modifier only when `summary.variant === 'failure'`; cancellation retains `.bubble-part-tool__shell-finished` without the modifier.

- [x] **Step 1: Write failing status-color tests**

Extend the structured-failure test with:

```ts
expect(wrapper.find('.bubble-part-tool__shell-finished').classes()).toContain('bubble-part-tool__shell-finished--failure');
```

Add a cancelled Shell fixture with a command input and cancelled result. Assert the summary text is `用户已取消` and its classes do not include `bubble-part-tool__shell-finished--failure`.

- [x] **Step 2: Run the component test and verify RED**

Run:

```bash
pnpm exec vitest run test/components/BChat/bubble-part-tool-shell.test.ts
```

Expected: FAIL because the failure modifier does not exist yet.

- [x] **Step 3: Apply the failure modifier**

Bind the existing attention element with:

```vue
:class="bem('shell-finished', { failure: summary?.variant === 'failure' })"
```

Add this focused style while keeping the base cancelled style unchanged:

```less
.bubble-part-tool__shell-finished--failure {
  color: var(--color-error);
}
```

- [x] **Step 4: Run focused tests and static checks**

Run:

```bash
pnpm exec vitest run test/components/BChat/bubble-part-tool-shell.test.ts test/components/BChat/shell-run-events.test.ts
pnpm exec eslint src/components/BChat/components/MessageBubble/BubblePartTool/index.vue test/components/BChat/bubble-part-tool-shell.test.ts
pnpm exec stylelint src/components/BChat/components/MessageBubble/BubblePartTool/index.vue
pnpm exec tsc --noEmit
```

Expected: all commands exit with code 0. Update the changelog to state that Shell failure summaries use the error color while cancelled summaries remain tertiary gray, then run `git diff --check` for the modified files.
