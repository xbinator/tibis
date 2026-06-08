/**
 * @file service.test.ts
 * @description 验证 GitHub Release 更新检查服务的版本比较与响应归一化行为。
 */
import { describe, expect, it } from 'vitest';
import { checkForUpdate, compareVersions, normalizeReleaseTag, type UpdateFetch } from '../../../../../electron/main/modules/updater/service.mts';

/**
 * 构造最小 Fetch Response 替身。
 * @param body - GitHub Release API 响应体
 * @returns Fetch Response 替身
 */
function createJsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async (): Promise<unknown> => body
  } as Response;
}

describe('normalizeReleaseTag', () => {
  it('removes the release tag prefix before comparing versions', (): void => {
    expect(normalizeReleaseTag('v0.2.0')).toBe('0.2.0');
    expect(normalizeReleaseTag('0.2.0')).toBe('0.2.0');
  });
});

describe('compareVersions', () => {
  it('orders semantic versions by major minor and patch numbers', (): void => {
    expect(compareVersions('0.2.0', '0.1.14')).toBeGreaterThan(0);
    expect(compareVersions('0.1.14', '0.1.14')).toBe(0);
    expect(compareVersions('0.1.13', '0.1.14')).toBeLessThan(0);
  });
});

describe('checkForUpdate', () => {
  it('returns release details when GitHub has a newer version', async (): Promise<void> => {
    const fetcher: UpdateFetch = async (): Promise<Response> =>
      createJsonResponse({
        tag_name: 'v0.2.0',
        html_url: 'https://github.com/xbinator/tibis/releases/tag/v0.2.0',
        name: 'Tibis v0.2.0',
        published_at: '2026-06-08T00:00:00Z'
      });

    const result = await checkForUpdate({ currentVersion: '0.1.14', fetcher });

    expect(result).toEqual({
      available: true,
      currentVersion: '0.1.14',
      latestVersion: '0.2.0',
      releaseName: 'Tibis v0.2.0',
      releaseUrl: 'https://github.com/xbinator/tibis/releases/tag/v0.2.0',
      publishedAt: '2026-06-08T00:00:00Z'
    });
  });

  it('returns no update when the latest release is not newer', async (): Promise<void> => {
    const fetcher: UpdateFetch = async (): Promise<Response> =>
      createJsonResponse({
        tag_name: 'v0.1.14',
        html_url: 'https://github.com/xbinator/tibis/releases/tag/v0.1.14'
      });

    const result = await checkForUpdate({ currentVersion: '0.1.14', fetcher });

    expect(result).toEqual({
      available: false,
      currentVersion: '0.1.14',
      latestVersion: '0.1.14'
    });
  });
});
