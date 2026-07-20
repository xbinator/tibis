/**
 * @file capability.test.ts
 * @description Shell auto-default 平台与验证版本 capability gate 测试。
 */
import { describe, expect, it } from 'vitest';
import { getAutoDefaultCapability } from '../../../../../electron/main/modules/shell/interaction/capability.mts';

describe('Shell auto-default capability', (): void => {
  it('enables only an exact platform, architecture, and verification version token', (): void => {
    expect(getAutoDefaultCapability('darwin-arm64:v1', 'darwin', 'arm64')).toEqual({
      enabled: true,
      reason: null,
      verificationVersion: 'v1',
      platform: 'darwin',
      arch: 'arm64'
    });
  });

  it.each<[string | undefined, 'FEATURE_DISABLED' | 'VERIFICATION_MISMATCH']>([
    [undefined, 'FEATURE_DISABLED'],
    ['', 'FEATURE_DISABLED'],
    ['darwin-x64:v1', 'VERIFICATION_MISMATCH'],
    ['darwin-arm64:v0', 'VERIFICATION_MISMATCH']
  ])('disables an unverified token %s', (token: string | undefined, reason: 'FEATURE_DISABLED' | 'VERIFICATION_MISMATCH'): void => {
    expect(getAutoDefaultCapability(token, 'darwin', 'arm64')).toMatchObject({ enabled: false, reason });
  });
});
