# Chat Runtime Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消除 ChatRuntime 启动前事件丢失、启动中取消产生孤儿任务、确认授权策略漂移和 XState 同步 action 告警，同时删除已经失去用途的兼容代码。

**Architecture:** Renderer 在调用主进程前生成 Runtime ID，并先把 Session、Turn、Agent 路由和 capability 注册到唯一的应用级事件入口。`useChatRuntime` 退化为无状态 IPC 命令适配器；确认授权通过单一策略模块处理；Turn 和 Agent 创建后直接进入准备态，不再用空转状态加同步 `send()` 驱动。

**Tech Stack:** Vue 3、TypeScript、Electron IPC、XState 5、Vitest

---

### Task 1: 固定 Runtime 启动协议

**Files:**
- Modify: `types/chat-runtime.d.ts`
- Modify: `electron/main/modules/chat/runtime/service.mts`
- Modify: `src/components/BChat/hooks/useChatRuntime.ts`
- Modify: `src/components/BChat/hooks/useChatWorkflow.ts`
- Test: `test/electron/main/modules/chat/runtime/service.test.ts`
- Test: `test/components/BChat/session-id-runtime.test.ts`

- [x] 添加失败测试，证明主进程沿用 renderer 传入的 Runtime ID，且 Runtime IPC 返回前的 bridge/message 事件已有 Actor 路由。
- [x] 添加失败测试，证明启动 IPC 未完成时取消会中止同一 Runtime，迟到结果不会重新注册路由或追加错误消息。
- [x] 在发送、继续和用户选择输入中加入必填 `runtimeId`，主进程拒绝重复 ID。
- [x] Workflow 在 IPC 前完成 Actor/capability 注册，失败或取消时统一注销。
- [x] 运行 Runtime service 和 BChat 定向测试。

### Task 2: 统一事件与确认授权所有权

**Files:**
- Create: `src/ai/chat/policies/runtimeConfirmation.ts`
- Modify: `src/hooks/useChatRuntimeEvents.ts`
- Modify: `src/components/BChat/hooks/useChatRuntime.ts`
- Modify: `src/components/BChat/hooks/useChatWorkflow.ts`
- Modify: `src/hooks/useChatActorSystem.ts`
- Modify: `src/App.vue`
- Test: `test/hooks/use-chat-runtime-events.test.ts`
- Test: `test/components/BChat/use-chat-runtime.test.ts`

- [x] 添加失败测试，证明 application actor 会自动批准已记住授权，用户新授权会写回 permission store。
- [x] 把授权读取、可记忆判断和写入集中到纯策略模块。
- [x] 删除 `useChatRuntime` 的全部 IPC listener 和消息投影逻辑，只保留命令。
- [x] 让 application/local actor 都只安装一次 `useChatRuntimeEvents`，删除 listener 归属 WeakSet。
- [x] 运行 Runtime event、permission 和 BChat 定向测试。

### Task 3: 简化状态机与恢复分支

**Files:**
- Modify: `src/ai/chat/machine/agentMachine.ts`
- Modify: `src/ai/chat/machine/turnMachine.ts`
- Modify: `src/ai/chat/machine/sessionMachine.ts`
- Modify: `src/ai/chat/actorSystem.ts`
- Modify: `types/chat-runtime.d.ts`
- Modify: `electron/main/modules/chat/runtime/service.mts`
- Modify: `src/hooks/useChatRuntimeRecovery.ts`
- Test: `test/ai/chat/session-machine.test.ts`
- Test: `test/ai/chat/actor-system.test.ts`
- Test: `test/hooks/use-chat-runtime-recovery.test.ts`

- [x] 添加测试并拦截 `console.warn`，证明正常 Session 生命周期没有 XState imperative-action 告警。
- [x] Turn 初始进入 `preparing`，Agent 初始进入 `starting`，删除 `turn.prepare`、`agent.start` 及其同步发送。
- [x] 用户选择续跑时将 Agent 返回 `starting`，接收新的 Runtime ID。
- [x] 删除主进程快照永远不可见的 `aborting` 状态及 renderer 对应恢复分支。
- [x] 明确当前 BChat Actor 只路由 primary Agent，移除无效的恢复分支而不扩张 Subagent 功能。
- [x] 运行 Actor 和恢复定向测试，确认无 stderr 告警。

### Task 4: 清理与完整验证

**Files:**
- Modify: `changelog/2026-07-11.md`
- Modify: `docs/superpowers/specs/2026-07-11-bchat-state-machine-design.md`
- Delete: 仅删除前三个任务后经 `rg` 和 TypeScript 确认无引用的兼容函数、类型和测试夹具

- [x] 使用 `rg` 检查旧 listener、旧启动事件、`aborting` 恢复和 WeakSet API 无残留引用。
- [x] 更新架构文档和 changelog，保持仓库相对路径。
- [x] 运行 `pnpm exec vitest run`。
- [x] 运行 `pnpm exec eslint src electron --ext .vue,.ts,.tsx,.js,.jsx,.mts`。
- [x] 运行 `pnpm exec stylelint 'src/**/*.{vue,less,css}'`。
- [x] 运行 `pnpm exec tsc --noEmit` 和 `pnpm build`。
- [x] 运行 `git diff --check` 并检查最终 diff 未包含无关改动。
