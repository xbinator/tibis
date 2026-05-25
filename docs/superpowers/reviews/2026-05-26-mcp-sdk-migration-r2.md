# MCP SDK 迁移 — 代码审查报告（第二轮）

> 审查日期：2026-05-26
> 审查范围：staged changes（38 个文件，+4486 / -1215 行）
> 前次审查：docs/superpowers/reviews/2026-05-26-mcp-sdk-migration.md

---

## 📋 上轮问题修复跟踪

| # | 严重度 | 问题描述 | 状态 | 说明 |
|---|--------|----------|------|------|
| 1 | 🔴 | `session.mts` 连接顺序错误（先注册通知后存 map） | ✅ 已修复 | 第 119-120 行先 `closeSession` 再 `sessionsByServerId.set`，第 122 行后才注册通知 |
| 2 | 🔴 | `startOAuth` 流程不完整（finishAuth 后未重连、直接成功时关闭了 session） | ✅ 已修复 | 第 265-267 行 finishAuth 后 `closeSession` → `set` → `wrapper.connect()`；第 275-278 行直接成功时保留 session |
| 3 | 🔴 | 不安全类型断言 `(transport as AuthableTransport)` | ⚠️ 部分修复 | 第 260 行添加了 `typeof .finishAuth === 'function'` 运行时检查，但断言仍然存在（见下文） |
| 4 | 🔴 | IPC `onToolsChanged` 监听器重复注册 | ✅ 已修复 | `ipc.mts:22` 新增 `toolsChangedListenerRegistered` 标志，幂等注册 |
| 5 | 🟡 | SSE 使用 StreamableHTTP 语义不一致 | ✅ 已修复 | `transport.mts:45-47` 添加了注释说明 SDK 弃用 SSEClientTransport 及 StreamableHTTP 内置回退机制 |
| 6 | 🟡 | 错误分类优先级问题（registration 误匹配） | ✅ 已修复 | `errors.mts:33-38` 改为先检查 401/unauthorized，再在 401 上下文中检查 `client registration` / `registration_required` |
| 7 | 🟡 | callback-server 端口冲突未处理 | ✅ 已修复 | `callback-server.mts:80-91` 添加了 `server.on('error')` 监听 `EADDRINUSE` |
| 8 | 🟡 | `setStatus` 未校验状态转换合法性 | ✅ 已修复 | `status.mts:81-84` 添加了 `canTransition` 检查，非法转换时 `console.warn` |
| 9 | 🟡 | `client.mts` args 类型断言 | ✅ 已修复 | `client.mts:65` 改为 `args !== null && typeof args === 'object' ? (args as Record<string, unknown>) : {}`，添加了运行时保护 |
| 10 | 🟡 | SSE 回退逻辑在 session 层 | ✅ 已修复 | 已移除 SSE 回退逻辑，session.mts 不再包含 fallback 代码 |
| 11 | 🟡 | `loadOAuthData` 同步/async 不匹配 | ⏭ 保留 | 接口契约要求 async，内部同步实现满足契约，暂不需要改 |
| 12 | 🟢 | `MCPOAuthConfig` 重复定义 | ⏭ 保留 | `types/ai.d.ts` 与 `src/shared/storage/tool-settings/types.ts` 仍重复定义 |
| 13 | 🟢 | `toOAuthConfig` 死代码 | ✅ 已修复 | 已从 `oauth/storage.mts` 和 `oauth/index.mts` 中移除 |
| 14 | 🟢 | `mcp-local-stdio.test.ts` 文件名不匹配 | ✅ 已修复 | 已删除旧文件，新建 `mcp-transport-client.test.ts` |
| 15 | 🟢 | `mcp-runtime.test.ts` 未重命名 | ✅ 已修复 | 已删除旧文件，新建 `mcp-session.test.ts` |
| 16 | 🟢 | `isServerRunnableForRequest` 未检查运行时状态 | ✅ 已修复 | `tools.mts:26-28` 注释说明了仅检查配置完整性，运行时连接由 `executeMcpTool` 按需重连 |

**上轮 16 个问题：12 个已修复，3 个保留/已知，1 个部分修复。**

---

## 🔴 新发现的严重问题

### N1. `session.mts:263` — 类型断言仍然不安全

```typescript
if (typeof (transport as AuthableTransport).finishAuth !== 'function') {
  throw new Error('Transport does not support finishAuth');
}
await (transport as AuthableTransport).finishAuth(callbackResult.code);
```

虽然添加了运行时检查，但 `(transport as AuthableTransport)` 两次断言同一类型。问题在于：
- 如果 `transport` 实际类型不支持 `finishAuth`，TypeScript 编译器不会报错，因为断言绕过了类型系统
- 更安全的写法是定义一个窄接口并做类型守卫

**建议**：

```typescript
interface FinishAuthable {
  finishAuth(code: string): Promise<void>;
}

function isFinishAuthable(t: unknown): t is FinishAuthable {
  return t !== null && typeof t === 'object' && typeof (t as FinishAuthable).finishAuth === 'function';
}

if (!isFinishAuthable(transport)) {
  throw new Error('Transport does not support finishAuth');
}
await transport.finishAuth(callbackResult.code);  // 类型安全
```

### N2. `session.mts:267` — `wrapper.connect()` 在 finishAuth 后可能失败，缺少错误处理

```typescript
await (transport as AuthableTransport).finishAuth(callbackResult.code);

await closeSession(server.id);
sessionsByServerId.set(server.id, wrapper);
await wrapper.connect();  // ← 如果这里抛异常？

setStatus(server.id, 'connected', 'ready');
return { authorizationUrl };
```

如果 `wrapper.connect()` 在 finishAuth 后失败（如 token 仍无效、网络问题），异常会传播到外层 catch，但 `sessionsByServerId` 中已经存了一个未连接的 wrapper，状态不一致。

**建议**：`wrapper.connect()` 应包在 try/catch 中，失败时从 map 中移除 wrapper 并设置 failed 状态。

### N3. `session.mts:257` — 从 `authorizationUrl` 解析 state 不够健壮

```typescript
const authorizationUrl = connectError.authorizationUrl.toString();
const state = new URL(authorizationUrl).searchParams.get('state') ?? '';
```

OAuth 的 state 参数不是从 authorizationUrl 解析的——state 是客户端在发起授权请求前自己生成的，然后拼接到 authorizationUrl 上。但这里从 redirect URL（由 SDK 返回的 `redirectToAuthorization` 参数 url）中解析 state，实际上 SDK 可能在 URL 中附带了 state。这种做法依赖于 SDK 的内部实现细节，如果 SDK 更改 state 的传递方式会出问题。

**建议**：应由 `TibisOAuthProvider` 在 `saveCodeVerifier` 时同时保存 state，然后从存储中读取，而非从 URL 解析。

---

## 🟡 新发现的中等问题

### N4. `status.mts:83` — 非法状态转换仅 `console.warn`，仍会强制设置

```typescript
if (current && !canTransition(current.runtimeStatus, runtimeStatus)) {
  console.warn(`[MCP] Invalid status transition for ${serverId}: ${current.runtimeStatus} → ${runtimeStatus}`);
}
statusByServerId.set(serverId, { ... });  // 无论如何都会设置
```

warn 之后仍然执行了 `set`，非法转换照样生效。对于调试这可以理解，但生产环境中可能导致状态机被破坏。建议至少在开发模式下抛错，或引入 strict 模式选项。

### N5. `ipc.mts:29-34` — IPC handle 通道未做幂等防护

```typescript
export function registerMcpHandlers(): void {
  ipcMain.handle('tools:mcp:get-status', ...);
  ipcMain.handle('tools:mcp:connect', ...);
  // ...
}
```

虽然 `onToolsChanged` 做了幂等处理，但 `ipcMain.handle` 注册通道没有防重。如果多次调用 `registerMcpHandlers()`，Electron 会抛 `Attempted to register a second handler for 'tools:mcp:get-status'` 错误。

**建议**：要么整个函数做幂等（先 `removeAllHandlers` 或加标志位），要么在注释中明确说明只能调用一次。

### N6. `client.mts:65` — `callTool` 对 `args` 的运行时保护丢失了非对象但有效的参数

```typescript
const safeArgs = args !== null && typeof args === 'object' ? (args as Record<string, unknown>) : {};
```

如果 `args` 是一个数组（合法的 JSON 值），`typeof args === 'object'` 为 true，但 `args as Record<string, unknown>` 会把数组当作对象使用。此外 MCP SDK 的 `callTool` 要求 `arguments` 是 `Record<string, unknown>`，如果 args 是数组则语义不正确。

这比之前的 `as Record<string, unknown>` 更安全，但数组仍可能滑过。

### N7. `session.mts` — `registerNotificationHandlers` 可能在重连时重复注册

```typescript
if (server.watchToolChanges !== false) {
  registerNotificationHandlers(wrapper.client, server.id, { ... });
}
```

每次 `connectMcpServer` 成功都会注册新的通知处理器。如果同一个 server 断开再重连（如 `restartMcpServer`），SDK Client 是新建的，所以不会重复注册到同一个 Client 上。但如果 `refreshMcpDiscovery` 走到 `connectMcpServer` 分支（第 196 行），也会注册新的通知处理器。

经分析，因为每次都创建新的 Client + Transport，通知处理器绑定在新 Client 上，旧 Client 随 closeSession 被丢弃，所以不会重复触发。**但** 如果 SDK 的 `setNotificationHandler` 有全局副作用则需要验证。当前实现逻辑上是正确的，但建议添加注释说明为何不需要清理。

### N8. `errors.mts:33-34` — 错误分类仍可能误判

```typescript
if (lower.includes('401') || lower.includes('unauthorized')) {
  if (lower.includes('client registration') || lower.includes('registration_required')) {
    return { code: 'CLIENT_REGISTRATION_REQUIRED', ... };
  }
  return { code: 'AUTH_REQUIRED', ... };
}
```

改进后的逻辑比之前好（先检查 401 再细分 registration），但 `"registration_required"` 的匹配条件过于严格——如果服务端返回 `"registration required"` （没有下划线），且消息中不包含 `401` 或 `unauthorized`，会落入 `CONNECTION_FAILED` 而非 `CLIENT_REGISTRATION_REQUIRED`。

测试文件 `mcp-transport-client.test.ts:91-97` 验证了这个行为：

```typescript
it('classifies generic registration as auth required', async () => {
  const result = classifyMcpError(new Error('registration required'));
  expect(result.code).toBe('CONNECTION_FAILED');
  expect(result.status).toBe('failed');
});
```

测试描述是 "classifies generic registration as auth required" 但断言的是 `CONNECTION_FAILED`，**测试描述与断言不一致**。

### N9. `oauth/storage.mts` — 敏感数据（clientSecret、accessToken、refreshToken）以明文存储在 Electron Store

`saveOAuthData` 直接将包含 `clientSecret`、`accessToken`、`refreshToken` 的数据存入 Electron Store。虽然 Electron Store 使用文件系统存储（非 localStorage），且操作系统级别有用户隔离，但明文存储令牌和密钥仍然是安全风险。

建议在后续迭代中使用 Electron 的 `safeStorage` API 加密敏感字段。

---

## 🟢 新发现的轻微问题

### N10. 测试文件头注释与文件名不匹配

- `mcp-session.test.ts` 第 2 行：`@file mcp-runtime.test.ts` — 文件名应为 `mcp-session.test.ts`
- `mcp-transport-client.test.ts` 第 2 行：`@file mcp-local-stdio.test.ts` — 文件名应为 `mcp-transport-client.test.ts`

### N11. `session.mts` — `startOAuth` 成功路径未返回 discovery cache

`startOAuth` 在 OAuth 成功并重连后（第 269 行），仅设置了 `connected` 状态但没有刷新 discovery cache（没有调用 `listTools()` 和 `createDiscoverySuccessResult`）。前端调用 `startOAuth` 后需要额外调用 `refreshMcpDiscovery` 才能拿到工具列表。

这不算 bug（前端可以后续调用），但与 `connectMcpServer` 的行为不一致（后者会自动刷新 discovery）。

### N12. `ipc.mts:22` — 幂等标志用模块级变量，测试中无法重置

```typescript
let toolsChangedListenerRegistered = false;
```

`mcp-ipc.test.ts` 使用了 `vi.resetModules()`，但标志位是模块级变量，`resetModules` 会让模块重新加载并重置标志。当前测试只调用一次 `registerMcpHandlers` 所以不会出问题，但如果未来添加多次调用的测试可能遇到意外。

---

## 📋 总汇总

| 严重度 | 上轮遗留 | 新发现 | 说明 |
|--------|----------|--------|------|
| 🔴 严重 | 1（部分修复→升级为 N1） | 3 | 类型断言、connect 失败状态不一致、state 解析不健壮 |
| 🟡 中等 | 0 | 6 | 状态转换仅 warn、IPC handle 未幂等、数组参数滑过、通知注册注释缺失、错误分类测试描述不一致、OAuth 明文存储 |
| 🟢 轻微 | 0 | 3 | 测试文件头注释、startOAuth 未返回 cache、幂等标志不可重置 |

### 上轮修复率

- 16 个问题中 **12 个完全修复**，修复率 75%
- 3 个已知保留（类型重复、async 契约、类型重复定义）
- 1 个部分修复但仍有改进空间

### 优先修复建议

1. **N2**（`startOAuth` 中 `wrapper.connect()` 失败后状态不一致）— 影响运行时正确性
2. **N1**（类型断言改类型守卫）— 提升类型安全
3. **N8**（测试描述与断言不一致）— 低成本修复，避免后续维护困惑
4. **N10**（测试文件头注释）— 低成本修复
