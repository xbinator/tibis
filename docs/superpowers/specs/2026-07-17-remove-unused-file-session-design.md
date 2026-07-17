# 移除未使用文件会话设计

## 背景

`src/hooks/useFileSession.ts` 曾作为 Widget 页面通用文件会话入口。当前 Widget 页面已经由 `src/views/widget/hooks/useSession.ts` 提供专用会话实现，仓库中不存在 `useFileSession()` 的运行时调用，但部分模块仍从旧文件导入 `FileSessionState` 和 `UseFileSessionReturn` 类型。

旧实现继续保留会造成两套文件会话行为并存：Widget 页面实际使用专用的加载、磁盘协调和文件监听逻辑，而旧 Hook 的测试只验证已经没有消费者的实现。

## 目标

- 删除没有运行时消费者的 `useFileSession()` 实现及其专属测试。
- 保留自动保存和 Widget 会话仍需要的类型安全。
- 收窄 Widget 子 Hook 的入参，使其只依赖实际使用的 `data` 引用。
- 更新现行架构文档和当天 changelog。
- 不改变 Widget 页面加载、编辑、保存、自动保存和外部文件同步行为。

## 非目标

- 不重构 `src/views/widget/hooks/useSession.ts` 的业务流程。
- 不重新引入通用文件会话抽象。
- 不修改历史设计和实施计划；这些文档保留当时的架构记录。
- 不改变 `useFileAutoSave` 或 `useSavePolicy` 的运行时行为。

## 方案比较

### 方案一：删除旧实现并迁移最小类型契约（采用）

将 `FileSessionState` 移入独立的公共类型文件。Widget 页面定义自己的会话数据契约，仅暴露子 Hook 实际需要的 `data: Ref<WidgetData>`。随后删除旧 Hook 和旧 Hook 专属测试。

优点是消除死代码和双轨测试，同时让类型依赖与真实职责一致。缺点是需要更新若干类型导入。

### 方案二：保留旧实现

不修改代码，只把它视为未来可能复用的基础设施。该方案没有当前消费者，会持续增加维护成本，并可能让旧测试通过但真实 Widget 会话发生回归，因此不采用。

### 方案三：让 Widget 专用会话重新组合通用 Hook

扩展 `useFileSession`，允许注入 Widget 路径解析、草稿协调、解析错误、写盘事件抑制和外部冲突策略。该方案能够重新建立通用抽象，但改动范围大，而且当前只有一个实际会话消费者，不符合本次清理的最小范围，因此不采用。

## 类型边界

新增 `src/hooks/types.ts`，导出 `FileSessionState`。它仍由 `src/hooks/useFileAutoSave.ts` 和 `src/views/widget/hooks/useSession.ts` 共用。

在 `src/views/widget/hooks/types.ts` 中新增 Widget 页面最小会话接口，只包含：

```ts
interface WidgetDataSession {
  data: Ref<WidgetData>;
}
```

`useSelection`、`useMultiSelection` 和 `useLayerActions` 改为依赖该接口。完整的 `WidgetSessionReturn` 在 `src/views/widget/hooks/useSession.ts` 中直接声明 `fileState`、`data`、`currentTitle` 和 `actions`，不再继承已删除的通用返回类型。

## 删除范围

- 删除 `src/hooks/useFileSession.ts`。
- 删除 `test/hooks/use-file-session.test.ts`。
- 更新剩余源码和测试中的类型导入。
- 更新 `CONTEXT.md`，移除将 `useFileSession` 描述为现行跨页面能力的内容。
- 在 `changelog/2026-07-17.md` 记录清理。

历史 `docs/superpowers/specs/` 和 `docs/superpowers/plans/` 中对 `useFileSession` 的引用不修改，以保留历史决策上下文。

## 行为与错误处理

本次不修改运行时代码路径。Widget 仍由专用 `useSession` 处理加载错误、JSON 解析错误、磁盘冲突、保存失败和文件监听事件。自动保存仍接收结构相同的 `FileSessionState`。

## 验证

- 搜索确认源码中不存在 `useFileSession`、`UseFileSessionReturn`、`UseFileSessionOptions` 和 `FileSessionKind` 残留引用。
- 运行 Widget 会话、选区、图层、多选和文件自动保存相关测试。
- 运行 `pnpm exec tsc --noEmit`。
- 运行 `pnpm exec eslint src --ext .vue,.ts,.tsx,.js,.jsx`。
- 运行 `pnpm exec stylelint 'src/**/*.{vue,less,css}'`，确认类型清理未引入样式回归。

## 成功标准

- 旧 Hook 和专属测试被移除。
- 所有仍需使用的文件会话状态都有明确类型来源。
- Widget 子 Hook 不再依赖完整文件会话接口。
- Widget 行为和现有验证保持通过。
