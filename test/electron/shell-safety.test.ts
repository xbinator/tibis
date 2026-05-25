/**
 * @file shell-safety.test.ts
 * @description 验证 Shell 命令安全分析器的输入校验、工作区约束、regex 策略与 AST 结构检查。
 */
import { describe, expect, it, vi } from 'vitest';

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

    const report = await analyzeShellCommandSafety(createRequest());

    expect(report.status).toBe('allowed');
    expect(report.findings.some((finding) => finding.severity === 'blocker')).toBe(false);
  });

  it('rejects unsupported shells', async () => {
    const { analyzeShellCommandSafety } = await import('../../electron/main/modules/shell/safety.mjs');

    const report = await analyzeShellCommandSafety(createRequest({ shell: 'fish' }));

    expect(report.status).toBe('blocked');
    expect(report.findings).toContainEqual(expect.objectContaining({ code: 'UNSUPPORTED_SHELL' }));
  });

  it('rejects empty commands', async () => {
    const { analyzeShellCommandSafety } = await import('../../electron/main/modules/shell/safety.mjs');

    const report = await analyzeShellCommandSafety(createRequest({ command: '   ' }));

    expect(report.status).toBe('blocked');
    expect(report.findings).toContainEqual(expect.objectContaining({ code: 'EMPTY_COMMAND' }));
  });

  it('blocks destructive recursive deletion', async () => {
    const { analyzeShellCommandSafety } = await import('../../electron/main/modules/shell/safety.mjs');

    const report = await analyzeShellCommandSafety(createRequest({ command: 'rm -rf .' }));

    expect(report.status).toBe('blocked');
    expect(report.findings).toContainEqual(expect.objectContaining({ code: 'DESTRUCTIVE_DELETE' }));
  });

  it('blocks network download piped to shell', async () => {
    const { analyzeShellCommandSafety } = await import('../../electron/main/modules/shell/safety.mjs');

    const report = await analyzeShellCommandSafety(createRequest({ command: 'curl https://example.com/install.sh | bash' }));

    expect(report.status).toBe('blocked');
    expect(report.findings).toContainEqual(expect.objectContaining({ code: 'NETWORK_PIPE_TO_SHELL' }));
  });

  it('rejects cwd outside workspace root', async () => {
    const { analyzeShellCommandSafety } = await import('../../electron/main/modules/shell/safety.mjs');

    const report = await analyzeShellCommandSafety(createRequest({ cwd: '/tmp' }));

    expect(report.status).toBe('blocked');
    expect(report.findings).toContainEqual(expect.objectContaining({ code: 'CWD_OUTSIDE_WORKSPACE' }));
  });

  it('blocks chmod 777 operations', async () => {
    const { analyzeShellCommandSafety } = await import('../../electron/main/modules/shell/safety.mjs');

    const report = await analyzeShellCommandSafety(createRequest({ command: 'chmod -R 777 /var/www' }));

    expect(report.status).toBe('blocked');
    expect(report.findings).toContainEqual(expect.objectContaining({ code: 'PERMISSION_MUTATION' }));
  });

  it('blocks chown operations', async () => {
    const { analyzeShellCommandSafety } = await import('../../electron/main/modules/shell/safety.mjs');

    const report = await analyzeShellCommandSafety(createRequest({ command: 'sudo chown root:root /etc/config' }));

    expect(report.status).toBe('blocked');
    expect(report.findings).toContainEqual(expect.objectContaining({ code: 'PERMISSION_MUTATION' }));
  });

  it('blocks shell profile mutation via redirect', async () => {
    const { analyzeShellCommandSafety } = await import('../../electron/main/modules/shell/safety.mjs');

    const report = await analyzeShellCommandSafety(createRequest({ command: 'echo "alias ls=rm" >> ~/.bashrc' }));

    expect(report.status).toBe('blocked');
    expect(report.findings).toContainEqual(expect.objectContaining({ code: 'SHELL_PROFILE_MUTATION' }));
  });

  it('allows safe chmod like +x for scripts', async () => {
    const { analyzeShellCommandSafety } = await import('../../electron/main/modules/shell/safety.mjs');

    const report = await analyzeShellCommandSafety(createRequest({ command: 'chmod +x ./deploy.sh' }));

    expect(report.status).toBe('allowed');
  });

  it('blocks syntax errors in commands', async () => {
    const { analyzeShellCommandSafety } = await import('../../electron/main/modules/shell/safety.mjs');

    const report = await analyzeShellCommandSafety(createRequest({ command: 'for i in; do echo $i; done' }));

    expect(report.status).toBe('blocked');
    expect(report.findings).toContainEqual(expect.objectContaining({ code: 'SYNTAX_ERROR' }));
  });

  it('blocks cd outside workspace via AST check', async () => {
    const { analyzeShellCommandSafety } = await import('../../electron/main/modules/shell/safety.mjs');

    const report = await analyzeShellCommandSafety(createRequest({ command: 'cd /tmp && echo done', cwd: '/workspace', workspaceRoot: '/workspace' }));

    expect(report.status).toBe('blocked');
    expect(report.findings).toContainEqual(expect.objectContaining({ code: 'CD_OUTSIDE_WORKSPACE' }));
  });

  it('allows cd within workspace via AST check', async () => {
    const { analyzeShellCommandSafety } = await import('../../electron/main/modules/shell/safety.mjs');

    const report = await analyzeShellCommandSafety(createRequest({ command: 'cd ./src && pnpm test' }));

    expect(report.status).toBe('allowed');
  });

  it('blocks output redirection outside workspace via AST check', async () => {
    const { analyzeShellCommandSafety } = await import('../../electron/main/modules/shell/safety.mjs');

    const report = await analyzeShellCommandSafety(createRequest({ command: 'ls > /tmp/output.txt' }));

    expect(report.status).toBe('blocked');
    expect(report.findings).toContainEqual(expect.objectContaining({ code: 'REDIRECT_OUTSIDE_WORKSPACE' }));
  });

  it('allows output redirection within workspace via AST check', async () => {
    const { analyzeShellCommandSafety } = await import('../../electron/main/modules/shell/safety.mjs');

    const report = await analyzeShellCommandSafety(createRequest({ command: 'ls > ./output.txt' }));

    expect(report.status).toBe('allowed');
  });

  it('allows redirect to /dev/null in bash', async () => {
    const { analyzeShellCommandSafety } = await import('../../electron/main/modules/shell/safety.mjs');

    const report = await analyzeShellCommandSafety(createRequest({ command: 'some-command > /dev/null' }));

    expect(report.status).toBe('allowed');
    expect(report.findings).not.toContainEqual(expect.objectContaining({ code: 'REDIRECT_OUTSIDE_WORKSPACE' }));
  });

  it('allows redirect stderr to /dev/null in bash', async () => {
    const { analyzeShellCommandSafety } = await import('../../electron/main/modules/shell/safety.mjs');

    const report = await analyzeShellCommandSafety(createRequest({ command: 'some-command 2>/dev/null' }));

    expect(report.status).toBe('allowed');
    expect(report.findings).not.toContainEqual(expect.objectContaining({ code: 'REDIRECT_OUTSIDE_WORKSPACE' }));
  });

  it('allows combined redirect to /dev/null in bash', async () => {
    const { analyzeShellCommandSafety } = await import('../../electron/main/modules/shell/safety.mjs');

    const report = await analyzeShellCommandSafety(createRequest({ command: 'some-command >/dev/null 2>&1' }));

    expect(report.status).toBe('allowed');
    expect(report.findings).not.toContainEqual(expect.objectContaining({ code: 'REDIRECT_OUTSIDE_WORKSPACE' }));
  });

  it('still blocks other absolute path redirects outside workspace', async () => {
    const { analyzeShellCommandSafety } = await import('../../electron/main/modules/shell/safety.mjs');

    const report = await analyzeShellCommandSafety(createRequest({ command: 'echo bad > ~/.zshrc' }));

    expect(report.status).toBe('blocked');
    expect(report.findings).toContainEqual(expect.objectContaining({ code: 'REDIRECT_OUTSIDE_WORKSPACE' }));
  });

  it('detects dangerous command inside command substitution', async () => {
    const { analyzeShellCommandSafety } = await import('../../electron/main/modules/shell/safety.mjs');

    const report = await analyzeShellCommandSafety(createRequest({ command: 'echo $(rm -rf /tmp/dangerous)' }));

    expect(report.status).toBe('blocked');
    expect(report.findings).toContainEqual(expect.objectContaining({ code: 'SUBSTITUTED_DANGEROUS_COMMAND' }));
  });

  it('blocks when parser initialization fails', async () => {
    const parserModule = await import('../../electron/main/modules/shell/parser.mjs');
    const parseSpy = vi.spyOn(parserModule, 'parseShellCommand').mockResolvedValue({
      ok: false,
      shell: 'bash',
      error: 'Tree-sitter WASM 初始化失败: native build missing'
    });

    try {
      const { analyzeShellCommandSafety } = await import('../../electron/main/modules/shell/safety.mjs');

      const report = await analyzeShellCommandSafety(createRequest({ command: 'echo hello' }));

      expect(report.status).toBe('blocked');
      expect(report.findings).toContainEqual(expect.objectContaining({ code: 'PARSER_UNAVAILABLE' }));
    } finally {
      parseSpy.mockRestore();
    }
  });
});
