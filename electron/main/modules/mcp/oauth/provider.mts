/**
 * @file provider.mts
 * @description MCP OAuthClientProvider 实现，桥接 SDK OAuth 流程与 Tibis 存储。
 */
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type { OAuthClientInformationMixed, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { MCPServerConfig } from 'types/ai';
import { AuthorizationPendingError } from './auth-error.mjs';
import { clearOAuthData, loadOAuthData, saveOAuthData } from './storage.mjs';

/**
 * OAuth 回调端口。
 */
export const OAUTH_CALLBACK_PORT = 19876;

export { AuthorizationPendingError };

/**
 * Tibis OAuth Provider 实现。
 */
export class TibisOAuthProvider implements OAuthClientProvider {
  private readonly server: MCPServerConfig;

  constructor(server: MCPServerConfig) {
    this.server = server;
  }

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
    const data = loadOAuthData(this.server.id);
    if (!data?.clientId) return undefined;
    return {
      client_id: data.clientId,
      ...(data.clientSecret ? { client_secret: data.clientSecret } : {})
    };
  }

  async saveClientInformation(info: OAuthClientInformationMixed): Promise<void> {
    const existing = loadOAuthData(this.server.id) ?? {
      serverId: this.server.id,
      serverUrl: this.server.url ?? '',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    saveOAuthData({
      ...existing,
      clientId: info.client_id,
      clientSecret: info.client_secret
    });
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    const data = loadOAuthData(this.server.id);
    if (!data?.accessToken) return undefined;
    if (data.expiresAt && data.expiresAt < Math.floor(Date.now() / 1000)) return undefined;
    return {
      access_token: data.accessToken,
      token_type: 'bearer',
      refresh_token: data.refreshToken,
      expires_in: data.expiresAt ? Math.max(0, data.expiresAt - Math.floor(Date.now() / 1000)) : undefined
    };
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    const existing = loadOAuthData(this.server.id) ?? {
      serverId: this.server.id,
      serverUrl: this.server.url ?? '',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    saveOAuthData({
      ...existing,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expires_in ? Math.floor(Date.now() / 1000) + tokens.expires_in : undefined
    });
  }

  async redirectToAuthorization(url: URL): Promise<void> {
    const state = url.searchParams.get('state');
    if (state) {
      const existing = loadOAuthData(this.server.id) ?? {
        serverId: this.server.id,
        serverUrl: this.server.url ?? '',
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      saveOAuthData({ ...existing, state });
    }
    throw new AuthorizationPendingError(url);
  }

  async saveCodeVerifier(verifier: string): Promise<void> {
    const existing = loadOAuthData(this.server.id) ?? {
      serverId: this.server.id,
      serverUrl: this.server.url ?? '',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    saveOAuthData({ ...existing, codeVerifier: verifier });
  }

  async codeVerifier(): Promise<string> {
    const data = loadOAuthData(this.server.id);
    if (!data?.codeVerifier) throw new Error('No code verifier found');
    return data.codeVerifier;
  }
}

/**
 * 清除指定 server 的 OAuth 凭据。
 * @param serverId - MCP server ID
 */
export async function clearOAuthCredentials(serverId: string): Promise<void> {
  clearOAuthData(serverId);
}
