# MCP SDK 迁移技术方案

## 1. 背景与目标

### 1.1 背景

当前 Tibis 的 MCP 实现是自研的 JSON-RPC 客户端，存在以下问题：

1. **维护成本高** - 自己实现 JSON-RPC 协议、SSE 解析、进程管理
2. **功能缺失** - 没有 OAuth 2.0 支持、没有工具变更通知
3. **协议兼容性** - 需要手动跟进 MCP 协议更新

### 1.2 目标

使用官方 `@modelcontextprotocol/sdk` 完全替换自研实现，补齐以下能力：

| 能力 | 说明 |
|------|------|
| OAuth 2.0 认证 | 完整支持远程服务器认证流程 |
| 工具变更通知 | 监听 `notifications/tools/list_changed`，自动刷新 |
| SSE 传输 | 作为 HTTP 传输的备选方案 |
| 动态客户端注册 | 支持 RFC 7591 动态注册 |
| 状态管理 | 新增 `needs_auth`、`needs_client_registration` 状态 |

### 1.3 设计原则

**不考虑历史包袱，全新设计**

- 可以破坏性修改配置格式
- 可以删除旧代码
- 可以修改接口签名

---

## 2. 架构设计

### 2.1 模块结构

```
electron/main/modules/mcp/
├── index.mts                    # 模块入口，导出公开 API
├── client.mts                   # Client 创建与管理
├── transport.mts                # Transport 工厂
├── session.mts                  # 会话生命周期管理
├── discovery.mts                # 工具发现与缓存
├── oauth/
│   ├── index.mts                # OAuth 入口
│   ├── provider.mts             # OAuthClientProvider 实现
│   ├── callback-server.mts      # 本地回调服务器
│   └── storage.mts              # Token 持久化
├── notifications.mts            # MCP 通知处理
├── status.mts                   # 状态管理
├── errors.mts                   # 错误分类
└── ipc.mts                      # IPC 处理器
```

### 2.2 依赖关系

```
┌─────────────────────────────────────────────────────────────┐
│                       IPC Layer                              │
│                      (ipc.mts)                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Session Manager                           │
│                    (session.mts)                             │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐       │
│  │   Client    │  │  Discovery   │  │    Status     │       │
│  │ Management  │  │   Cache      │  │   Machine     │       │
│  └─────────────┘  └──────────────┘  └───────────────┘       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Transport Factory                         │
│                    (transport.mts)                           │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐       │
│  │   Stdio     │  │  HTTP/SSE    │  │  OAuth        │       │
│  │ Transport   │  │  Transport   │  │  Provider     │       │
│  └─────────────┘  └──────────────┘  └───────────────┘       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                 @modelcontextprotocol/sdk                    │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐       │
│  │   Client    │  │  Transport   │  │  OAuth        │       │
│  │   Class     │  │  Classes     │  │  Types        │       │
│  └─────────────┘  └──────────────┘  └───────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. 核心模块设计

### 3.1 Transport 工厂 (transport.mts)

```typescript
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/http.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { MCPServerConfig } from 'types/ai';
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';

export interface TransportOptions {
  /** OAuth Provider (仅 HTTP/SSE 需要) */
  authProvider?: OAuthClientProvider;
  /** 连接超时 */
  timeout?: number;
}

/**
 * 创建 MCP Transport 实例
 */
export function createTransport(server: MCPServerConfig, options?: TransportOptions) {
  switch (server.transport) {
    case 'stdio':
      return new StdioClientTransport({
        command: server.command,
        args: server.args,
        env: server.env
      });

    case 'streamableHTTP':
      if (!server.url) {
        throw new Error('URL is required for streamableHTTP transport');
      }
      return new StreamableHTTPClientTransport(new URL(server.url), {
        authProvider: options?.authProvider,
        requestInit: {
          signal: AbortSignal.timeout(options?.timeout ?? 30000)
        }
      });

    case 'sse':
      if (!server.url) {
        throw new Error('URL is required for SSE transport');
      }
      return new SSEClientTransport(new URL(server.url), {
        authProvider: options?.authProvider
      });
  }
}
```

### 3.2 Client 管理 (client.mts)

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { MCPServerConfig, MCPDiscoveredToolSnapshot } from 'types/ai';

/**
 * MCP 客户端包装，提供统一接口
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
 * 创建 MCP 客户端
 */
export async function createMcpClient(
  server: MCPServerConfig,
  transport: Transport
): Promise<MCPClientWrapper> {
  const client = new Client(
    { name: 'tibis', version: '0.1.0' },
    { capabilities: {} }
  );

  // ... 实现
}
```

### 3.3 OAuth Provider (oauth/provider.mts)

```typescript
import type { OAuthClientProvider, OAuthTokens, OAuthClientInformationMixed } from '@modelcontextprotocol/sdk/client/auth.js';
import type { MCPServerConfig, MCPOAuthConfig } from 'types/ai';
import { OAuthStorage } from './storage.js';

/**
 * Tibis OAuth Provider 实现
 */
export class TibisOAuthProvider implements OAuthClientProvider {
  constructor(
    private server: MCPServerConfig,
    private storage: OAuthStorage
  ) {}

  get redirectUrl(): string {
    return `http://127.0.0.1:${OAUTH_CALLBACK_PORT}/mcp/oauth/callback`;
  }

  get clientMetadata() {
    return {
      client_name: 'Tibis MCP Client',
      redirect_uris: [this.redirectUrl],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_post'
    };
  }

  async clientInformation(): Promise<OAuthClientInformationMixed | undefined> {
    const oauth = await this.storage.loadOAuth(this.server.id);
    if (!oauth?.clientId) return undefined;
    return {
      client_id: oauth.clientId,
      client_secret: oauth.clientSecret
    };
  }

  async saveClientInformation(info: OAuthClientInformationMixed): Promise<void> {
    await this.storage.saveOAuth(this.server.id, {
      clientId: info.client_id,
      clientSecret: info.client_secret
    });
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    const oauth = await this.storage.loadOAuth(this.server.id);
    if (!oauth?.accessToken) return undefined;
    return {
      access_token: oauth.accessToken,
      refresh_token: oauth.refreshToken,
      expires_in: oauth.expiresAt ? Math.max(0, oauth.expiresAt - Math.floor(Date.now() / 1000)) : undefined
    };
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    const existing = await this.storage.loadOAuth(this.server.id) ?? {};
    await this.storage.saveOAuth(this.server.id, {
      ...existing,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expires_in ? Math.floor(Date.now() / 1000) + tokens.expires_in : undefined
    });
  }

  async redirectToAuthorization(url: URL): Promise<void> {
    // 由调用方处理，这里只返回 URL
    throw new AuthorizationPendingError(url);
  }

  async saveCodeVerifier(verifier: string): Promise<void> {
    const existing = await this.storage.loadOAuth(this.server.id) ?? {};
    await this.storage.saveOAuth(this.server.id, { ...existing, codeVerifier: verifier });
  }

  async codeVerifier(): Promise<string> {
    const oauth = await this.storage.loadOAuth(this.server.id);
    if (!oauth?.codeVerifier) throw new Error('No code verifier found');
    return oauth.codeVerifier;
  }
}

/**
 * OAuth 授权等待中错误
 */
export class AuthorizationPendingError extends Error {
  constructor(public readonly authorizationUrl: URL) {
    super('Authorization pending');
    this.name = 'AuthorizationPendingError';
  }
}
```

### 3.4 OAuth 回调服务器 (oauth/callback-server.mts)

```typescript
import http from 'http';

const OAUTH_CALLBACK_PORT = 19876;

export interface OAuthCallbackResult {
  code: string;
  state?: string;
}

/**
 * OAuth 回调服务器
 */
export class OAuthCallbackServer {
  private server: http.Server | null = null;
  private pendingResolve: ((result: OAuthCallbackResult) => void) | null = null;
  private pendingReject: ((error: Error) => void) | null = null;

  /**
   * 启动回调服务器并等待授权码
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
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<h1>错误</h1><p>缺少授权码</p>');
          reject(new Error('Missing authorization code'));
          return;
        }

        // CSRF 防护
        if (state && receivedState !== state) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<h1>错误</h1><p>State 不匹配</p>');
          reject(new Error('State mismatch'));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>授权成功</h1><p>您可以关闭此页面</p>');

        resolve({ code, state: receivedState ?? undefined });
        this.stop();
      });

      this.server.listen(OAUTH_CALLBACK_PORT);

      // 超时
      setTimeout(() => {
        reject(new Error('OAuth callback timeout'));
        this.stop();
      }, timeoutMs);
    });
  }

  /**
   * 停止服务器
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

### 3.5 状态管理 (status.mts)

```typescript
import type { MCPRuntimeStatus, MCPDiscoveryStatus, MCPStatusResponse } from 'types/ai';

/**
 * MCP 服务器运行状态
 */
export type MCPServerStatus = 
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'failed'
  | 'disabled'
  | 'needs_auth'              // 需要认证
  | 'needs_client_registration'; // 需要客户端注册

/**
 * 状态转换
 */
const STATUS_TRANSITIONS: Record<MCPServerStatus, MCPServerStatus[]> = {
  idle: ['connecting'],
  connecting: ['connected', 'failed', 'needs_auth', 'needs_client_registration'],
  connected: ['failed', 'idle'],
  failed: ['connecting', 'idle'],
  disabled: ['idle'],
  needs_auth: ['connecting', 'disabled'],
  needs_client_registration: ['disabled']
};

/**
 * 检查状态转换是否合法
 */
export function canTransition(from: MCPServerStatus, to: MCPServerStatus): boolean {
  return STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * 根据错误判断新状态
 */
export function determineStatusFromError(error: unknown): MCPServerStatus {
  if (isUnauthorizedError(error)) {
    if (isClientRegistrationRequired(error)) {
      return 'needs_client_registration';
    }
    return 'needs_auth';
  }
  return 'failed';
}

function isUnauthorizedError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return message.includes('401') || message.includes('unauthorized');
  }
  return false;
}

function isClientRegistrationRequired(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes('registration');
  }
  return false;
}
```

### 3.6 工具变更通知 (notifications.mts)

```typescript
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

export interface NotificationHandlers {
  onToolsChanged?: (serverId: string) => void;
  onResourcesChanged?: (serverId: string) => void;
  onPromptsChanged?: (serverId: string) => void;
}

/**
 * 注册 MCP 通知处理器
 */
export function registerNotificationHandlers(
  client: Client,
  serverId: string,
  handlers: NotificationHandlers
): void {
  // 工具列表变更
  client.setNotificationHandler(
    { method: 'notifications/tools/list_changed' },
    async () => {
      handlers.onToolsChanged?.(serverId);
    }
  );

  // 资源列表变更
  client.setNotificationHandler(
    { method: 'notifications/resources/list_changed' },
    async () => {
      handlers.onResourcesChanged?.(serverId);
    }
  );

  // Prompt 列表变更
  client.setNotificationHandler(
    { method: 'notifications/prompts/list_changed' },
    async () => {
      handlers.onPromptsChanged?.(serverId);
    }
  );
}
```

---

## 4. 配置格式变更

### 4.1 新配置格式

```typescript
// types/ai.d.ts

/**
 * MCP transport 类型
 */
export type MCPTransportType = 'stdio' | 'streamableHTTP' | 'sse';

/**
 * MCP OAuth 配置
 */
export interface MCPOAuthConfig {
  /** 已注册的客户端 ID */
  clientId?: string;
  /** 已注册的客户端密钥 */
  clientSecret?: string;
  /** 当前访问令牌 */
  accessToken?: string;
  /** 刷新令牌 */
  refreshToken?: string;
  /** 令牌过期时间 (Unix 时间戳，秒) */
  expiresAt?: number;
  /** 授权范围 */
  scope?: string;
}

/**
 * MCP Server 配置
 */
export interface MCPServerConfig {
  /** 稳定 ID */
  id: string;
  /** 展示名称 */
  name: string;
  /** 是否启用 */
  enabled: boolean;
  /** 传输类型 */
  transport: MCPTransportType;
  /** HTTP/SSE 端点 URL */
  url?: string;
  /** 启动命令 (stdio) */
  command: string;
  /** 启动参数 */
  args: string[];
  /** 环境变量 */
  env: Record<string, string>;
  /** 工具白名单 */
  toolAllowlist: string[];
  /** OAuth 配置 */
  oauth?: MCPOAuthConfig;
  /** 是否监听工具变更通知 */
  watchToolChanges?: boolean;
  /** 连接超时 (ms) */
  connectTimeoutMs: number;
  /** 工具调用超时 (ms) */
  toolCallTimeoutMs: number;
}

/**
 * MCP 运行状态
 */
export type MCPRuntimeStatus = 
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'failed'
  | 'disabled'
  | 'needs_auth'
  | 'needs_client_registration';
```

### 4.2 配置示例

**Stdio 服务器：**
```json
{
  "id": "filesystem",
  "name": "Filesystem",
  "enabled": true,
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"],
  "env": {},
  "toolAllowlist": [],
  "watchToolChanges": true,
  "connectTimeoutMs": 20000,
  "toolCallTimeoutMs": 30000
}
```

**HTTP 服务器 (无需认证)：**
```json
{
  "id": "remote-tools",
  "name": "Remote Tools",
  "enabled": true,
  "transport": "streamableHTTP",
  "url": "https://example.com/mcp",
  "command": "",
  "args": [],
  "env": {},
  "toolAllowlist": [],
  "connectTimeoutMs": 20000,
  "toolCallTimeoutMs": 30000
}
```

**HTTP 服务器 (OAuth 认证)：**
```json
{
  "id": "oauth-server",
  "name": "OAuth Server",
  "enabled": true,
  "transport": "streamableHTTP",
  "url": "https://oauth-server.com/mcp",
  "command": "",
  "args": [],
  "env": {},
  "toolAllowlist": [],
  "oauth": {
    "clientId": "pre-registered-client-id",
    "clientSecret": "secret"
  },
  "watchToolChanges": true,
  "connectTimeoutMs": 20000,
  "toolCallTimeoutMs": 30000
}
```

---

## 5. IPC 接口设计

### 5.1 新增 IPC 通道

| 通道 | 说明 | 参数 | 返回值 |
|------|------|------|--------|
| `mcp:connect` | 连接服务器 | `MCPServerConfig` | `MCPDiscoveryRefreshResult` |
| `mcp:disconnect` | 断开服务器 | `serverId` | `void` |
| `mcp:status` | 获取状态 | `serverIds` | `MCPStatusResponse[]` |
| `mcp:discovery` | 获取缓存 | `serverId?` | `MCPServerDiscoveryCache?` |
| `mcp:refresh` | 刷新发现 | `serverId` | `MCPDiscoveryRefreshResult` |
| `mcp:oauth:start` | 启动 OAuth | `serverId` | `{ authorizationUrl: string }` |
| `mcp:oauth:complete` | 完成 OAuth | `serverId, code` | `void` |
| `mcp:oauth:clear` | 清除凭据 | `serverId` | `void` |
| `mcp:tools:changed` | 工具变更通知 | `{ serverId }` | 事件推送 |

### 5.2 Preload API

```typescript
export interface ElectronAPI {
  // ... 现有 API

  mcp: {
    connect: (server: MCPServerConfig) => Promise<MCPDiscoveryRefreshResult>;
    disconnect: (serverId: string) => Promise<void>;
    getStatus: (serverIds: string[]) => Promise<MCPStatusResponse[]>;
    getDiscovery: (serverId?: string) => Promise<MCPServerDiscoveryCache | MCPServerDiscoveryCache[] | undefined>;
    refresh: (serverId: string) => Promise<MCPDiscoveryRefreshResult>;

    // OAuth
    startOAuth: (serverId: string) => Promise<{ authorizationUrl: string }>;
    completeOAuth: (serverId: string, code: string) => Promise<void>;
    clearOAuth: (serverId: string) => Promise<void>;

    // 事件
    onToolsChanged: (callback: (serverId: string) => void) => () => void;
  };
}
```

---

## 6. 删除的旧代码

| 文件 | 说明 |
|------|------|
| `local-stdio.mts` | 自实现的 Stdio 客户端 |
| `local-http.mts` | 自实现的 HTTP 客户端 |
| `runtime.mts` 中的旧会话管理逻辑 | 将被新模块替换 |

---

## 7. 实现步骤

### Phase 1: 基础设施 (1-2 天)

1. 创建新模块文件结构
2. 实现 Transport 工厂
3. 实现 Client 包装器
4. 实现状态管理

### Phase 2: 核心功能 (2-3 天)

1. 重构 Session 管理
2. 实现 Discovery 缓存
3. 实现工具调用
4. 更新 IPC 接口

### Phase 3: OAuth 支持 (2-3 天)

1. 实现 OAuth Provider
2. 实现回调服务器
3. 实现 Token 存储
4. 实现动态客户端注册

### Phase 4: 通知与事件 (1-2 天)

1. 实现工具变更通知
2. 实现事件推送
3. 更新前端订阅逻辑

### Phase 5: 前端适配 (1-2 天)

1. 更新设置页面
2. 添加 OAuth 授权流程 UI
3. 更新状态显示

### Phase 6: 测试与清理 (1-2 天)

1. 删除旧代码
2. 更新测试
3. 文档更新

---

## 8. 前端交互流程

### 8.1 服务器连接流程

```
用户点击"连接"
    │
    ▼
调用 mcp.connect(server)
    │
    ▼
┌─────────────────────────────┐
│ 状态: connecting            │
│ 显示: 加载动画              │
└─────────────────────────────┘
    │
    ├──────────────────┬──────────────────┐
    │                  │                  │
    ▼                  ▼                  ▼
 连接成功          需要 OAuth         连接失败
    │                  │                  │
    ▼                  ▼                  ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ 状态:       │  │ 状态:       │  │ 状态:       │
│ connected   │  │ needs_auth  │  │ failed      │
│             │  │             │  │             │
│ 显示:       │  │ 显示:       │  │ 显示:       │
│ 工具列表    │  │ OAuth 按钮  │  │ 错误信息    │
└─────────────┘  └─────────────┘  └─────────────┘
```

### 8.2 OAuth 授权流程

```
用户点击"授权"
    │
    ▼
调用 mcp.startOAuth(server)
    │
    ▼
┌─────────────────────────────┐
│ 1. 启动本地回调服务器       │
│    (端口 19876)             │
│                             │
│ 2. 生成 state 参数          │
│                             │
│ 3. 返回 authorizationUrl    │
└─────────────────────────────┘
    │
    ▼
打开浏览器 → authorizationUrl
    │
    ▼
用户在浏览器中授权
    │
    ▼
浏览器重定向到回调 URL
    │
    ▼
┌─────────────────────────────┐
│ 回调服务器接收              │
│ ?code=xxx&state=yyy         │
│                             │
│ 验证 state                  │
│ 返回成功页面                │
└─────────────────────────────┘
    │
    ▼
调用 mcp.completeOAuth(server, code)
    │
    ▼
┌─────────────────────────────┐
│ 1. 用 code 交换 token       │
│ 2. 保存 token               │
│ 3. 重新连接                 │
└─────────────────────────────┘
    │
    ▼
连接成功，显示工具列表
```

### 8.3 前端组件设计

**服务器列表项组件：**

```vue
<template>
  <div class="server-item">
    <div class="server-header">
      <span class="server-name">{{ server.name }}</span>
      <StatusBadge :status="status.runtimeStatus" />
    </div>
    
    <div class="server-info">
      <template v-if="server.transport === 'stdio'">
        <code>{{ server.command }} {{ server.args.join(' ') }}</code>
      </template>
      <template v-else>
        <code>{{ server.url }}</code>
      </template>
    </div>
    
    <div class="server-actions">
      <!-- 连接/断开按钮 -->
      <button 
        v-if="status.runtimeStatus === 'idle'"
        @click="handleConnect"
      >
        连接
      </button>
      
      <!-- OAuth 授权按钮 -->
      <button 
        v-if="status.runtimeStatus === 'needs_auth'"
        @click="handleOAuth"
        class="oauth-btn"
      >
        授权
      </button>
      
      <!-- 重试按钮 -->
      <button 
        v-if="status.runtimeStatus === 'failed'"
        @click="handleConnect"
      >
        重试
      </button>
      
      <!-- 断开按钮 -->
      <button 
        v-if="status.runtimeStatus === 'connected'"
        @click="handleDisconnect"
      >
        断开
      </button>
      
      <button @click="handleEdit">编辑</button>
      <button @click="handleDelete" class="danger">删除</button>
    </div>
    
    <!-- 工具列表 (已连接时显示) -->
    <div v-if="status.runtimeStatus === 'connected'" class="tool-list">
      <div v-for="tool in tools" :key="tool.toolName" class="tool-item">
        {{ tool.toolName }}
        <span v-if="tool.description">{{ tool.description }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ server: MCPServerConfig }>();

const status = ref<MCPStatusResponse>({ 
  serverId: props.server.id,
  runtimeStatus: 'idle',
  discoveryStatus: 'idle'
});

const tools = ref<MCPDiscoveredToolSnapshot[]>([]);

// 轮询或监听状态变化
watch(() => props.server.id, async (id) => {
  const statuses = await window.electronAPI.mcp.getStatus([id]);
  status.value = statuses[0];
}, { immediate: true });

async function handleConnect() {
  const result = await window.electronAPI.mcp.connect(props.server);
  if (result.ok) {
    tools.value = result.cache?.tools ?? [];
  }
  // 刷新状态
  const statuses = await window.electronAPI.mcp.getStatus([props.server.id]);
  status.value = statuses[0];
}

async function handleOAuth() {
  const result = await window.electronAPI.mcp.startOAuth(props.server);
  // 浏览器会自动打开
  // 等待回调完成后，前端需要轮询状态或监听事件
}

async function handleDisconnect() {
  await window.electronAPI.mcp.disconnect(props.server.id);
  tools.value = [];
}
</script>
```

**状态徽章组件：**

```vue
<template>
  <span :class="['status-badge', status]">
    {{ label }}
  </span>
</template>

<script setup lang="ts">
const props = defineProps<{ status: MCPRuntimeStatus }>();

const labelMap: Record<MCPRuntimeStatus, string> = {
  idle: '未连接',
  connecting: '连接中',
  connected: '已连接',
  failed: '连接失败',
  disabled: '已禁用',
  needs_auth: '需要授权',
  needs_client_registration: '需要注册'
};

const label = computed(() => labelMap[props.status]);
</script>

<style scoped>
.status-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.status-badge.connected { background: #4caf50; color: white; }
.status-badge.connecting { background: #2196f3; color: white; }
.status-badge.failed { background: #f44336; color: white; }
.status-badge.needs_auth { background: #ff9800; color: white; }
.status-badge.idle { background: #9e9e9e; color: white; }
</style>
```

---

## 9. 测试计划

### 9.1 单元测试

**test/electron/mcp/transport.test.ts:**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createTransport } from '@/electron/main/modules/mcp/transport';

describe('createTransport', () => {
  describe('stdio transport', () => {
    it('creates StdioClientTransport with valid config', () => {
      const transport = createTransport({
        transport: 'stdio',
        command: 'npx',
        args: ['-y', 'server']
      });
      expect(transport).toBeDefined();
    });

    it('throws error if command is missing', () => {
      expect(() => createTransport({
        transport: 'stdio',
        command: ''
      })).toThrow('Command is required');
    });
  });

  describe('streamableHTTP transport', () => {
    it('creates StreamableHTTPClientTransport with valid URL', () => {
      const transport = createTransport({
        transport: 'streamableHTTP',
        url: 'https://example.com/mcp'
      });
      expect(transport).toBeDefined();
    });

    it('throws error if URL is missing', () => {
      expect(() => createTransport({
        transport: 'streamableHTTP',
        url: ''
      })).toThrow('URL is required');
    });

    it('throws error if URL is invalid', () => {
      expect(() => createTransport({
        transport: 'streamableHTTP',
        url: 'not-a-url'
      })).toThrow();
    });
  });

  describe('sse transport', () => {
    it('creates SSEClientTransport with valid URL', () => {
      const transport = createTransport({
        transport: 'sse',
        url: 'https://example.com/mcp/sse'
      });
      expect(transport).toBeDefined();
    });
  });
});
```

**test/electron/mcp/status.test.ts:**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { setStatus, getStatus, isValidTransition, clearAllStatus } from '@/electron/main/modules/mcp/status';

describe('status management', () => {
  beforeEach(() => {
    clearAllStatus();
  });

  describe('isValidTransition', () => {
    it('allows idle → connecting', () => {
      expect(isValidTransition('idle', 'connecting')).toBe(true);
    });

    it('allows connecting → connected', () => {
      expect(isValidTransition('connecting', 'connected')).toBe(true);
    });

    it('allows connecting → needs_auth', () => {
      expect(isValidTransition('connecting', 'needs_auth')).toBe(true);
    });

    it('disallows idle → connected', () => {
      expect(isValidTransition('idle', 'connected')).toBe(false);
    });

    it('disallows connected → connecting', () => {
      expect(isValidTransition('connected', 'connecting')).toBe(false);
    });
  });

  describe('setStatus / getStatus', () => {
    it('sets and gets status', () => {
      setStatus('test-server', 'connecting', 'refreshing');
      const status = getStatus('test-server');
      
      expect(status.serverId).toBe('test-server');
      expect(status.runtimeStatus).toBe('connecting');
      expect(status.discoveryStatus).toBe('refreshing');
    });

    it('returns idle status for unknown server', () => {
      const status = getStatus('unknown-server');
      
      expect(status.runtimeStatus).toBe('idle');
      expect(status.discoveryStatus).toBe('idle');
    });

    it('updates existing status', () => {
      setStatus('test', 'connecting', 'refreshing');
      setStatus('test', 'connected', 'ready');
      
      const status = getStatus('test');
      expect(status.runtimeStatus).toBe('connected');
    });
  });
});
```

**test/electron/mcp/errors.test.ts:**

```typescript
import { describe, it, expect } from 'vitest';
import { classifyMcpError, isOAuthError, isRetryable } from '@/electron/main/modules/mcp/errors';

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
      const error = new Error('401 Unauthorized');
      expect(isOAuthError(error)).toBe(true);
    });

    it('returns false for timeout', () => {
      const error = new Error('Timeout');
      expect(isOAuthError(error)).toBe(false);
    });
  });

  describe('isRetryable', () => {
    it('returns true for timeout', () => {
      const error = new Error('Connection timed out');
      expect(isRetryable(error)).toBe(true);
    });

    it('returns true for network error', () => {
      const error = new Error('ECONNREFUSED');
      expect(isRetryable(error)).toBe(true);
    });

    it('returns false for OAuth error', () => {
      const error = new Error('401 Unauthorized');
      expect(isRetryable(error)).toBe(false);
    });
  });
});
```

**test/electron/mcp/oauth/provider.test.ts:**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { TibisOAuthProvider } from '@/electron/main/modules/mcp/oauth/provider';
import { clearOAuthData, saveOAuthData } from '@/electron/main/modules/mcp/oauth/storage';

describe('TibisOAuthProvider', () => {
  const server: MCPServerConfig = {
    id: 'test-oauth',
    name: 'Test OAuth Server',
    enabled: true,
    transport: 'streamableHTTP',
    url: 'https://example.com/mcp',
    command: '',
    args: [],
    env: {},
    toolAllowlist: [],
    connectTimeoutMs: 20000,
    toolCallTimeoutMs: 30000
  };

  let provider: TibisOAuthProvider;

  beforeEach(async () => {
    await clearOAuthData(server.id);
    provider = new TibisOAuthProvider(server);
  });

  describe('redirectUrl', () => {
    it('returns correct callback URL', () => {
      expect(provider.redirectUrl).toBe('http://127.0.0.1:19876/mcp/oauth/callback');
    });
  });

  describe('clientMetadata', () => {
    it('returns correct metadata', () => {
      const metadata = provider.clientMetadata;
      
      expect(metadata.client_name).toBe('Tibis MCP Client');
      expect(metadata.redirect_uris).toContain(provider.redirectUrl);
      expect(metadata.grant_types).toContain('authorization_code');
    });
  });

  describe('clientInformation', () => {
    it('returns undefined when no client info stored', async () => {
      const info = await provider.clientInformation();
      expect(info).toBeUndefined();
    });

    it('returns stored client info', async () => {
      await saveOAuthData({
        serverId: server.id,
        serverUrl: server.url!,
        clientId: 'test-client-id',
        clientSecret: 'test-secret',
        createdAt: Date.now(),
        updatedAt: Date.now()
      });

      const info = await provider.clientInformation();
      
      expect(info?.client_id).toBe('test-client-id');
      expect(info?.client_secret).toBe('test-secret');
    });
  });

  describe('tokens', () => {
    it('returns undefined when no tokens stored', async () => {
      const tokens = await provider.tokens();
      expect(tokens).toBeUndefined();
    });

    it('returns undefined for expired tokens', async () => {
      await saveOAuthData({
        serverId: server.id,
        serverUrl: server.url!,
        accessToken: 'expired-token',
        expiresAt: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
        createdAt: Date.now(),
        updatedAt: Date.now()
      });

      const tokens = await provider.tokens();
      expect(tokens).toBeUndefined();
    });

    it('returns valid tokens', async () => {
      await saveOAuthData({
        serverId: server.id,
        serverUrl: server.url!,
        accessToken: 'valid-token',
        refreshToken: 'refresh-token',
        expiresAt: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
        createdAt: Date.now(),
        updatedAt: Date.now()
      });

      const tokens = await provider.tokens();
      
      expect(tokens?.access_token).toBe('valid-token');
      expect(tokens?.refresh_token).toBe('refresh-token');
      expect(tokens?.expires_in).toBeGreaterThan(0);
    });
  });

  describe('saveTokens', () => {
    it('saves tokens correctly', async () => {
      await provider.saveTokens({
        access_token: 'new-token',
        refresh_token: 'new-refresh',
        expires_in: 7200
      });

      const tokens = await provider.tokens();
      
      expect(tokens?.access_token).toBe('new-token');
      expect(tokens?.refresh_token).toBe('new-refresh');
    });
  });
});
```

### 9.2 集成测试

**test/electron/mcp/session.test.ts:**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { connect, disconnect, getSession, resetAll } from '@/electron/main/modules/mcp/session';

describe('session management', () => {
  beforeEach(() => {
    resetAll();
  });

  afterEach(async () => {
    resetAll();
  });

  describe('connect', () => {
    it('connects to stdio server successfully', async () => {
      const result = await connect({
        id: 'test-stdio',
        name: 'Test Stdio',
        enabled: true,
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-everything'],
        env: {},
        toolAllowlist: [],
        connectTimeoutMs: 60000,
        toolCallTimeoutMs: 30000
      });

      expect(result.ok).toBe(true);
      expect(result.cache?.tools.length).toBeGreaterThan(0);
      
      const session = getSession('test-stdio');
      expect(session).toBeDefined();
      expect(session?.isConnected()).toBe(true);
    }, 60000);

    it('fails gracefully for invalid command', async () => {
      const result = await connect({
        id: 'invalid-stdio',
        name: 'Invalid Stdio',
        enabled: true,
        transport: 'stdio',
        command: 'nonexistent-command-xyz',
        args: [],
        env: {},
        toolAllowlist: [],
        connectTimeoutMs: 5000,
        toolCallTimeoutMs: 30000
      });

      expect(result.ok).toBe(false);
      expect(result.errorCode).toBeDefined();
    }, 10000);

    it('sets needs_auth status for protected HTTP server', async () => {
      const result = await connect({
        id: 'protected-http',
        name: 'Protected HTTP',
        enabled: true,
        transport: 'streamableHTTP',
        url: 'https://protected-server.example.com/mcp',
        command: '',
        args: [],
        env: {},
        toolAllowlist: [],
        connectTimeoutMs: 5000,
        toolCallTimeoutMs: 30000
      });

      expect(result.ok).toBe(false);
      // 注意：实际测试需要模拟服务器响应
      // expect(result.errorCode).toBe('AUTH_REQUIRED');
    });
  });

  describe('disconnect', () => {
    it('disconnects from server', async () => {
      await connect({
        id: 'disconnect-test',
        name: 'Disconnect Test',
        enabled: true,
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-everything'],
        env: {},
        toolAllowlist: [],
        connectTimeoutMs: 60000,
        toolCallTimeoutMs: 30000
      });

      await disconnect('disconnect-test');

      const session = getSession('disconnect-test');
      expect(session).toBeUndefined();
    }, 60000);
  });
});
```

### 9.3 E2E 测试

**test/e2e/mcp-settings.test.ts:**

```typescript
import { test, expect } from '@playwright/test';

test.describe('MCP Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('app://-/settings/tools/mcp');
  });

  test('displays empty state when no servers configured', async ({ page }) => {
    const emptyState = page.locator('.empty-state');
    await expect(emptyState).toBeVisible();
    await expect(emptyState).toContainText('没有配置 MCP 服务器');
  });

  test('adds stdio server successfully', async ({ page }) => {
    // 点击添加按钮
    await page.click('[data-testid="add-server"]');
    
    // 填写表单
    await page.fill('[name="name"]', 'Test Stdio');
    await page.selectOption('[name="transport"]', 'stdio');
    await page.fill('[name="command"]', 'npx');
    await page.fill('[name="args"]', '-y @modelcontextprotocol/server-everything');
    
    // 保存
    await page.click('[data-testid="save"]');
    
    // 验证服务器出现在列表中
    const serverItem = page.locator('.server-item', { hasText: 'Test Stdio' });
    await expect(serverItem).toBeVisible();
  });

  test('connects to server and shows tools', async ({ page }) => {
    // 假设已经有一个配置好的服务器
    const connectButton = page.locator('.server-item:first-child button:has-text("连接")');
    await connectButton.click();
    
    // 等待状态变为已连接
    const statusBadge = page.locator('.server-item:first-child .status-badge.connected');
    await expect(statusBadge).toBeVisible({ timeout: 30000 });
    
    // 验证工具列表显示
    const toolList = page.locator('.server-item:first-child .tool-list');
    await expect(toolList).toBeVisible();
  });

  test('shows OAuth button when server needs auth', async ({ page }) => {
    // 模拟一个需要 OAuth 的服务器
    const serverItem = page.locator('.server-item[data-needs-auth]');
    
    const statusBadge = serverItem.locator('.status-badge.needs_auth');
    await expect(statusBadge).toBeVisible();
    
    const oauthButton = serverItem.locator('button:has-text("授权")');
    await expect(oauthButton).toBeVisible();
  });
});
```

---

## 10. 风险与缓解

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| SDK API 变更 | 高 | 中 | 锁定版本号，关注更新日志，添加集成测试 |
| OAuth 兼容性 | 中 | 低 | 参考 OpenCode 实现，支持标准 OAuth 2.0 |
| 性能回归 | 中 | 低 | Benchmark 对比，监控连接时间 |
| 前端改动范围 | 中 | 中 | 保持 IPC 接口稳定，逐步迁移前端 |
| 回调端口冲突 | 低 | 低 | 端口可配置，支持动态分配 |

---

## 11. 参考资料

- [MCP SDK GitHub](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP 协议规范](https://modelcontextprotocol.io/)
- [OpenCode MCP 实现](https://github.com/opencode-ai/opencode)
- [RFC 6749 - OAuth 2.0](https://datatracker.ietf.org/doc/html/rfc6749)
- [RFC 7591 - OAuth 2.0 Dynamic Client Registration](https://datatracker.ietf.org/doc/html/rfc7591)
- [RFC 9728 - OAuth 2.0 Protected Resource Metadata](https://datatracker.ietf.org/doc/html/rfc9728)
