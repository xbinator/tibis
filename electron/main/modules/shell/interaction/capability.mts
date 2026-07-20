/**
 * @file capability.mts
 * @description Shell auto-default 的平台、架构与 release verification capability gate。
 */

/** 当前自动交互安全验证版本。 */
export const AUTO_DEFAULT_VERIFICATION_VERSION = 'v1';

/** 自动交互能力未开放的原因。 */
export type AutoDefaultCapabilityReason = 'FEATURE_DISABLED' | 'VERIFICATION_MISMATCH';

/** Shell auto-default 运行能力。 */
export interface ShellAutoDefaultCapability {
  /** 当前构建是否允许使用 auto-default。 */
  enabled: boolean;
  /** 未开放原因，开放时为 null。 */
  reason: AutoDefaultCapabilityReason | null;
  /** 当前代码要求的验证版本。 */
  verificationVersion: string;
  /** 已判断的平台。 */
  platform: string;
  /** 已判断的 CPU 架构。 */
  arch: string;
}

/**
 * 计算当前平台所需的精确 release verification token。
 * @param platform - Node 平台标识
 * @param arch - Node CPU 架构
 * @returns 平台、架构和版本绑定的 token
 */
function expectedToken(platform: string, arch: string): string {
  return `${platform}-${arch}:${AUTO_DEFAULT_VERIFICATION_VERSION}`;
}

/**
 * 获取 Shell auto-default capability。
 * @param configuredToken - 构建或启动环境注入的验证 token
 * @param platform - 当前平台
 * @param arch - 当前 CPU 架构
 * @returns 版本化能力判断
 */
export function getAutoDefaultCapability(
  configuredToken: string | undefined = process.env.TIBIS_SHELL_AUTO_DEFAULT_CAPABILITY,
  platform: string = process.platform,
  arch: string = process.arch
): ShellAutoDefaultCapability {
  const token = configuredToken?.trim();
  const enabled = token === expectedToken(platform, arch);
  let reason: AutoDefaultCapabilityReason | null = null;
  if (!enabled) reason = token ? 'VERIFICATION_MISMATCH' : 'FEATURE_DISABLED';
  return {
    enabled,
    reason,
    verificationVersion: AUTO_DEFAULT_VERIFICATION_VERSION,
    platform,
    arch
  };
}
