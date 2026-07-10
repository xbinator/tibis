# Widget Runtime Session Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 Widget Session 多轮执行中的异步污染、状态陈旧、方法越界和销毁后任务继续运行问题。

**Architecture:** 保留复用 Worker 与 Widget 实例的结构，在适配器内建立每轮托管任务屏障；Session 每轮同步宿主快照并保存首次基类原型；沙箱与 Vue Runtime 的队列都在真正执行前验证生命周期状态。

**Tech Stack:** Vue 3、TypeScript、Web Worker、Vitest

---

### Task 1: 沙箱桥接与队列生命周期

**Files:**
- Modify: `src/utils/sandbox/worker/bridge.ts`
- Create: `src/utils/sandbox/worker/runtime.ts`
- Modify: `src/utils/sandbox/worker/index.ts`
- Modify: `src/utils/sandbox/index.ts`
- Test: `test/utils/sandbox-core.test.ts`

- [x] **Step 1: 写失败测试**

新增用例验证 deactivate 拒绝所属运行的 pending host call、本地 Session dispose 后不启动已排队任务，以及 Worker runtime 的第二轮持久宿主代理使用第二轮 `runId`。

- [x] **Step 2: 运行测试并确认 RED**

Run: `pnpm vitest run test/utils/sandbox-core.test.ts`

Expected: pending 调用保持未决、本地排队任务仍执行，Worker runtime API 尚不存在。

- [x] **Step 3: 最小实现**

pending 项保存 `{ runId, resolve, reject }`；`deactivate(runId)` 遍历并拒绝对应调用。本地 `runTask` 开头增加 disposed 校验。新增 `createSandboxWorkerRuntime(postMessage)` 串行处理 run、即时处理 host response，Worker 入口只负责加固全局并转交协议消息。

- [x] **Step 4: 运行测试并确认 GREEN**

Run: `pnpm vitest run test/utils/sandbox-core.test.ts`

### Task 2: Widget 每轮任务与错误传播

**Files:**
- Modify: `src/components/BWidget/utils/widgetRuntime/index.ts`
- Test: `test/components/BChat/widget-runtime.test.ts`
- Test: `test/components/BWidget/widget-runtime-logger.test.ts`

- [x] **Step 1: 写失败测试**

新增用例验证未 await 的 logger continuation 在下一轮开始前完成、未观察的异步 helper 异常使运行拒绝、显式 catch 的异步 helper 不会重复失败。

- [x] **Step 2: 运行测试并确认 RED**

Run: `pnpm vitest run test/components/BChat/widget-runtime.test.ts test/components/BWidget/widget-runtime-logger.test.ts`

Expected: continuation 污染后一轮，未观察 helper 异常被吞掉。

- [x] **Step 3: 最小实现**

执行状态增加托管异步队列；Widget 宿主 API 返回原 Promise，同时把只用于等待完成的 Promise 加入队列。异步 helper 返回可观察 thenable，未被调用方观察的拒绝保留到 flush。运行结束前循环排空 helper、宿主任务与 patch。

- [x] **Step 4: 运行测试并确认 GREEN**

Run: `pnpm vitest run test/components/BChat/widget-runtime.test.ts test/components/BWidget/widget-runtime-logger.test.ts`

### Task 3: Session 快照和方法边界

**Files:**
- Modify: `src/components/BWidget/utils/widgetRuntime/index.ts`
- Modify: `src/components/BWidget/Runtime.vue`
- Test: `test/components/BChat/widget-runtime.test.ts`
- Test: `test/components/BWidget/widget-runtime-view.component.test.ts`

- [x] **Step 1: 写失败测试**

新增用例验证同一 Session 读取更新后的 input/output/data、`toString` 不属于 Widget 公共方法，以及 Runtime 更新 props 后交互读取最新输入。

- [x] **Step 2: 运行测试并确认 RED**

Run: `pnpm vitest run test/components/BChat/widget-runtime.test.ts test/components/BWidget/widget-runtime-view.component.test.ts`

Expected: 返回首次 input、允许调用 `toString`。

- [x] **Step 3: 最小实现**

适配器每轮同步 input/output/data；Session 保存 `widgetBasePrototype` 并作为原型枚举边界；公开 Session 增加 `updateState`；Runtime 复用前同步状态，并让 props 的 value/input/output 覆盖本地数据快照中的对应字段。

- [x] **Step 4: 运行测试并确认 GREEN**

Run: `pnpm vitest run test/components/BChat/widget-runtime.test.ts test/components/BWidget/widget-runtime-view.component.test.ts`

### Task 4: Runtime 卸载保护与完整验证

**Files:**
- Modify: `src/components/BWidget/Runtime.vue`
- Test: `test/components/BWidget/widget-runtime-view.component.test.ts`
- Modify: `changelog/2026-07-11.md`

- [x] **Step 1: 写失败测试**

让 mounted 请求保持未决、排入一次方法交互后卸载组件；释放 mounted 后断言交互请求没有发生，也没有卸载后的 change 事件。

- [x] **Step 2: 运行测试并确认 RED**

Run: `pnpm vitest run test/components/BWidget/widget-runtime-view.component.test.ts`

Expected: 卸载后排队交互仍调用宿主 request。

- [x] **Step 3: 最小实现**

增加 `runtimeUnmounted` 标记；队列任务执行前、Session 创建前和失败处理前检查标记；卸载时使脚本版本失效、清理 patch 并销毁 Session。

- [x] **Step 4: 完整验证**

Run: `pnpm test`

Run: `pnpm exec tsc --noEmit`

Run: `pnpm exec eslint src/utils/sandbox src/components/BWidget/Runtime.vue src/components/BWidget/utils/widgetRuntime/index.ts test/utils/sandbox-core.test.ts test/components/BChat/widget-runtime.test.ts test/components/BWidget/widget-runtime-logger.test.ts test/components/BWidget/widget-runtime-view.component.test.ts --ext .vue,.ts`

Run: `pnpm exec stylelint 'src/components/BWidget/Runtime.vue'`

Run: `pnpm build`
