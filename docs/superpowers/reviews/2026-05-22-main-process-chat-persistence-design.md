# Review: Main Process Chat Persistence Design

## Overall Assessment

整体来看这是一份扎实的设计文档——问题陈述清晰，阶段划分合理，边界原则明确。以下是按重要性排列的问题。

---

## 1. Transaction API 规格不足（阻塞项）

设计依赖 database service 提供 `runTransaction` 辅助方法，但 `better-sqlite3` 是同步 API，而 IPC 是异步的——无法通过 `ipcMain.handle` 传递回调函数。两种可行方案：

**A) 单次 IPC 传递语句数组** — `db:transaction([{sql, params}, ...])` — 主进程将其包裹在 `BEGIN/COMMIT` 中。简单，但无法在事务内做条件逻辑（如先 SELECT usage、再计算、再 UPDATE）。

**B) 暴露 `db.transaction()` 作为同步包装** — 让 `ChatService` 方法保持同步，通过一个专用的 `chat:execute` IPC 调用整个 service 方法，在内部用 `db.transaction()` 包裹。

考虑到 usage 累加需要 SELECT → 计算 → UPDATE 的逻辑，方案 B 更合适——整个 `addMessage` service 方法应该作为事务单元。建议在设计中明确选择一种方案，并给出 `runTransaction` 的具体签名。

---

## 2. `createSession` — ID 归属权未决（设计决策悬空）

文档在 Transaction Rules 中说"推荐主进程生成"，又在 Open Decisions 中保留余地。迁移代码示例展示的是 `chatStorage.createSession({ type, title })` 返回 `ChatSession`，暗示主进程生成 ID。但 Phase 1 的范围是"不改变 UI 行为"——改变 ID 生成方会改变 `createSession` 的返回签名（从 void 变为返回 session）。

**建议**：Phase 1 保留渲染端生成 ID，在 `ChatCreateSessionInput` 中增加 `sessionId` 字段供主进程接受。Phase 4（AI 任务集成）有实际需求时再切换到主进程生成。这样 Phase 1 风险最小。

---

## 3. 独立 API 被静默移除，缺少废弃说明

设计正确地将 `updateSessionLastMessageAt` 和 `addSessionUsage` 合并进事务性的 `chat:messages:add`。但这两个是 `chatStorage` 上的公开方法，在 store（`session.ts:106-108`）中被直接调用。设计应明确列出它们为**有意移除**，避免读者误以为是遗漏：

| 旧 `chatStorage` 方法 | 归宿 |
|---|---|
| `updateSessionLastMessageAt` | 合并进 `chat:messages:add` 事务 |
| `addSessionUsage` | 合并进 `chat:messages:add` 事务 |
| `updateSessionUsage` | 合并进 `chat:messages:set` 事务 |

---

## 4. `sumMessagesUsage` 迁移位置模糊

设计说"推荐主进程重新计算 usage"和"第一阶段可以把 `sumMessagesUsage` 迁到主进程"。但当前 `sumMessagesUsage` 操作的是 `PersistableMessage`（组件类型），而主进程接收的是 `ChatMessageRecord[]`。两者都有 `usage` 字段，功能上可行——但设计应明确标注这个类型变化。在新架构中，repository/mapper 应持有 `sumMessagesUsage`。

---

## 5. `isDatabaseAvailable()` 逐次检查模式需显式移除

当前 `sqlite.ts` 在**每次调用**都检查 `isDatabaseAvailable()` 并降级到 localStorage。新设计应在构造时一次性选择 adapter：

```ts
const chatStorage = hasElectronAPI() ? electronChatStorage : memoryChatStorage;
```

Fallback Strategy 部分提到了这一点，但没有明确说**逐次检查应从 Electron 主路径中移除**。这一点很重要：Electron 适配器不应有任何降级逻辑——如果 Electron 环境下 SQLite 不可用，那是致命错误，不应静默切换到 localStorage 造成数据分叉。

---

## 6. 会话游标分页在 IPC 部分缺少类型定义

`chat:sessions:list` API 引用了 `SessionPaginationParams` 但未展示其类型。当前代码的游标为 `{lastMessageAt, createdAt}`。该类型是 IPC 契约的一部分，设计文档中应包含其定义。

---

## 7. 空 `setMessages` 的 usage 行为

文档将其列为开放决策。当前行为：store 中的 `setSessionMessages` 在消息为空时调用 `chatStorage.updateSessionUsage(sessionId, undefined)`。设计应明确承诺：**空的 `setMessages` 将 `usage_json` 设为 NULL**——与当前行为保持一致。这是一个真实的 UX 问题：如果用户通过重新生成删除了所有消息，usage 面板应显示零还是旧数据？当前行为（清空）是正确的，保持不变即可。

---

## 8. `addMessage` 缺少对 session 存在性的校验

当前代码会对不存在的 session 执行 `INSERT OR REPLACE`，产生孤儿消息。设计列出了校验规则（sessionId 非空、role 有效、sessionId 匹配）但没有指定是否验证 session 是否存在。**建议**：在 `addMessage` 事务中加入 FK 检查或显式 `SELECT`。孤儿消息没有意义。

---

## 9. `chat:sessions:create` 输入缺少时间戳字段

当前渲染端生成 `createdAt`、`updatedAt`、`lastMessageAt` 均设为 `now`。如果主进程生成 session，也应由主进程生成时间戳。如果渲染端保留 ID 生成，也应传入时间戳。无论如何，设计中的 `ChatCreateSessionInput` 接口不完整——应包含或显式排除时间戳字段。

---

## 10. "UPSERT" 术语不匹配

事务规则部分使用了 `UPSERT chat_messages`，但 `better-sqlite3` 实际使用的是 `INSERT OR REPLACE`。两者语义不同（UPSERT 是 SQL 标准，INSERT OR REPLACE 是 DELETE + INSERT）。设计文档中应统一使用 `INSERT OR REPLACE` 以匹配实际 SQL 方言。

---

## 11. `listMessages` 契约缺少排序说明

服务契约中 `listMessages` 返回 `ChatMessageRecord[]` 但未指定排序。当前实现按 `createdAt ASC, id ASC` 排序。这应在服务契约中明确。

---

## 设计亮点

- "什么是真实数据" vs "用户看到什么" 的边界原则非常清晰，将指导本迁移之外的后续决策。
- 分阶段推进、每阶段独立验证的策略务实可行。
- 明确的非目标（尤其是保留 `useChatStream` 在渲染端、不修改表结构）有效防止范围蔓延。
- 测试策略详尽，覆盖 service、repository、store、集成测试各层。
- 错误消息格式约定（`[ChatService] ...`）简洁有效，便于定位问题。
- 双适配器模式（`electronChatStorage` / `memoryChatStorage`）是正确的抽象层次。

---

## 总结

设计整体可靠，可以推进。优先处理第 1-3 项（事务 API 规格、session ID 归属权决策、API 移除清单），其余为可在实现阶段解决的澄清项。
