# MCP SDK 迁移 — 代码审查报告

> 审查日期：2026-05-26
> 审查范围：staged changes（35 个文件，+4165 / -1095 行）

## 📊 总览

- 删除 `local-stdio.mts`、`runtime.mts` 两个旧文件
- 新增 10 个模块文件（transport / client / session / discovery / status / errors / notifications / oauth 四件套）
- 前端适配、类型定义、测试同步更新

---

## ✅ 做得好的地方

1. **模块拆分清晰** — 从原来的两个大文件（`local-stdio.mts` 367行 + `runtime.mts` 385行）拆分为职责单一的 10 个小模块，符合单一职责原则
2. **类型安全** — `MCPServerConfig`、`MCPRuntimeStatus` 等类型定义完整，新增 `needs_auth` / `needs_client_registration` 状态
3. **注释规范** — 每个文件都有 `@file` + `@description` 头注释，所有函数都有 JSDoc，符合 AGENTS.md 规范
4. **IPC 接口完整** — 新增 `oauth:start`、`oauth:clear`、`tools-changed` 通道，preload 层同步暴露
5. **前端适配** — ServerEditor 支持 transport 切换、URL 编辑、OAuth 开关，MCP 列表页条件渲染远程服务器信息
6. **状态机设计** — `STATUS_TRANSITIONS` 定义合法转换，`canTransition` 可验证

---

## 🔴 严重问题（必须修复）

### 1. `session.mts:138` — 先关闭旧会话再注册通知，顺序错误

```typescript
// 第 119-139 行
if (server.watchToolChanges !== false) {
  registerNotificationHandlers(wrapper.client, server.id, { ... });
}

await closeSession(server.id);     // ← 这里会断开刚注册通知的 wrapper！
sessionsByServerId.set(server.id, wrapper);  // ← 存的是另一个 wrapper，不是已关闭的那个
```

**问题**：`closeSession` 会调用 `wrapper.disconnect()`，但刚注册通知的 `wrapper` 和 `sessionsByServerId` 存的不是同一个引用。逻辑是先创建新 wrapper → 注册通知 → 关闭旧 session → 存新 wrapper，但 `closeSession` 传入的是 `server.id`，会从 map 取旧 session 关闭，这没问题。**然而**，如果在连接过程中旧 session 已存在，`closeSession` 会先从 map 删除旧 session，此时新 wrapper 还没存进 map。如果注册通知后的回调触发了 `sessionsByServerId.get(serverId)`，会取不到。

**建议**：调整为先关闭旧会话，再创建新 wrapper：

```typescript
await closeSession(server.id);  // 先关旧的
sessionsByServerId.set(server.id, wrapper);  // 先存新的
// 再注册通知（回调中 sessionsByServerId.get 才能取到）
if (server.watchToolChanges !== false) { ... }
```

### 2. `session.mts:266-300` — `startOAuth` 流程不完整

```typescript
export async function startOAuth(server: MCPServerConfig): Promise<{ authorizationUrl: string }> {
  // ...
  try {
    await wrapper.connect();
  } catch (connectError) {
    if (connectError instanceof AuthorizationPendingError) {
      const authorizationUrl = connectError.authorizationUrl.toString();
      const state = new URL(authorizationUrl).searchParams.get('state') ?? '';
      const callbackResult = await callbackServer.waitForCallback(state);

      await (transport as AuthableTransport).finishAuth(callbackResult.code);
      // ← finishAuth 后没有重新连接！只是关掉了 session
      await closeSession(server.id);
      return { authorizationUrl };
    }
    throw connectError;
  }
  // ← 如果 connect 直接成功（无需 OAuth），返回空 URL 但没存 session
  await closeSession(server.id);
  return { authorizationUrl: '' };
}
```

**问题**：
- `finishAuth` 完成后应重新调用 `wrapper.connect()` 来建立已认证的连接
- 如果 connect 直接成功（已有有效 token），应该保留 session 而非关闭
- 返回 `authorizationUrl` 后，调用方（前端）并不知道 OAuth 已完成

### 3. `session.mts:287` — 不安全的类型断言

```typescript
await (transport as AuthableTransport).finishAuth(callbackResult.code);
```

`AuthableTransport` 类型是 `StreamableHTTPClientTransport`，但如果 `server.transport === 'sse'`，实际 transport 也是 `StreamableHTTPClientTransport`（因为 `transport.mts` 统一用 StreamableHTTP）。这个断言可能正确但很脆弱，如果 SDK 未来变化会出问题。应添加运行时检查。

### 4. `ipc.mts:43-47` — 重复注册 `onToolsChanged` 监听器

```typescript
export function registerMcpHandlers(): void {
  // ...
  onToolsChanged((serverId: string) => {  // ← 每次调用都注册一个新的
    for (const win of BrowserWindow.getAllWindows()) { ... }
  });
}
```

如果 `registerMcpHandlers()` 被调用多次（如测试、热重载），监听器会累加。应做幂等处理或先移除旧监听。

---

## 🟡 中等问题（建议修复）

### 5. `transport.mts` — SSE 使用 StreamableHTTP 传输，与配置语义不一致

```typescript
case 'streamableHTTP':
case 'sse': {
  return new StreamableHTTPClientTransport(new URL(server.url), { ... });
}
```

用户配置 `transport: 'sse'` 但实际创建的是 `StreamableHTTPClientTransport`。虽然 SDK 的 StreamableHTTP 确实内置 SSE 回退，但用户可能期望使用专用的 SSE 传输。至少应在注释中说明，或考虑使用 `SSEClientTransport`。

### 6. `errors.mts:33-34` — 错误分类优先级有问题

```typescript
if (lower.includes('registration')) {
  return { code: 'CLIENT_REGISTRATION_REQUIRED', status: 'needs_client_registration', message };
}
if (lower.includes('401') || lower.includes('unauthorized')) {
  return { code: 'AUTH_REQUIRED', ... };
}
```

如果一个错误消息同时包含 "registration" 和 "unauthorized"（如 "Unauthorized: client registration required"），会被错误归类为 `CLIENT_REGISTRATION_REQUIRED` 而非 `AUTH_REQUIRED`。此外 `lower.includes('registration')` 太宽泛，可能会误匹配 "complete your registration" 等不相关消息。

### 7. `callback-server.mts` — 端口冲突未处理

```typescript
this.server.listen(OAUTH_CALLBACK_PORT, () => { ... });
```

固定使用端口 19876，如果端口被占用会直接抛错。应添加错误处理或支持动态端口。

### 8. `status.mts` — `setStatus` 没有校验状态转换合法性

`canTransition` 函数定义了但 `setStatus` 从未调用它，任何非法状态转换都能通过。应添加校验或至少 log 警告。

### 9. `client.mts:65` — `args` 类型断言

```typescript
const result = await client.callTool({ name, arguments: args as Record<string, unknown> });
```

`args` 是 `unknown`，直接断言为 `Record<string, unknown>` 不安全。应做运行时验证或使用更精确的类型。

### 10. `oauth/provider.mts` — `loadOAuthData` 是同步的但接口方法声明为 `async`

`clientInformation()`、`tokens()` 等方法标记为 `async`，但内部调用的 `loadOAuthData` 是同步函数（从 Electron Store 读取）。这是正确的（满足接口契约），但如果 Store 操作变异步后可能需要重构。

### 11. `session.mts:153-179` — SSE 回退逻辑在 session 层，不属于这里

`connectMcpServer` 中当 streamableHTTP 失败时自动尝试 SSE 回退。这个逻辑：
- 混淆了连接层与传输层职责
- 只在非 OAuth 错误时回退，但 OAuth 错误也可能是传输协议不匹配导致的
- 回退成功后 server 配置仍然是 `streamableHTTP`，但实际用 SSE 传输，状态不一致

---

## 🟢 轻微问题（建议改进）

### 12. `types/ai.d.ts` 与 `src/shared/storage/tool-settings/types.ts` — `MCPOAuthConfig` 重复定义

`MCPOAuthConfig` 在两个文件中各定义了一次。应统一为一个来源。

### 13. `oauth/storage.mts` — `toOAuthConfig` 导出但未被调用

`toOAuthConfig` 函数从 `storage.mts` 导出，也在 `oauth/index.mts` 中 re-export，但整个代码库中没有任何地方调用它。属于死代码。

### 14. 测试文件 — `mcp-local-stdio.test.ts` 文件名与内容不匹配

文件头注释改为"验证 MCP transport 工厂与 client 包装器的基础行为"，但文件名仍叫 `mcp-local-stdio.test.ts`。应重命名。

### 15. `mcp-runtime.test.ts` 内容已改为测试 session 但文件名未更新

虽然 diff 显示内容更新为测试 session 模块，但文件路径仍为 `test/electron/mcp-runtime.test.ts`，应重命名为 `mcp-session.test.ts`。

### 16. `tools.mts:34-35` — `isServerRunnableForRequest` 只检查配置完整性，未检查运行时状态

```typescript
if (server.transport === 'stdio') return server.command.trim().length > 0;
return Boolean(server.url?.trim());
```

远程服务器即使有 URL 也可能还没连接（`runtimeStatus` 不是 `connected`），但这里只检查了配置完整性，没有检查运行时状态。

---

## 📋 汇总

| 严重度 | 数量 | 关键项 |
|--------|------|--------|
| 🔴 严重 | 4 | session 顺序错误、OAuth 流程不完整、不安全类型断言、IPC 监听器累加 |
| 🟡 中等 | 7 | SSE 语义不一致、错误分类优先级、端口冲突、状态转换未校验、类型断言、同步/异步不匹配、回退逻辑层级 |
| 🟢 轻微 | 5 | 类型重复定义、死代码导出、测试文件名不匹配（x2）、运行时状态未检查 |

**建议优先修复 4 个严重问题**，尤其是 `session.mts` 中的连接顺序和 OAuth 流程，这两个会直接影响运行时正确性。
