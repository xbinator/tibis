# Context Usage Budget Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the chat input toolbar context indicator display usage against the usable input budget after reserving output and safety margin.

**Architecture:** Add a pure budget utility shared by UI and compression policy. Extend `useContextUsage` to return a complete budget snapshot. Pass that snapshot through `BChatSidebar/index.vue` and `InputToolbar.vue` so `ContextUsage.vue` only renders normalized data.

**Tech Stack:** Vue 3 Composition API, TypeScript strict mode, Vitest, existing BChatSidebar compression utilities.

---

## Tasks

- [ ] Add and test `src/components/BChatSidebar/utils/contextUsageBudget.ts`.
- [ ] Extend `useContextUsage` to return the budget snapshot and compatibility aliases.
- [ ] Pass the snapshot through `BChatSidebar/index.vue` and `InputToolbar.vue`.
- [ ] Update `ContextUsage.vue` to render usable input budget and status colors.
- [ ] Align compression threshold with the shared usable input budget.
- [ ] Add changelog and run focused verification.
