/**
 * @file auth-error.mts
 * @description OAuth 授权等待中错误定义。
 */

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
