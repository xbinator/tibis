/**
 * @file service.mts
 * @description 检查 GitHub Release 最新版本，并归一化为渲染进程可展示的更新信息。
 */

const GITHUB_LATEST_RELEASE_URL = 'https://api.github.com/repos/xbinator/tibis/releases/latest';

/**
 * GitHub Release API 的最小响应结构。
 */
interface GithubReleaseResponse {
  /** Release 标签名，例如 v0.2.0。 */
  tag_name?: unknown;
  /** Release 网页地址。 */
  html_url?: unknown;
  /** Release 展示名。 */
  name?: unknown;
  /** 发布时间。 */
  published_at?: unknown;
}

/**
 * 可注入的 fetch 函数，便于测试更新检查逻辑。
 */
export type UpdateFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/**
 * 检查更新的输入参数。
 */
export interface CheckForUpdateOptions {
  /** 当前应用版本。 */
  currentVersion: string;
  /** 可选 fetch 替身，测试中使用。 */
  fetcher?: UpdateFetch;
}

/**
 * 发现新版本时返回给渲染进程的数据。
 */
export interface UpdateAvailableResult {
  /** 是否存在可用更新。 */
  available: true;
  /** 当前应用版本。 */
  currentVersion: string;
  /** GitHub Release 最新版本。 */
  latestVersion: string;
  /** Release 展示名。 */
  releaseName?: string;
  /** Release 网页地址，用于引导下载。 */
  releaseUrl: string;
  /** Release 发布时间。 */
  publishedAt?: string;
}

/**
 * 未发现更新或检查失败时返回给渲染进程的数据。
 */
export interface UpdateUnavailableResult {
  /** 是否存在可用更新。 */
  available: false;
  /** 当前应用版本。 */
  currentVersion: string;
  /** GitHub Release 最新版本，检查失败时为空。 */
  latestVersion?: string;
  /** 检查失败时的错误消息。 */
  errorMessage?: string;
}

export type UpdateCheckResult = UpdateAvailableResult | UpdateUnavailableResult;

/**
 * 去掉 GitHub Release 标签常见的 v 前缀。
 * @param tag - Release 标签
 * @returns 归一化后的版本号
 */
export function normalizeReleaseTag(tag: string): string {
  return tag.trim().replace(/^v/i, '');
}

/**
 * 将版本号拆成可比较的数字段。
 * @param version - 版本号文本
 * @returns 主版本、次版本、修订版本数字段
 */
function parseVersionSegments(version: string): [number, number, number] {
  const normalizedVersion = normalizeReleaseTag(version);
  const [major = '0', minor = '0', patch = '0'] = normalizedVersion.split(/[.-]/, 3);

  return [Number(major) || 0, Number(minor) || 0, Number(patch) || 0];
}

/**
 * 比较两个语义化版本。
 * @param leftVersion - 左侧版本
 * @param rightVersion - 右侧版本
 * @returns 左侧大于右侧时为正数，相等为 0，小于时为负数
 */
export function compareVersions(leftVersion: string, rightVersion: string): number {
  const leftSegments = parseVersionSegments(leftVersion);
  const rightSegments = parseVersionSegments(rightVersion);

  for (let index = 0; index < leftSegments.length; index += 1) {
    const diff = leftSegments[index] - rightSegments[index];

    if (diff !== 0) {
      return diff;
    }
  }

  return 0;
}

/**
 * 判断未知值是否为对象记录。
 * @param value - 待判断值
 * @returns 是否为可读取属性的对象
 */
function isRecord(value: unknown): value is GithubReleaseResponse {
  return typeof value === 'object' && value !== null;
}

/**
 * 读取未知字段中的字符串值。
 * @param value - 待读取值
 * @returns 字符串值，不是字符串时返回 undefined
 */
function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

/**
 * 从 GitHub Release API 响应归一化最新版本信息。
 * @param body - GitHub Release API 响应体
 * @returns 更新检查结果所需的 Release 信息
 */
function normalizeGithubRelease(body: unknown): Pick<UpdateAvailableResult, 'latestVersion' | 'releaseName' | 'releaseUrl' | 'publishedAt'> | null {
  if (!isRecord(body)) {
    return null;
  }

  const tagName = readString(body.tag_name);
  const releaseUrl = readString(body.html_url);

  if (!tagName || !releaseUrl) {
    return null;
  }

  return {
    latestVersion: normalizeReleaseTag(tagName),
    releaseName: readString(body.name),
    releaseUrl,
    publishedAt: readString(body.published_at)
  };
}

/**
 * 检查 GitHub Release 是否存在新版本。
 * @param options - 当前版本与可选 fetch 替身
 * @returns 更新检查结果
 */
export async function checkForUpdate(options: CheckForUpdateOptions): Promise<UpdateCheckResult> {
  const fetcher = options.fetcher ?? fetch;
  const currentVersion = normalizeReleaseTag(options.currentVersion);

  try {
    const response = await fetcher(GITHUB_LATEST_RELEASE_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Tibis Update Checker'
      }
    });

    if (!response.ok) {
      return { available: false, currentVersion, errorMessage: `GitHub Release request failed with status ${response.status}` };
    }

    const release = normalizeGithubRelease(await response.json());

    if (!release) {
      return { available: false, currentVersion, errorMessage: 'GitHub Release response is incomplete' };
    }

    if (compareVersions(release.latestVersion, currentVersion) <= 0) {
      return { available: false, currentVersion, latestVersion: release.latestVersion };
    }

    return {
      available: true,
      currentVersion,
      latestVersion: release.latestVersion,
      releaseName: release.releaseName,
      releaseUrl: release.releaseUrl,
      publishedAt: release.publishedAt
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return { available: false, currentVersion, errorMessage };
  }
}
