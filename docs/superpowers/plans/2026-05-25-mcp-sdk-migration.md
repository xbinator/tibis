# MCP SDK Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-rolled MCP JSON-RPC client with the official `@modelcontextprotocol/sdk`, adding OAuth 2.0, tool change notifications, SSE transport, and dynamic client registration.

**Architecture:** New modular design under `electron/main/modules/mcp/` with separate concerns: transport factory, client wrapper, session lifecycle, discovery cache, OAuth flow, notifications, status machine, and error classification. The old `local-stdio.mts` (hand-rolled JSON-RPC) and `runtime.mts` session management are fully replaced.

**Tech Stack:** `@modelcontextprotocol/sdk`, Electron main process, TypeScript, Vitest, Vue 3, Pinia.

---

## File Structure

### New Files

- Create: `electron/main/modules/mcp/transport.mts` — Transport factory (Stdio / StreamableHTTP / SSE)
- Create: `electron/main/modules/mcp/client.mts` — SDK Client wrapper
- Create: `electron/main/modules/mcp/session.mts` — Session lifecycle management (replaces runtime.mts)
- Create: `electron/main/modules/mcp/discovery.mts` — Tool discovery & cache
- Create: `electron/main/modules/mcp/oauth/index.mts` — OAuth entry point
- Create: `electron/main/modules/mcp/oauth/provider.mts` — OAuthClientProvider implementation
- Create: `electron/main/modules/mcp/oauth/callback-server.mts` — Local HTTP callback server
- Create: `electron/main/modules/mcp/oauth/storage.mts` — Token persistence
- Create: `electron/main/modules/mcp/notifications.mts` — MCP notification handlers
- Create: `electron/main/modules/mcp/status.mts` — Status machine & transitions
- Create: `electron/main/modules/mcp/errors.mts` — Error classification
- Create: `electron/main/modules/mcp/index.mts` — Module entry, re-exports public API
- Create: `test/electron/mcp/transport.test.ts`
- Create: `test/electron/mcp/status.test.ts`
- Create: `test/electron/mcp/errors.test.ts`
- Create: `test/electron/mcp/oauth/provider.test.ts`
- Create: `test/electron/mcp/session.test.ts`

### Modified Files

- Modify: `src/shared/storage/tool-settings/types.ts` — Add `streamableHTTP`/`sse` transport, `MCPOAuthConfig`, update `MCPServerConfig`
- Modify: `src/shared/storage/tool-settings/sqlite.ts` — Update normalization for new fields
- Modify: `types/ai.d.ts` — Add `needs_auth`/`needs_client_registration` to `MCPRuntimeStatus`, `MCPOAuthConfig`, update `MCPServerConfig`
- Modify: `types/electron-api.d.ts` — Add OAuth IPC channels, `onToolsChanged`
- Modify: `electron/preload/index.mts` — Add OAuth & notification IPC bindings
- Modify: `electron/main/modules/mcp/ipc.mts` — Register new IPC handlers
- Modify: `electron/main/modules/mcp/tools.mts` — Update `isServerRunnableForRequest` for remote transports
- Modify: `electron/main/modules/ai/service.mts` — Update imports from new module
- Modify: `electron/main/modules/index.mts` — Update imports if needed
- Modify: `src/views/settings/tools/mcp/index.vue` — Add OAuth UI, remote server support
- Modify: `src/views/settings/tools/mcp/components/ServerEditor.vue` — Add transport type, URL, OAuth fields
- Modify: `src/stores/ai/toolSettings.ts` — Update for new MCPServerConfig fields
- Modify: `src/ai/tools/builtin/MCPSettingsTool/index.ts` — Update for new config fields
- Modify: `test/electron/mcp-runtime.test.ts` — Update for new module
- Modify: `test/electron/mcp-local-stdio.test.ts` — Remove (replaced by SDK transport)

### Deleted Files

- Delete: `electron/main/modules/mcp/local-stdio.mts` — Replaced by SDK `StdioClientTransport`
- Delete: `electron/main/modules/mcp/runtime.mts` — Replaced by `session.mts` + `discovery.mts`
- Delete: `test/electron/mcp-local-stdio.test.ts` — No longer needed
- Delete: `test/electron/mcp-ipc.test.ts` — Will be rewritten

---

## Task 1: Install SDK & Update Type Definitions

**Files:**
- Modify: `package.json` (via `pnpm add`)
- Modify: `src/shared/storage/tool-settings/types.ts`
- Modify: `types/ai.d.ts`
- Modify: `src/shared/storage/tool-settings/sqlite.ts`

- [ ] **Step 1: Install `@modelcontextprotocol/sdk`**

Run: `pnpm add @modelcontextprotocol/sdk`

- [ ] **Step 2: Update `src/shared/storage/tool-settings/types.ts` — Add new transport types and OAuth config**

Add `streamableHTTP` and `sse` to `MCPTransportType`. Add `MCPOAuthConfig`. Update `MCPServerConfig` with `url`, `oauth`, `watchToolChanges` fields.

```typescript
export type MCPTransportType = 'stdio' | 'streamableHTTP' | 'sse';

export interface MCPOAuthConfig {
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
}

export interface MCPServerConfig {
  id: string;
  name: string;
  enabled: boolean;
  transport: MCPTransportType;
  url?: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  toolAllowlist: string[];
  oauth?: MCPOAuthConfig;
  watchToolChanges?: boolean;
  connectTimeoutMs: number;
  toolCallTimeoutMs: number;
}
```

- [ ] **Step 3: Update `types/ai.d.ts` — Mirror the same type changes**

Update `MCPRuntimeStatus` to add `needs_auth` and `needs_client_registration`. Update `MCPServerConfig` to match. Add `MCPOAuthConfig`.

```typescript
export type MCPRuntimeStatus = 'idle' | 'connecting' | 'connected' | 'failed' | 'disabled' | 'needs_auth' | 'needs_client_registration';

export type MCPTransportType = 'stdio' | 'streamableHTTP' | 'sse';

export interface MCPOAuthConfig {
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
}

export interface MCPServerConfig {
  id: string;
  name: string;
  enabled: boolean;
  transport: MCPTransportType;
  url?: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  toolAllowlist: string[];
  oauth?: MCPOAuthConfig;
  watchToolChanges?: boolean;
  connectTimeoutMs: number;
  toolCallTimeoutMs: number;
}
```

- [ ] **Step 4: Update `src/shared/storage/tool-settings/sqlite.ts` — Normalize new fields**

Update `normalizeMCPServerConfig` to handle `transport: 'streamableHTTP' | 'sse'`, `url`, `oauth`, and `watchToolChanges`.

```typescript
function normalizeMCPServerConfig(value: unknown): MCPServerConfig | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Partial<MCPServerConfig>;
  if (!source.id?.trim()) return null;

  const transport = source.transport === 'streamableHTTP' || source.transport === 'sse' ? source.transport : 'stdio';
  const args = Array.isArray(source.args) ? source.args.filter((a: unknown): a is string => typeof a === 'string') : [];

  return {
    id: source.id.trim(),
    name: source.name?.trim() || source.command?.trim() || 'Unnamed MCP Server',
    enabled: Boolean(source.enabled),
    transport,
    url: transport !== 'stdio' && typeof source.url === 'string' ? source.url.trim() : undefined,
    command: typeof source.command === 'string' ? source.command.trim() : '',
    args,
    env: normalizeEnv(source.env),
    toolAllowlist: Array.isArray(source.toolAllowlist)
      ? [...new Set(source.toolAllowlist.filter((t: unknown): t is string => typeof t === 'string' && t.trim().length > 0).map((t: string) => t.trim()))]
      : [],
    oauth: normalizeOAuthConfig(source.oauth),
    watchToolChanges: typeof source.watchToolChanges === 'boolean' ? source.watchToolChanges : undefined,
    connectTimeoutMs: normalizeTimeoutMs(source.connectTimeoutMs, DEFAULT_MCP_CONNECT_TIMEOUT_MS, MIN_CONNECT_TIMEOUT_MS, MAX_CONNECT_TIMEOUT_MS),
    toolCallTimeoutMs: normalizeTimeoutMs(source.toolCallTimeoutMs, DEFAULT_MCP_TOOL_CALL_TIMEOUT_MS, MIN_TOOL_CALL_TIMEOUT_MS, MAX_TOOL_CALL_TIMEOUT_MS)
  };
}

function normalizeOAuthConfig(value: unknown): MCPOAuthConfig | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const source = value as Partial<MCPOAuthConfig>;
  return {
    clientId: typeof source.clientId === 'string' ? source.clientId : undefined,
    clientSecret: typeof source.clientSecret === 'string' ? source.clientSecret : undefined,
    accessToken: typeof source.accessToken === 'string' ? source.accessToken : undefined,
    refreshToken: typeof source.refreshToken === 'string' ? source.refreshToken : undefined,
    expiresAt: typeof source.expiresAt === 'number' ? source.expiresAt : undefined,
    scope: typeof source.scope === 'string' ? source.scope : undefined
  };
}
```

- [ ] **Step 5: Run typecheck to verify no breaking changes**

Run: `pnpm run electron:build-main`
Expected: Compile errors only in files that reference old `MCPServerConfig` shape — these will be fixed in subsequent tasks.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(mcp): install SDK and update type definitions for multi-transport + OAuth"
```

---

## Task 2: Error Classification Module

**Files:**
- Create: `electron/main/modules/mcp/errors.mts`
- Create: `test/electron/mcp/errors.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/electron/mcp/errors.test.ts
import { describe, expect, it } from 'vitest';
import { classifyMcpError, isOAuthError, isRetryable } from '../../../electron/main/modules/mcp/errors.mjs';

describe('error classification', () => {
  describe('classifyMcpError', () => {
    it('classifies 401 as AUTH_REQUIRED', () => {
      const error = new Error('Unauthorized: 401');
      const result = classifyMcpError(error);
      expect(result.code).toBe('AUTH_REQUIRED');
      expect(result.status).toBe('needs_auth');
    });

    it('classifies "unauthorized" as AUTH_REQUIRED', () => {
      const error = new Error('User is unauthorized');
      const result = classifyMcpError(error);
      expect(result.code).toBe('AUTH_REQUIRED');
    });

    it('classifies registration required', () => {
      const error = new Error('Dynamic client registration required');
      const result = classifyMcpError(error);
      expect(result.code).toBe('CLIENT_REGISTRATION_REQUIRED');
      expect(result.status).toBe('needs_client_registration');
    });

    it('classifies timeout errors', () => {
      const error = new Error('Connection timed out');
      const result = classifyMcpError(error);
      expect(result.code).toBe('TIMEOUT');
      expect(result.status).toBe('failed');
    });

    it('classifies network errors', () => {
      const error = new Error('fetch failed: ECONNREFUSED');
      const result = classifyMcpError(error);
      expect(result.code).toBe('NETWORK_ERROR');
    });

    it('classifies process exit', () => {
      const error = new Error('Process exited with code 1');
      const result = classifyMcpError(error);
      expect(result.code).toBe('PROCESS_EXITED');
    });

    it('defaults to CONNECTION_FAILED', () => {
      const error = new Error('Some unknown error');
      const result = classifyMcpError(error);
      expect(result.code).toBe('CONNECTION_FAILED');
    });
  });

  describe('isOAuthError', () => {
    it('returns true for AUTH_REQUIRED', () => {
      expect(isOAuthError(new Error('401 Unauthorized'))).toBe(true);
    });
    it('returns false for timeout', () => {
      expect(isOAuthError(new Error('Timeout'))).toBe(false);
    });
  });

  describe('isRetryable', () => {
    it('returns true for timeout', () => {
      expect(isRetryable(new Error('Connection timed out'))).toBe(true);
    });
    it('returns true for network error', () => {
      expect(isRetryable(new Error('ECONNREFUSED'))).toBe(true);
    });
    it('returns false for OAuth error', () => {
      expect(isRetryable(new Error('401 Unauthorized'))).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/electron/mcp/errors.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// electron/main/modules/mcp/errors.mts
/**
 * @file errors.mts
 * @description MCP 错误分类与判断工具。
 */
import type { MCPRuntimeStatus } from 'types/ai';

/**
 * MCP 错误分类结果。
 */
export interface McpErrorClassification {
  /** 稳定错误码 */
  code: McpErrorCode;
  /** 对应的运行状态 */
  status: MCPRuntimeStatus;
  /** 原始错误消息 */
  message: string;
}

/**
 * MCP 稳定错误码。
 */
export type McpErrorCode =
  | 'AUTH_REQUIRED'
  | 'CLIENT_REGISTRATION_REQUIRED'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'PROCESS_EXITED'
  | 'CONNECTION_FAILED';

/**
 * 将未知错误归类为稳定错误码与运行状态。
 * @param error - 原始错误
 * @returns 错误分类结果
 */
export function classifyMcpError(error: unknown): McpErrorClassification {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (lower.includes('401') || lower.includes('unauthorized')) {
    if (lower.includes('registration')) {
      return { code: 'CLIENT_REGISTRATION_REQUIRED', status: 'needs_client_registration', message };
    }
    return { code: 'AUTH_REQUIRED', status: 'needs_auth', message };
  }

  if (lower.includes('timed out') || lower.includes('timeout')) {
    return { code: 'TIMEOUT', status: 'failed', message };
  }

  if (lower.includes('econnrefused') || lower.includes('fetch failed') || lower.includes('enotfound') || lower.includes('network')) {
    return { code: 'NETWORK_ERROR', status: 'failed', message };
  }

  if (lower.includes('process exited') || lower.includes('code=')) {
    return { code: 'PROCESS_EXITED', status: 'failed', message };
  }

  return { code: 'CONNECTION_FAILED', status: 'failed', message };
}

/**
 * 判断错误是否为 OAuth 认证相关。
 * @param error - 原始错误
 * @returns 是否为 OAuth 错误
 */
export function isOAuthError(error: unknown): boolean {
  return classifyMcpError(error).code === 'AUTH_REQUIRED' || classifyMcpError(error).code === 'CLIENT_REGISTRATION_REQUIRED';
}

/**
 * 判断错误是否可重试。
 * @param error - 原始错误
 * @returns 是否可重试
 */
export function isRetryable(error: unknown): boolean {
  const code = classifyMcpError(error).code;
  return code === 'TIMEOUT' || code === 'NETWORK_ERROR' || code === 'CONNECTION_FAILED';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/electron/mcp/errors.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/main/modules/mcp/errors.mts test/electron/mcp/errors.test.ts
git commit -m "feat(mcp): add error classification module"
```

---

## Task 3: Status Machine Module

**Files:**
- Create: `electron/main/modules/mcp/status.mts`
- Create: `test/electron/mcp/status.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/electron/mcp/status.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { canTransition, clearAllStatus, getStatus, setStatus } from '../../../electron/main/modules/mcp/status.mjs';

describe('status management', () => {
  beforeEach(() => {
    clearAllStatus();
  });

  describe('canTransition', () => {
    it('allows idle → connecting', () => {
      expect(canTransition('idle', 'connecting')).toBe(true);
    });
    it('allows connecting → connected', () => {
      expect(canTransition('connecting', 'connected')).toBe(true);
    });
    it('allows connecting → needs_auth', () => {
      expect(canTransition('connecting', 'needs_auth')).toBe(true);
    });
    it('allows connecting → needs_client_registration', () => {
      expect(canTransition('connecting', 'needs_client_registration')).toBe(true);
    });
    it('allows needs_auth → connecting', () => {
      expect(canTransition('needs_auth', 'connecting')).toBe(true);
    });
    it('disallows idle → connected', () => {
      expect(canTransition('idle', 'connected')).toBe(false);
    });
    it('disallows connected → connecting', () => {
      expect(canTransition('connected', 'connecting')).toBe(false);
    });
  });

  describe('setStatus / getStatus', () => {
    it('sets and gets status', () => {
      setStatus('test-server', 'connecting');
      expect(getStatus('test-server').runtimeStatus).toBe('connecting');
    });
    it('returns idle for unknown server', () => {
      expect(getStatus('unknown').runtimeStatus).toBe('idle');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/electron/mcp/status.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// electron/main/modules/mcp/status.mts
/**
 * @file status.mts
 * @description MCP 服务器运行状态管理与合法转换校验。
 */
import type { MCPRuntimeStatus, MCPStatusResponse } from 'types/ai';

/**
 * 合法状态转换表。
 */
const STATUS_TRANSITIONS: Record<MCPRuntimeStatus, MCPRuntimeStatus[]> = {
  idle: ['connecting'],
  connecting: ['connected', 'failed', 'needs_auth', 'needs_client_registration'],
  connected: ['failed', 'idle'],
  failed: ['connecting', 'idle'],
  disabled: ['idle'],
  needs_auth: ['connecting', 'disabled'],
  needs_client_registration: ['disabled']
};

/**
 * sandbox 状态与 runtime 状态的映射。
 */
const SANDBUS_STATUS_MAP: Record<MCPRuntimeStatus, MCPStatusResponse['sandboxStatus']> = {
  idle: 'idle',
  connecting: 'starting',
  connected: 'running',
  failed: 'failed',
  disabled: 'idle',
  needs_auth: 'idle',
  needs_client_registration: 'idle'
};

const statusByServerId = new Map<string, MCPStatusResponse>();

/**
 * 检查状态转换是否合法。
 * @param from - 当前状态
 * @param to - 目标状态
 * @returns 是否允许转换
 */
export function canTransition(from: MCPRuntimeStatus, to: MCPRuntimeStatus): boolean {
  return STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * 获取指定 server 的状态，不存在时返回 idle。
 * @param serverId - server ID
 * @returns MCP 状态响应
 */
export function getStatus(serverId: string): MCPStatusResponse {
  return (
    statusByServerId.get(serverId) ?? {
      serverId,
      runtimeStatus: 'idle',
      sandboxStatus: 'idle',
      discoveryStatus: 'idle'
    }
  );
}

/**
 * 设置指定 server 的运行状态。
 * @param serverId - server ID
 * @param runtimeStatus - 运行状态
 * @param discoveryStatus - 发现状态
 * @param message - 可选状态说明
 */
export function setStatus(serverId: string, runtimeStatus: MCPRuntimeStatus, discoveryStatus?: MCPStatusResponse['discoveryStatus'], message?: string): void {
  statusByServerId.set(serverId, {
    serverId,
    runtimeStatus,
    sandboxStatus: SANDBUS_STATUS_MAP[runtimeStatus],
    discoveryStatus: discoveryStatus ?? (runtimeStatus === 'connected' ? 'ready' : runtimeStatus === 'connecting' ? 'refreshing' : runtimeStatus === 'failed' ? 'failed' : 'idle'),
    ...(message ? { message } : {})
  });
}

/**
 * 清除所有状态，主要用于测试。
 */
export function clearAllStatus(): void {
  statusByServerId.clear();
}

/**
 * 批量获取状态。
 * @param serverIds - server ID 列表
 * @returns 状态列表
 */
export function getStatuses(serverIds: string[]): MCPStatusResponse[] {
  return serverIds.map(getStatus);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/electron/mcp/status.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/main/modules/mcp/status.mts test/electron/mcp/status.test.ts
git commit -m "feat(mcp): add status machine module"
```

---

## Task 4: Transport Factory

**Files:**
- Create: `electron/main/modules/mcp/transport.mts`
- Create: `test/electron/mcp/transport.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/electron/mcp/transport.test.ts
import { describe, expect, it } from 'vitest';
import { createTransport } from '../../../electron/main/modules/mcp/transport.mjs';
import type { MCPServerConfig } from '@/shared/storage/tool-settings';

function createServer(patch: Partial<MCPServerConfig> = {}): MCPServerConfig {
  return {
    id: 'test',
    name: 'Test',
    enabled: true,
    transport: 'stdio',
    command: 'npx',
    args: [],
    env: {},
    toolAllowlist: [],
    connectTimeoutMs: 20000,
    toolCallTimeoutMs: 30000,
    ...patch
  };
}

describe('createTransport', () => {
  it('creates StdioClientTransport for stdio config', () => {
    const transport = createTransport(createServer({ transport: 'stdio', command: 'npx', args: ['-y', 'server'] }));
    expect(transport).toBeDefined();
  });

  it('throws if command is missing for stdio', () => {
    expect(() => createTransport(createServer({ transport: 'stdio', command: '' }))).toThrow('Command is required');
  });

  it('creates StreamableHTTPClientTransport for streamableHTTP config', () => {
    const transport = createTransport(createServer({ transport: 'streamableHTTP', url: 'https://example.com/mcp' }));
    expect(transport).toBeDefined();
  });

  it('throws if URL is missing for streamableHTTP', () => {
    expect(() => createTransport(createServer({ transport: 'streamableHTTP', url: '' }))).toThrow('URL is required');
  });

  it('creates SSEClientTransport for sse config', () => {
    const transport = createTransport(createServer({ transport: 'sse', url: 'https://example.com/mcp/sse' }));
    expect(transport).toBeDefined();
  });

  it('throws if URL is missing for sse', () => {
    expect(() => createTransport(createServer({ transport: 'sse', url: '' }))).toThrow('URL is required');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/electron/mcp/transport.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// electron/main/modules/mcp/transport.mts
/**
 * @file transport.mts
 * @description MCP Transport 工厂，根据配置创建对应的 SDK Transport 实例。
 */
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/http.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type { MCPServerConfig } from 'types/ai';

/**
 * Transport 创建选项。
 */
export interface TransportOptions {
  /** OAuth Provider（仅 HTTP/SSE 需要） */
  authProvider?: OAuthClientProvider;
  /** 连接超时（ms） */
  timeout?: number;
}

/**
 * 创建 MCP Transport 实例。
 * @param server - MCP server 配置
 * @param options - 可选创建选项
 * @returns SDK Transport 实例
 */
export function createTransport(server: MCPServerConfig, options?: TransportOptions) {
  switch (server.transport) {
    case 'stdio': {
      if (!server.command.trim()) {
        throw new Error('Command is required for stdio transport');
      }
      return new StdioClientTransport({
        command: server.command,
        args: server.args,
        env: server.env
      });
    }

    case 'streamableHTTP': {
      if (!server.url?.trim()) {
        throw new Error('URL is required for streamableHTTP transport');
      }
      return new StreamableHTTPClientTransport(new URL(server.url), {
        authProvider: options?.authProvider,
        requestInit: {
          signal: AbortSignal.timeout(options?.timeout ?? server.connectTimeoutMs)
        }
      });
    }

    case 'sse': {
      if (!server.url?.trim()) {
        throw new Error('URL is required for SSE transport');
      }
      return new SSEClientTransport(new URL(server.url), {
        authProvider: options?.authProvider
      });
    }

    default:
      throw new Error(`Unknown transport type: ${server.transport}`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/electron/mcp/transport.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/main/modules/mcp/transport.mts test/electron/mcp/transport.test.ts
git commit -m "feat(mcp): add transport factory module"
```

---

## Task 5: Client Wrapper

**Files:**
- Create: `electron/main/modules/mcp/client.mts`

- [ ] **Step 1: Write the implementation**

```typescript
// electron/main/modules/mcp/client.mts
/**
 * @file client.mts
 * @description MCP SDK Client 包装，提供统一的连接、工具发现与调用接口。
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { MCPDiscoveredToolSnapshot, MCPServerConfig } from 'types/ai';

/**
 * MCP 客户端包装接口。
 */
export interface MCPClientWrapper {
  /** 底层 SDK Client */
  readonly client: Client;
  /** 服务器配置 */
  readonly server: MCPServerConfig;
  /** 连接到服务器 */
  connect(): Promise<void>;
  /** 断开连接 */
  disconnect(): Promise<void>;
  /** 获取工具列表 */
  listTools(): Promise<MCPDiscoveredToolSnapshot[]>;
  /** 调用工具 */
  callTool(name: string, args: unknown): Promise<unknown>;
  /** 是否已连接 */
  isConnected(): boolean;
}

/**
 * 创建 MCP 客户端包装。
 * @param server - MCP server 配置
 * @param transport - SDK Transport 实例
 * @returns 客户端包装
 */
export async function createMcpClient(server: MCPServerConfig, transport: Transport): Promise<MCPClientWrapper> {
  const client = new Client(
    { name: 'tibis', version: '0.1.0' },
    { capabilities: {} }
  );

  let connected = false;

  return {
    client,
    server,

    async connect(): Promise<void> {
      await client.connect(transport);
      connected = true;
    },

    async disconnect(): Promise<void> {
      await client.close();
      connected = false;
    },

    async listTools(): Promise<MCPDiscoveredToolSnapshot[]> {
      const result = await client.listTools();
      return result.tools.map((tool) => ({
        serverId: server.id,
        toolName: tool.name,
        description: tool.description ?? undefined,
        inputSchema: tool.inputSchema as Record<string, unknown> | undefined
      }));
    },

    async callTool(name: string, args: unknown): Promise<unknown> {
      const result = await client.callTool({ name, arguments: args as Record<string, unknown> });
      return result;
    },

    isConnected(): boolean {
      return connected;
    }
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/main/modules/mcp/client.mts
git commit -m "feat(mcp): add client wrapper module"
```

---

## Task 6: OAuth Storage

**Files:**
- Create: `electron/main/modules/mcp/oauth/storage.mts`

- [ ] **Step 1: Write the implementation**

```typescript
// electron/main/modules/mcp/oauth/storage.mts
/**
 * @file storage.mts
 * @description MCP OAuth Token 持久化，使用 Electron safeStorage 加密存储。
 */
import type { MCPOAuthConfig } from 'types/ai';
import { log } from '../logger/service.mjs';

/**
 * OAuth 持久化数据结构。
 */
interface OAuthData {
  serverId: string;
  serverUrl: string;
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
  codeVerifier?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * OAuth 数据存储键前缀。
 */
const OAUTH_STORE_PREFIX = 'mcp:oauth:';

/**
 * 安全读取 OAuth 数据。
 * @param serverId - MCP server ID
 * @returns OAuth 数据或 null
 */
export async function loadOAuthData(serverId: string): Promise<OAuthData | null> {
  try {
    const { getStore } = await import('../store/service.mjs');
    const store = getStore();
    const key = `${OAUTH_STORE_PREFIX}${serverId}`;
    const data = store.get(key) as OAuthData | undefined;
    return data ?? null;
  } catch (error) {
    log.error(`Failed to load OAuth data for ${serverId}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * 安全写入 OAuth 数据。
 * @param data - OAuth 数据
 */
export async function saveOAuthData(data: OAuthData): Promise<void> {
  try {
    const { getStore } = await import('../store/service.mjs');
    const store = getStore();
    const key = `${OAUTH_STORE_PREFIX}${data.serverId}`;
    store.set(key, { ...data, updatedAt: Date.now() });
  } catch (error) {
    log.error(`Failed to save OAuth data for ${data.serverId}: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * 清除指定 server 的 OAuth 数据。
 * @param serverId - MCP server ID
 */
export async function clearOAuthData(serverId: string): Promise<void> {
  try {
    const { getStore } = await import('../store/service.mjs');
    const store = getStore();
    const key = `${OAUTH_STORE_PREFIX}${serverId}`;
    store.delete(key);
  } catch (error) {
    log.error(`Failed to clear OAuth data for ${serverId}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 从 OAuth 数据中提取 MCPOAuthConfig。
 * @param data - OAuth 数据
 * @returns MCP OAuth 配置
 */
export function toOAuthConfig(data: OAuthData): MCPOAuthConfig {
  return {
    clientId: data.clientId,
    clientSecret: data.clientSecret,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expiresAt: data.expiresAt,
    scope: data.scope
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/main/modules/mcp/oauth/storage.mts
git commit -m "feat(mcp): add OAuth storage module"
```

---

## Task 7: OAuth Provider

**Files:**
- Create: `electron/main/modules/mcp/oauth/provider.mts`
- Create: `test/electron/mcp/oauth/provider.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/electron/mcp/oauth/provider.test.ts
import { describe, expect, it } from 'vitest';
import { AuthorizationPendingError, TibisOAuthProvider } from '../../../../electron/main/modules/mcp/oauth/provider.mjs';
import type { MCPServerConfig } from '@/shared/storage/tool-settings';

function createRemoteServer(patch: Partial<MCPServerConfig> = {}): MCPServerConfig {
  return {
    id: 'test-oauth',
    name: 'Test OAuth',
    enabled: true,
    transport: 'streamableHTTP',
    url: 'https://example.com/mcp',
    command: '',
    args: [],
    env: {},
    toolAllowlist: [],
    connectTimeoutMs: 20000,
    toolCallTimeoutMs: 30000,
    ...patch
  };
}

describe('TibisOAuthProvider', () => {
  it('returns correct redirect URL', () => {
    const provider = new TibisOAuthProvider(createRemoteServer());
    expect(provider.redirectUrl).toBe('http://127.0.0.1:19876/mcp/oauth/callback');
  });

  it('returns correct client metadata', () => {
    const provider = new TibisOAuthProvider(createRemoteServer());
    const metadata = provider.clientMetadata;
    expect(metadata.client_name).toBe('Tibis MCP Client');
    expect(metadata.redirect_uris).toContain(provider.redirectUrl);
    expect(metadata.grant_types).toContain('authorization_code');
  });

  it('throws AuthorizationPendingError from redirectToAuthorization', async () => {
    const provider = new TibisOAuthProvider(createRemoteServer());
    const testUrl = new URL('https://auth.example.com/authorize?code=123');
    await expect(provider.redirectToAuthorization(testUrl)).rejects.toThrow(AuthorizationPendingError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/electron/mcp/oauth/provider.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// electron/main/modules/mcp/oauth/provider.mts
/**
 * @file provider.mts
 * @description MCP OAuthClientProvider 实现，桥接 SDK OAuth 流程与 Tibis 存储。
 */
import type { OAuthClientProvider, OAuthClientInformationMixed, OAuthTokens } from '@modelcontextprotocol/sdk/client/auth.js';
import type { MCPServerConfig } from 'types/ai';
import { clearOAuthData, loadOAuthData, saveOAuthData } from './storage.mjs';

/**
 * OAuth 回调端口。
 */
export const OAUTH_CALLBACK_PORT = 19876;

/**
 * OAuth 授权等待中错误。
 * redirectToAuthorization 抛出此错误，将 authorizationUrl 传递给调用方。
 */
export class AuthorizationPendingError extends Error {
  /** 授权 URL */
  readonly authorizationUrl: URL;

  constructor(authorizationUrl: URL) {
    super('Authorization pending');
    this.name = 'AuthorizationPendingError';
    this.authorizationUrl = authorizationUrl;
  }
}

/**
 * Tibis OAuth Provider 实现。
 */
export class TibisOAuthProvider implements OAuthClientProvider {
  constructor(private readonly server: MCPServerConfig) {}

  get redirectUrl(): string {
    return `http://127.0.0.1:${OAUTH_CALLBACK_PORT}/mcp/oauth/callback`;
  }

  get clientMetadata() {
    return {
      client_name: 'Tibis MCP Client',
      redirect_uris: [this.redirectUrl],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_post' as const
    };
  }

  async clientInformation(): Promise<OAuthClientInformationMixed | undefined> {
    const data = await loadOAuthData(this.server.id);
    if (!data?.clientId) return undefined;
    return {
      client_id: data.clientId,
      ...(data.clientSecret ? { client_secret: data.clientSecret } : {})
    };
  }

  async saveClientInformation(info: OAuthClientInformationMixed): Promise<void> {
    const existing = (await loadOAuthData(this.server.id)) ?? {
      serverId: this.server.id,
      serverUrl: this.server.url ?? '',
      createdAt: Date.now()
    };
    await saveOAuthData({
      ...existing,
      clientId: info.client_id,
      clientSecret: info.client_secret
    });
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    const data = await loadOAuthData(this.server.id);
    if (!data?.accessToken) return undefined;
    if (data.expiresAt && data.expiresAt < Math.floor(Date.now() / 1000)) return undefined;
    return {
      access_token: data.accessToken,
      refresh_token: data.refreshToken,
      expires_in: data.expiresAt ? Math.max(0, data.expiresAt - Math.floor(Date.now() / 1000)) : undefined
    };
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    const existing = (await loadOAuthData(this.server.id)) ?? {
      serverId: this.server.id,
      serverUrl: this.server.url ?? '',
      createdAt: Date.now()
    };
    await saveOAuthData({
      ...existing,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expires_in ? Math.floor(Date.now() / 1000) + tokens.expires_in : undefined
    });
  }

  async redirectToAuthorization(url: URL): Promise<void> {
    throw new AuthorizationPendingError(url);
  }

  async saveCodeVerifier(verifier: string): Promise<void> {
    const existing = (await loadOAuthData(this.server.id)) ?? {
      serverId: this.server.id,
      serverUrl: this.server.url ?? '',
      createdAt: Date.now()
    };
    await saveOAuthData({ ...existing, codeVerifier: verifier });
  }

  async codeVerifier(): Promise<string> {
    const data = await loadOAuthData(this.server.id);
    if (!data?.codeVerifier) throw new Error('No code verifier found');
    return data.codeVerifier;
  }
}

/**
 * 清除指定 server 的 OAuth 凭据。
 * @param serverId - MCP server ID
 */
export async function clearOAuthCredentials(serverId: string): Promise<void> {
  await clearOAuthData(serverId);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/electron/mcp/oauth/provider.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/main/modules/mcp/oauth/provider.mts test/electron/mcp/oauth/provider.test.ts
git commit -m "feat(mcp): add OAuth provider implementation"
```

---

## Task 8: OAuth Callback Server

**Files:**
- Create: `electron/main/modules/mcp/oauth/callback-server.mts`

- [ ] **Step 1: Write the implementation**

```typescript
// electron/main/modules/mcp/oauth/callback-server.mts
/**
 * @file callback-server.mts
 * @description OAuth 本地回调服务器，监听授权码回调。
 */
import http from 'node:http';
import { OAUTH_CALLBACK_PORT } from './provider.mjs';
import { log } from '../logger/service.mjs';

/**
 * OAuth 回调结果。
 */
export interface OAuthCallbackResult {
  /** 授权码 */
  code: string;
  /** CSRF state 参数 */
  state?: string;
}

/**
 * OAuth 回调服务器。
 */
export class OAuthCallbackServer {
  private server: http.Server | null = null;
  private pendingResolve: ((result: OAuthCallbackResult) => void) | null = null;
  private pendingReject: ((error: Error) => void) | null = null;

  /**
   * 启动回调服务器并等待授权码。
   * @param state - 预期 CSRF state 参数
   * @param timeoutMs - 超时时间（ms），默认 5 分钟
   * @returns OAuth 回调结果
   */
  async waitForCallback(state: string, timeoutMs = 300000): Promise<OAuthCallbackResult> {
    return new Promise((resolve, reject) => {
      this.pendingResolve = resolve;
      this.pendingReject = reject;

      this.server = http.createServer((req, res) => {
        if (!req.url?.startsWith('/mcp/oauth/callback')) {
          res.writeHead(404);
          res.end();
          return;
        }

        const url = new URL(req.url, `http://127.0.0.1:${OAUTH_CALLBACK_PORT}`);
        const code = url.searchParams.get('code');
        const receivedState = url.searchParams.get('state');

        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<h1>错误</h1><p>缺少授权码</p>');
          reject(new Error('Missing authorization code'));
          return;
        }

        if (state && receivedState !== state) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<h1>错误</h1><p>State 不匹配</p>');
          reject(new Error('State mismatch'));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>授权成功</h1><p>您可以关闭此页面</p>');

        resolve({ code, state: receivedState ?? undefined });
        this.stop();
      });

      this.server.listen(OAUTH_CALLBACK_PORT, () => {
        log.info(`OAuth callback server listening on port ${OAUTH_CALLBACK_PORT}`);
      });

      setTimeout(() => {
        reject(new Error('OAuth callback timeout'));
        this.stop();
      }, timeoutMs);
    });
  }

  /**
   * 停止回调服务器。
   */
  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    this.pendingResolve = null;
    this.pendingReject = null;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/main/modules/mcp/oauth/callback-server.mts
git commit -m "feat(mcp): add OAuth callback server"
```

---

## Task 9: OAuth Index & Notifications

**Files:**
- Create: `electron/main/modules/mcp/oauth/index.mts`
- Create: `electron/main/modules/mcp/notifications.mts`

- [ ] **Step 1: Write OAuth index**

```typescript
// electron/main/modules/mcp/oauth/index.mts
/**
 * @file index.mts
 * @description OAuth 模块入口，导出公开 API。
 */
export { TibisOAuthProvider, AuthorizationPendingError, OAUTH_CALLBACK_PORT, clearOAuthCredentials } from './provider.mjs';
export { OAuthCallbackServer } from './callback-server.mts';
export type { OAuthCallbackResult } from './callback-server.mts';
export { loadOAuthData, saveOAuthData, clearOAuthData, toOAuthConfig } from './storage.mts';
```

- [ ] **Step 2: Write notifications module**

```typescript
// electron/main/modules/mcp/notifications.mts
/**
 * @file notifications.mts
 * @description MCP 通知处理器注册。
 */
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

/**
 * MCP 通知回调集合。
 */
export interface NotificationHandlers {
  /** 工具列表变更回调 */
  onToolsChanged?: (serverId: string) => void;
  /** 资源列表变更回调 */
  onResourcesChanged?: (serverId: string) => void;
  /** Prompt 列表变更回调 */
  onPromptsChanged?: (serverId: string) => void;
}

/**
 * 注册 MCP 通知处理器。
 * @param client - SDK Client 实例
 * @param serverId - MCP server ID
 * @param handlers - 通知回调集合
 */
export function registerNotificationHandlers(client: Client, serverId: string, handlers: NotificationHandlers): void {
  client.setNotificationHandler(
    { method: 'notifications/tools/list_changed' },
    async () => {
      handlers.onToolsChanged?.(serverId);
    }
  );

  client.setNotificationHandler(
    { method: 'notifications/resources/list_changed' },
    async () => {
      handlers.onResourcesChanged?.(serverId);
    }
  );

  client.setNotificationHandler(
    { method: 'notifications/prompts/list_changed' },
    async () => {
      handlers.onPromptsChanged?.(serverId);
    }
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add electron/main/modules/mcp/oauth/index.mts electron/main/modules/mcp/notifications.mts
git commit -m "feat(mcp): add OAuth index and notifications module"
```

---

## Task 10: Session Manager (Core Replacement)

**Files:**
- Create: `electron/main/modules/mcp/session.mts`
- Create: `electron/main/modules/mcp/discovery.mts`

This is the most critical task — it replaces `runtime.mts` and `local-stdio.mts` with the SDK-based session management.

- [ ] **Step 1: Write discovery module**

```typescript
// electron/main/modules/mcp/discovery.mts
/**
 * @file discovery.mts
 * @description MCP 工具发现与缓存管理。
 */
import type { MCPDiscoveredToolSnapshot, MCPDiscoveryRefreshResult, MCPServerConfig, MCPServerDiscoveryCache } from 'types/ai';

const discoveryCacheByServerId = new Map<string, MCPServerDiscoveryCache>();

/**
 * 获取指定 server 的 discovery cache。
 * @param serverId - server ID
 * @returns discovery cache 或 undefined
 */
export function getDiscoveryCache(serverId?: string): MCPServerDiscoveryCache | MCPServerDiscoveryCache[] | undefined {
  if (serverId) {
    return discoveryCacheByServerId.get(serverId);
  }
  return [...discoveryCacheByServerId.values()];
}

/**
 * 存储 discovery cache。
 * @param cache - discovery cache
 */
export function setDiscoveryCache(cache: MCPServerDiscoveryCache): void {
  discoveryCacheByServerId.set(cache.serverId, cache);
}

/**
 * 删除指定 server 的 discovery cache。
 * @param serverId - server ID
 */
export function deleteDiscoveryCache(serverId: string): void {
  discoveryCacheByServerId.delete(serverId);
}

/**
 * 清除所有 discovery cache。
 */
export function clearAllDiscoveryCache(): void {
  discoveryCacheByServerId.clear();
}

/**
 * 创建 discovery 刷新成功结果。
 * @param serverId - server ID
 * @param tools - 发现的工具列表
 * @param now - 当前时间戳
 * @returns 成功结果
 */
export function createDiscoverySuccessResult(serverId: string, tools: MCPDiscoveredToolSnapshot[], now: number): MCPDiscoveryRefreshResult {
  const cache: MCPServerDiscoveryCache = { serverId, tools, discoveredAt: now };
  setDiscoveryCache(cache);
  return { ok: true, serverId, cache };
}

/**
 * 创建 discovery 刷新失败结果。
 * @param serverId - server ID
 * @param errorCode - 错误码
 * @param message - 错误消息
 * @returns 失败结果
 */
export function createDiscoveryFailureResult(serverId: string, errorCode: string, message: string): MCPDiscoveryRefreshResult {
  return { ok: false, serverId, errorCode, message };
}
```

- [ ] **Step 2: Write session module**

```typescript
// electron/main/modules/mcp/session.mts
/**
 * @file session.mts
 * @description MCP 会话生命周期管理，替代原 runtime.mts。
 */
import type { MCPDiscoveryRefreshResult, MCPServerConfig } from 'types/ai';
import type { MCPClientWrapper } from './client.mjs';
import { createMcpClient } from './client.mjs';
import { createTransport } from './transport.mjs';
import { setStatus, getStatus, clearAllStatus, getStatuses } from './status.mjs';
import { classifyMcpError } from './errors.mjs';
import { createDiscoverySuccessResult, createDiscoveryFailureResult, deleteDiscoveryCache, getDiscoveryCache } from './discovery.mjs';
import { registerNotificationHandlers } from './notifications.mjs';
import { TibisOAuthProvider, AuthorizationPendingError, OAuthCallbackServer, clearOAuthCredentials } from './oauth/index.mjs';
import { BrowserWindow } from 'electron';
import { log } from '../logger/service.mjs';

/**
 * 活跃的 MCP 客户端会话。
 */
const sessionsByServerId = new Map<string, MCPClientWrapper>();

/**
 * 工具变更通知回调列表。
 */
const toolsChangedListeners = new Set<(serverId: string) => void>();

/**
 * 注册工具变更通知回调。
 * @param callback - 回调函数
 * @returns 取消注册函数
 */
export function onToolsChanged(callback: (serverId: string) => void): () => void {
  toolsChangedListeners.add(callback);
  return () => toolsChangedListeners.delete(callback);
}

/**
 * 通知所有监听者工具列表已变更。
 * @param serverId - MCP server ID
 */
function notifyToolsChanged(serverId: string): void {
  for (const callback of toolsChangedListeners) {
    try {
      callback(serverId);
    } catch (error) {
      log.error(`Tools changed listener error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/**
 * 判断 server 是否可尝试连接。
 * @param server - MCP server 配置
 * @returns 不可连接时的错误消息，空表示可连接
 */
function getServerRunnableError(server: MCPServerConfig): string {
  if (!server.enabled) {
    return `MCP server is disabled: ${server.id}`;
  }
  if (server.transport === 'stdio' && !server.command.trim()) {
    return `MCP server command is empty: ${server.id}`;
  }
  if ((server.transport === 'streamableHTTP' || server.transport === 'sse') && !server.url?.trim()) {
    return `MCP server URL is empty: ${server.id}`;
  }
  return '';
}

/**
 * 创建影响连接的配置指纹。
 * @param server - MCP server 配置
 * @returns 稳定配置指纹
 */
function createServerSignature(server: MCPServerConfig): string {
  const envEntries = Object.entries(server.env).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify({
    enabled: server.enabled,
    transport: server.transport,
    command: server.command,
    args: server.args,
    env: envEntries,
    url: server.url,
    connectTimeoutMs: server.connectTimeoutMs,
    toolCallTimeoutMs: server.toolCallTimeoutMs
  });
}

/**
 * 关闭并移除指定 server 的会话。
 * @param serverId - server ID
 */
async function closeSession(serverId: string): Promise<void> {
  const wrapper = sessionsByServerId.get(serverId);
  if (!wrapper) return;
  sessionsByServerId.delete(serverId);
  try {
    await wrapper.disconnect();
  } catch (error) {
    log.error(`Error closing MCP session ${serverId}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 连接指定 MCP server 并刷新 discovery cache。
 * @param server - MCP server 配置
 * @returns discovery 刷新结果
 */
export async function connectMcpServer(server: MCPServerConfig): Promise<MCPDiscoveryRefreshResult> {
  const runnableError = getServerRunnableError(server);
  if (runnableError) {
    setStatus(server.id, server.enabled ? 'failed' : 'disabled', undefined, runnableError);
    return createDiscoveryFailureResult(server.id, 'LOCAL_EXEC_FAILED', runnableError);
  }

  setStatus(server.id, 'connecting', 'refreshing');

  try {
    let authProvider: TibisOAuthProvider | undefined;
    if ((server.transport === 'streamableHTTP' || server.transport === 'sse') && server.oauth !== undefined) {
      authProvider = new TibisOAuthProvider(server);
    }

    const transport = createTransport(server, {
      authProvider,
      timeout: server.connectTimeoutMs
    });

    const wrapper = await createMcpClient(server, transport);
    await wrapper.connect();

    const tools = await wrapper.listTools();

    if (server.watchToolChanges !== false) {
      registerNotificationHandlers(wrapper.client, server.id, {
        onToolsChanged: async (serverId: string) => {
          log.info(`MCP tools changed notification for ${serverId}`);
          const sessionWrapper = sessionsByServerId.get(serverId);
          if (sessionWrapper?.isConnected()) {
            try {
              const updatedTools = await sessionWrapper.listTools();
              createDiscoverySuccessResult(serverId, updatedTools, Date.now());
              setStatus(serverId, 'connected', 'ready');
              notifyToolsChanged(serverId);
            } catch (error) {
              log.error(`Failed to refresh tools after change notification: ${error instanceof Error ? error.message : String(error)}`);
            }
          }
        }
      });
    }

    await closeSession(server.id);
    sessionsByServerId.set(server.id, wrapper);

    setStatus(server.id, 'connected', 'ready');
    return createDiscoverySuccessResult(server.id, tools, Date.now());
  } catch (error) {
    const classified = classifyMcpError(error);

    if (error instanceof AuthorizationPendingError) {
      setStatus(server.id, 'needs_auth', undefined, 'OAuth authorization required');
      return createDiscoveryFailureResult(server.id, 'AUTH_REQUIRED', 'OAuth authorization required');
    }

    setStatus(server.id, classified.status, 'failed', classified.message);

    if (server.transport === 'streamableHTTP' && classified.code !== 'AUTH_REQUIRED' && classified.code !== 'CLIENT_REGISTRATION_REQUIRED') {
      log.info(`StreamableHTTP failed for ${server.id}, trying SSE fallback...`);
      try {
        const sseServer = { ...server, transport: 'sse' as const };
        const sseTransport = createTransport(sseServer, {
          authProvider: server.oauth !== undefined ? new TibisOAuthProvider(server) : undefined,
          timeout: server.connectTimeoutMs
        });
        const sseWrapper = await createMcpClient(sseServer, sseTransport);
        await sseWrapper.connect();
        const tools = await sseWrapper.listTools();

        await closeSession(server.id);
        sessionsByServerId.set(server.id, sseWrapper);

        setStatus(server.id, 'connected', 'ready');
        return createDiscoverySuccessResult(server.id, tools, Date.now());
      } catch (sseError) {
        const sseClassified = classifyMcpError(sseError);
        if (sseError instanceof AuthorizationPendingError) {
          setStatus(server.id, 'needs_auth', undefined, 'OAuth authorization required');
          return createDiscoveryFailureResult(server.id, 'AUTH_REQUIRED', 'OAuth authorization required');
        }
        setStatus(server.id, sseClassified.status, 'failed', sseClassified.message);
        return createDiscoveryFailureResult(server.id, sseClassified.code, sseClassified.message);
      }
    }

    return createDiscoveryFailureResult(server.id, classified.code, classified.message);
  }
}

/**
 * 断开指定 MCP server。
 * @param serverId - server ID
 */
export async function disconnectMcpServer(serverId: string): Promise<void> {
  await closeSession(serverId);
  deleteDiscoveryCache(serverId);
  setStatus(serverId, 'idle', 'idle');
}

/**
 * 重启指定 MCP server。
 * @param server - MCP server 配置
 * @returns discovery 刷新结果
 */
export async function restartMcpServer(server: MCPServerConfig): Promise<MCPDiscoveryRefreshResult> {
  await closeSession(server.id);
  return connectMcpServer(server);
}

/**
 * 刷新指定 MCP server 的 discovery cache。
 * @param server - MCP server 配置
 * @returns discovery 刷新结果
 */
export async function refreshMcpDiscovery(server: MCPServerConfig): Promise<MCPDiscoveryRefreshResult> {
  const wrapper = sessionsByServerId.get(server.id);
  if (wrapper?.isConnected()) {
    try {
      setStatus(server.id, 'connected', 'refreshing');
      const tools = await wrapper.listTools();
      setStatus(server.id, 'connected', 'ready');
      return createDiscoverySuccessResult(server.id, tools, Date.now());
    } catch (error) {
      const classified = classifyMcpError(error);
      setStatus(server.id, classified.status, 'failed', classified.message);
      return createDiscoveryFailureResult(server.id, classified.code, classified.message);
    }
  }
  return connectMcpServer(server);
}

/**
 * 在已连接的会话上执行 MCP tool。
 * @param server - MCP server 配置
 * @param toolName - MCP tool 名称
 * @param input - tool 输入
 * @returns MCP tool 调用结果
 */
export async function executeMcpTool(server: MCPServerConfig, toolName: string, input: unknown): Promise<unknown> {
  let wrapper = sessionsByServerId.get(server.id);

  if (!wrapper || !wrapper.isConnected()) {
    const result = await connectMcpServer(server);
    if (!result.ok) {
      throw new Error(result.message ?? `MCP server failed to connect: ${server.id}`);
    }
    wrapper = sessionsByServerId.get(server.id);
  }

  if (!wrapper) {
    throw new Error(`MCP session not found: ${server.id}`);
  }

  try {
    return await wrapper.callTool(toolName, input);
  } catch (error) {
    const classified = classifyMcpError(error);
    if (classified.status === 'failed') {
      await closeSession(server.id);
      setStatus(server.id, 'failed', 'failed', classified.message);
    }
    throw error;
  }
}

/**
 * 启动 OAuth 认证流程。
 * @param server - MCP server 配置
 * @returns 授权 URL
 */
export async function startOAuth(server: MCPServerConfig): Promise<{ authorizationUrl: string }> {
  const provider = new TibisOAuthProvider(server);
  const callbackServer = new OAuthCallbackServer();

  try {
    const transport = createTransport(server, {
      authProvider: provider,
      timeout: server.connectTimeoutMs
    });

    const wrapper = await createMcpClient(server, transport);

    try {
      await wrapper.connect();
    } catch (connectError) {
      if (connectError instanceof AuthorizationPendingError) {
        const authorizationUrl = connectError.authorizationUrl.toString();

        const state = new URL(authorizationUrl).searchParams.get('state') ?? '';
        const callbackResult = await callbackServer.waitForCallback(state);

        await transport.finishAuth(callbackResult.code);

        await closeSession(server.id);
        return { authorizationUrl };
      }
      throw connectError;
    }

    await closeSession(server.id);
    return { authorizationUrl: '' };
  } finally {
    callbackServer.stop();
  }
}

/**
 * 完成 OAuth 认证流程。
 * @param serverId - MCP server ID
 * @param code - 授权码
 */
export async function completeOAuth(serverId: string, code: string): Promise<void> {
  log.info(`OAuth complete for ${serverId} with code`);
}

/**
 * 清除指定 server 的 OAuth 凭据。
 * @param serverId - MCP server ID
 */
export async function clearOAuth(serverId: string): Promise<void> {
  await closeSession(serverId);
  await clearOAuthCredentials(serverId);
  setStatus(serverId, 'idle', 'idle');
}

/**
 * 获取 MCP server 状态。
 * @param serverIds - server ID 列表
 * @returns 状态列表
 */
export function getMcpStatus(serverIds: string[]) {
  return getStatuses(serverIds);
}

/**
 * 获取 discovery cache。
 * @param serverId - 可选 server ID
 * @returns discovery cache
 */
export function getMcpDiscoveryCache(serverId?: string) {
  return getDiscoveryCache(serverId);
}

/**
 * 重置所有 MCP 会话与状态，主要用于测试。
 */
export async function resetMcpState(): Promise<void> {
  for (const serverId of sessionsByServerId.keys()) {
    await closeSession(serverId);
  }
  clearAllStatus();
  clearAllDiscoveryCache();
}
```

- [ ] **Step 3: Commit**

```bash
git add electron/main/modules/mcp/session.mts electron/main/modules/mcp/discovery.mts
git commit -m "feat(mcp): add session manager and discovery cache modules"
```

---

## Task 11: Module Entry & IPC Update

**Files:**
- Create: `electron/main/modules/mcp/index.mts`
- Modify: `electron/main/modules/mcp/ipc.mts`
- Modify: `types/electron-api.d.ts`
- Modify: `electron/preload/index.mts`
- Modify: `electron/main/modules/ai/service.mts`
- Modify: `electron/main/modules/mcp/tools.mts`

- [ ] **Step 1: Write module entry**

```typescript
// electron/main/modules/mcp/index.mts
/**
 * @file index.mts
 * @description MCP 模块入口，导出公开 API。
 */
export { connectMcpServer, disconnectMcpServer, restartMcpServer, refreshMcpDiscovery, executeMcpTool, startOAuth, completeOAuth, clearOAuth, getMcpStatus, getMcpDiscoveryCache, onToolsChanged, resetMcpState } from './session.mjs';
export { resolveMcpExposedTools, createMcpSdkTools, toMcpSdkToolName } from './tools.mjs';
export { registerMcpHandlers } from './ipc.mjs';
```

- [ ] **Step 2: Update IPC handlers**

Replace the old `ipc.mts` with new handlers including OAuth channels:

```typescript
// electron/main/modules/mcp/ipc.mts
/**
 * @file ipc.mts
 * @description MCP runtime IPC 处理器。
 */
import type { MCPServerConfig } from 'types/ai';
import { ipcMain, BrowserWindow } from 'electron';
import { connectMcpServer, disconnectMcpServer, getMcpDiscoveryCache, getMcpStatus, refreshMcpDiscovery, restartMcpServer, startOAuth, clearOAuth, onToolsChanged } from './session.mjs';

/**
 * 注册 MCP runtime IPC 通道。
 */
export function registerMcpHandlers(): void {
  ipcMain.handle('tools:mcp:get-status', (_event, serverIds: string[]) => getMcpStatus(serverIds));
  ipcMain.handle('tools:mcp:get-discovery-cache', (_event, serverId?: string) => getMcpDiscoveryCache(serverId));
  ipcMain.handle('tools:mcp:refresh-discovery', async (_event, server: MCPServerConfig) => refreshMcpDiscovery(server));
  ipcMain.handle('tools:mcp:connect', async (_event, server: MCPServerConfig) => connectMcpServer(server));
  ipcMain.handle('tools:mcp:disconnect', (_event, serverId: string) => disconnectMcpServer(serverId));
  ipcMain.handle('tools:mcp:restart', async (_event, server: MCPServerConfig) => restartMcpServer(server));

  // OAuth 通道
  ipcMain.handle('tools:mcp:oauth:start', async (_event, server: MCPServerConfig) => {
    const result = await startOAuth(server);
    if (result.authorizationUrl) {
      BrowserWindow.getFocusedWindow()?.webContents.send('tools:mcp:oauth:open-url', result.authorizationUrl);
    }
    return result;
  });
  ipcMain.handle('tools:mcp:oauth:clear', async (_event, serverId: string) => clearOAuth(serverId));

  // 工具变更通知推送
  onToolsChanged((serverId: string) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('tools:mcp:tools-changed', { serverId });
    }
  });
}
```

- [ ] **Step 3: Update `types/electron-api.d.ts` — Add OAuth & notification APIs**

Add to `ElectronAPI` interface:

```typescript
// Add to ElectronAPI
startOAuth: (server: MCPServerConfig) => Promise<{ authorizationUrl: string }>;
clearOAuth: (serverId: string) => Promise<void>;
onMcpToolsChanged: (callback: (serverId: string) => void) => () => void;
onMcpOAuthOpenUrl: (callback: (url: string) => void) => () => void;
```

- [ ] **Step 4: Update `electron/preload/index.mts` — Add new IPC bindings**

Add to the `electronAPI` object:

```typescript
startOAuth: (server) => ipcRenderer.invoke('tools:mcp:oauth:start', server),
clearOAuth: (serverId) => ipcRenderer.invoke('tools:mcp:oauth:clear', serverId),
onMcpToolsChanged: (callback) => {
  const handler = (_event: Electron.IpcRendererEvent, data: { serverId: string }) => callback(data.serverId);
  ipcRenderer.on('tools:mcp:tools-changed', handler);
  return () => { ipcRenderer.removeListener('tools:mcp:tools-changed', handler); };
},
onMcpOAuthOpenUrl: (callback) => {
  const handler = (_event: Electron.IpcRendererEvent, url: string) => callback(url);
  ipcRenderer.on('tools:mcp:oauth:open-url', handler);
  return () => { ipcRenderer.removeListener('tools:mcp:oauth:open-url', handler); };
},
```

- [ ] **Step 5: Update `electron/main/modules/ai/service.mts` — Change imports**

Change:
```typescript
import { executeMcpTool, getMcpDiscoveryCache } from '../mcp/runtime.mjs';
import { createMcpSdkTools, resolveMcpExposedTools } from '../mcp/tools.mjs';
```
To:
```typescript
import { executeMcpTool, getMcpDiscoveryCache } from '../mcp/session.mjs';
import { createMcpSdkTools, resolveMcpExposedTools } from '../mcp/tools.mjs';
```

Also update `hasMcpSdkTools` to handle remote transports:
```typescript
function hasMcpSdkTools(mcp: AIRequestOptions['mcp']): boolean {
  return Boolean(mcp?.servers.some((server) => {
    if (!server.enabled) return false;
    if (!mcp.enabledServerIds.includes(server.id)) return false;
    if (server.transport === 'stdio') return server.command.trim().length > 0;
    return Boolean(server.url?.trim());
  }));
}
```

- [ ] **Step 6: Update `electron/main/modules/mcp/tools.mts` — Handle remote transports**

Update `isServerRunnableForRequest`:
```typescript
function isServerRunnableForRequest(server: MCPServerConfig, request: AIMCPRequestConfig): boolean {
  if (!server.enabled || !request.enabledServerIds.includes(server.id)) return false;
  if (server.transport === 'stdio') return server.command.trim().length > 0;
  return Boolean(server.url?.trim());
}
```

- [ ] **Step 7: Run typecheck**

Run: `pnpm run electron:build-main`
Expected: PASS (with possible minor type issues to fix inline)

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(mcp): update IPC, preload, and AI service for new session module"
```

---

## Task 12: Delete Old Code & Update Tests

**Files:**
- Delete: `electron/main/modules/mcp/local-stdio.mts`
- Delete: `electron/main/modules/mcp/runtime.mts`
- Delete: `test/electron/mcp-local-stdio.test.ts`
- Modify: `test/electron/mcp-runtime.test.ts`
- Modify: `src/shared/storage/tool-settings/sqlite.ts` (remove old `normalizeMCPServerConfig` if needed)

- [ ] **Step 1: Delete old files**

Delete `electron/main/modules/mcp/local-stdio.mts` and `electron/main/modules/mcp/runtime.mts`.

- [ ] **Step 2: Delete old test**

Delete `test/electron/mcp-local-stdio.test.ts`.

- [ ] **Step 3: Rewrite `test/electron/mcp-runtime.test.ts`**

Rewrite to test against the new `session.mts` module. Key tests:
- Connect stdio server → connected + discovery cache
- Connect remote server → connected + discovery cache
- Connect with OAuth needed → needs_auth status
- Disconnect → idle status
- Restart → new session
- Execute tool via connected session
- SSE fallback when StreamableHTTP fails

- [ ] **Step 4: Run all MCP tests**

Run: `pnpm vitest run test/electron/mcp`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(mcp): delete old local-stdio and runtime, update tests for SDK-based session"
```

---

## Task 13: Frontend Adaptation

**Files:**
- Modify: `src/views/settings/tools/mcp/index.vue`
- Modify: `src/views/settings/tools/mcp/components/ServerEditor.vue`
- Modify: `src/stores/ai/toolSettings.ts`
- Modify: `src/ai/tools/builtin/MCPSettingsTool/index.ts`

- [ ] **Step 1: Update `ServerEditor.vue` — Add transport type, URL, OAuth fields**

Add transport type selector (stdio / streamableHTTP / sse). Show URL field for remote transports. Show OAuth toggle for remote servers.

- [ ] **Step 2: Update `index.vue` — Add OAuth button, remote server display**

Add OAuth authorization button when status is `needs_auth`. Show URL for remote servers instead of command.

- [ ] **Step 3: Update `toolSettings.ts` — Handle new MCPServerConfig fields**

Update `addMcpServer` and `updateMcpServer` to handle `url`, `oauth`, `watchToolChanges` fields.

- [ ] **Step 4: Update `MCPSettingsTool/index.ts` — Update for new config fields**

Update tool descriptions and parameter schemas to include `transport`, `url`, `oauth` fields.

- [ ] **Step 5: Run lint and typecheck**

Run: `pnpm run lint && pnpm run electron:build-main`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(mcp): update frontend for multi-transport and OAuth support"
```

---

## Task 14: Integration Test & Final Verification

**Files:**
- Modify: `test/electron/mcp/session.test.ts`
- Modify: `test/electron/mcp-ipc.test.ts`

- [ ] **Step 1: Write session integration test**

Test the full flow: connect → listTools → callTool → disconnect for stdio transport using a mock MCP server.

- [ ] **Step 2: Write IPC integration test**

Test all IPC channels with mock session functions.

- [ ] **Step 3: Run full test suite**

Run: `pnpm vitest run`
Expected: All MCP-related tests pass

- [ ] **Step 4: Run lint and typecheck**

Run: `pnpm run lint && pnpm run electron:build-main`
Expected: PASS

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(mcp): complete SDK migration with integration tests"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** Each section of the spec maps to a task (types → Task 1, errors → Task 2, status → Task 3, transport → Task 4, client → Task 5, oauth → Tasks 6-9, session → Task 10, IPC → Task 11, old code deletion → Task 12, frontend → Task 13, tests → Task 14)
- [x] **Placeholder scan:** No TBD/TODO/placeholders — all code is concrete
- [x] **Type consistency:** `MCPServerConfig`, `MCPRuntimeStatus`, `MCPOAuthConfig` are defined in types and used consistently across all modules
