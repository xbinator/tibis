# Graphite Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a soft black-white-gray Graphite theme preset inspired by a clean, light-gray product shell.

**Architecture:** Implement Graphite as a standalone full-token preset because the reference depends on precise white and gray layering. Register it through `src/theme/index.ts` so the existing registry exposes it without changing theme factory behavior.

**Tech Stack:** TypeScript, existing theme registry, Vitest.

## Global Constraints

- Do not use `any`.
- Add file header comments and JSDoc comments for exported or important values.
- Keep theme preset changes isolated under `src/theme`.
- Update `changelog/2026-07-23.md`.
- Verify with focused theme tests after implementation.

---

### Task 1: Graphite Theme Preset

**Files:**
- Create: `src/theme/presets/graphite.ts`
- Modify: `src/theme/index.ts`
- Modify: `test/theme/preset-list.test.ts`
- Modify: `changelog/2026-07-23.md`

**Interfaces:**
- Consumes: `ThemeTokens`, `registerPreset`, `getPresetList`, `getResolvedTokens`, `toCssVars`
- Produces: registered preset `{ id: 'graphite', label: '柔和黑白「Graphite」' }`

- [ ] **Step 1: Write the failing test**

Add registry and token assertions to `test/theme/preset-list.test.ts`:

```typescript
it('registers the soft monochrome Graphite theme preset', (): void => {
  const presets = getPresetList();

  expect(presets).toContainEqual({ id: 'graphite', label: '柔和黑白「Graphite」' });
});

it('resolves Graphite tokens for soft gray product shell modes', (): void => {
  const lightTokens = getResolvedTokens('graphite', 'light');
  const darkTokens = getResolvedTokens('graphite', 'dark');
  const lightCssVars = toCssVars(lightTokens);

  expect(lightTokens.bg.primary).toBe('#ffffff');
  expect(lightTokens.bg.secondary).toBe('#f4f4f4');
  expect(lightTokens.bg.tertiary).toBe('#eeeeee');
  expect(lightTokens.color.primary).toBe('#1f1f1f');
  expect(lightTokens.border.primary).toBe('#e5e5e5');
  expect(darkTokens.bg.primary).toBe('#121212');
  expect(darkTokens.bg.secondary).toBe('#1a1a1a');
  expect(darkTokens.color.primary).toBe('#f5f5f5');
  expect(lightCssVars['--color-primary']).toBe('#1f1f1f');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/theme/preset-list.test.ts`

Expected: FAIL because `graphite` is not registered yet.

- [ ] **Step 3: Add Graphite tokens and registration**

Create `src/theme/presets/graphite.ts` with `graphiteLight`, `graphiteDark`, and `registerPreset({ id: 'graphite', label: '柔和黑白「Graphite」', light, dark })`.

- [ ] **Step 4: Import the preset**

Add `import './presets/graphite';` to `src/theme/index.ts` after `default`.

- [ ] **Step 5: Update changelog**

Add an Added entry: `新增柔和黑白「Graphite」主题预设，模拟白色工作区与浅灰产品外壳的界面层级。`

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm exec vitest run test/theme/preset-list.test.ts`

Expected: PASS.
