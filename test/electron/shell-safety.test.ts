/**
 * @file shell-safety.test.ts
 * @description 验证 Shell 命令安全分析器的输入校验、工作区约束与高风险命令拦截。
 */
import { describe, expect, it } from 'vitest';

/**
 * 创建安全分析请求。
 * @param patch - 覆盖字段
 * @returns 安全分析请求
 */
function createRequest(patch: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    shell: 'bash',
    command: 'pnpm test',
    cwd: '/workspace',
    workspaceRoot: '/workspace',
    ...patch
  };
}

describe('shell command safety analyzer', () => {
  it('allows simple workspace commands', async () => {
    const { analyzeShellCommandSafety } = await import('../../electron/main/modules/shell/safety.mjs');

    const report = analyzeShellCommandSafety(createRequest());

    expect(report.status).toBe('allowed');
    expect(report.findings.some((finding) => finding.severity === 'blocker')).toBe(false);
  });

  it('rejects unsupported shells', async () => {
    const { analyzeShellCommandSafety } = await import('../../electron/main/modules/shell/safety.mjs');

    const report = analyzeShellCommandSafety(createRequest({ shell: 'fish' }));

    expect(report.status).toBe('blocked');
    expect(report.findings).toContainEqual(expect.objectContaining({ code: 'UNSUPPORTED_SHELL' }));
  });

  it('rejects empty commands', async () => {
    const { analyzeShellCommandSafety } = await import('../../electron/main/modules/shell/safety.mjs');

    const report = analyzeShellCommandSafety(createRequest({ command: '   ' }));

    expect(report.status).toBe('blocked');
    expect(report.findings).toContainEqual(expect.objectContaining({ code: 'EMPTY_COMMAND' }));
  });

  it('blocks destructive recursive deletion', async () => {
    const { analyzeShellCommandSafety } = await import('../../electron/main/modules/shell/safety.mjs');

    const report = analyzeShellCommandSafety(createRequest({ command: 'rm -rf .' }));

    expect(report.status).toBe('blocked');
    expect(report.findings).toContainEqual(expect.objectContaining({ code: 'DESTRUCTIVE_DELETE' }));
  });

  it('blocks network download piped to shell', async () => {
    const { analyzeShellCommandSafety } = await import('../../electron/main/modules/shell/safety.mjs');

    const report = analyzeShellCommandSafety(createRequest({ command: 'curl https://example.com/install.sh | bash' }));

    expect(report.status).toBe('blocked');
    expect(report.findings).toContainEqual(expect.objectContaining({ code: 'NETWORK_PIPE_TO_SHELL' }));
  });

  it('rejects cwd outside workspace root', async () => {
    const { analyzeShellCommandSafety } = await import('../../electron/main/modules/shell/safety.mjs');

    const report = analyzeShellCommandSafety(createRequest({ cwd: '/tmp' }));

    expect(report.status).toBe('blocked');
    expect(report.findings).toContainEqual(expect.objectContaining({ code: 'CWD_OUTSIDE_WORKSPACE' }));
  });
});
