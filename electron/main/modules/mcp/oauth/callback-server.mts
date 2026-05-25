/**
 * @file callback-server.mts
 * @description OAuth 本地回调服务器，监听授权码回调。
 */
import http from 'node:http';
import { log } from '../../logger/service.mjs';
import { OAUTH_CALLBACK_PORT } from './provider.mjs';

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

  /**
   * 启动回调服务器并等待授权码。
   * @param state - 预期 CSRF state 参数
   * @param timeoutMs - 超时时间（ms），默认 5 分钟
   * @returns OAuth 回调结果
   */
  async waitForCallback(state: string, timeoutMs = 300000): Promise<OAuthCallbackResult> {
    return new Promise((resolve, reject) => {
      let settled = false;

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
          if (!settled) {
            settled = true;
            reject(new Error('Missing authorization code'));
          }
          return;
        }

        if (state && receivedState !== state) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<h1>错误</h1><p>State 不匹配</p>');
          if (!settled) {
            settled = true;
            reject(new Error('State mismatch'));
          }
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>授权成功</h1><p>您可以关闭此页面</p>');

        if (!settled) {
          settled = true;
          resolve({ code, state: receivedState ?? undefined });
        }
        this.stop();
      });

      this.server.listen(OAUTH_CALLBACK_PORT, () => {
        log.info(`OAuth callback server listening on port ${OAUTH_CALLBACK_PORT}`);
      });

      this.server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          if (!settled) {
            settled = true;
            reject(new Error(`OAuth callback port ${OAUTH_CALLBACK_PORT} is already in use`));
          }
        } else if (!settled) {
          settled = true;
          reject(err);
        }
        this.stop();
      });

      setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('OAuth callback timeout'));
        }
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
  }
}
