/**
 * @file builtin-shell.test.ts
 * @description 验证内置 Shell 命令工具的安全分析、确认和执行结果处理。
 */
/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIToolConfirmationAdapter } from '@/ai/tools/confirmation';
import type {
  ElectronShellCommandRunRequest,
  ElectronShellCommandRunResult,
  ElectronShellCommandSafetyReport,
  ElectronShellCommandSafetyRequest
} from 'types/electron-api';

/** native mock。 */
const nativeMock = vi.hoisted(() => ({
  analyzeShellCommand: vi.fn<[ElectronShellCommandSafetyRequest], Promise<ElectronShellCommandSafetyReport>>(),
  runShellCommand: vi.fn<[ElectronShellCommandRunRequest], Promise<ElectronShellCommandRunResult>>(),
  cancelShellCommand: vi.fn<[string], Promise<boolean>>(),
  onShellCommandOutput: vi.fn()
}));

vi.mock('@/shared/platform', () => ({
  native: nativeMock
}));

/**
 * 创建允许执行的安全报告。
 * @returns 安全报告
 */
function createAllowedReport(): ElectronShellCommandSafetyReport {
  return {
    status: 'allowed',
    shell: 'bash',
    findings: [],
    normalizedCommandPreview: 'pnpm test',
    cwd: '/workspace'
  };
}

/**
 * 创建命令执行结果。
 * @param exitCode - 退出码
 * @returns 命令执行结果
 */
function createRunResult(exitCode = 0): ElectronShellCommandRunResult {
  return {
    commandId: 'cmd-1',
    shell: 'bash',
    command: 'pnpm test',
    cwd: '/workspace',
    exitCode,
    signal: null,
    durationMs: 12,
    timedOut: false,
    stdout: 'ok\n',
    stderr: exitCode === 0 ? '' : 'failed\n',
    truncated: false
  };
}

/**
 * 创建确认适配器。
 * @param approved - 是否批准
 * @returns 确认适配器和 mock
 */
function createConfirmationAdapter(approved: boolean): { adapter: AIToolConfirmationAdapter; confirmMock: ReturnType<typeof vi.fn> } {
  const confirmMock = vi.fn(async () => approved);

  return {
    adapter: {
      confirm: confirmMock
    },
    confirmMock
  };
}

describe('createBuiltinShellCommandTool', () => {
  beforeEach(() => {
    vi.resetModules();
    nativeMock.analyzeShellCommand.mockReset();
    nativeMock.runShellCommand.mockReset();
    nativeMock.cancelShellCommand.mockReset();
    nativeMock.onShellCommandOutput.mockReset();
  });

  it('rejects invalid shell input before safety analysis', async () => {
    const { createBuiltinShellCommandTool, RUN_SHELL_COMMAND_TOOL_NAME } = await import('@/ai/tools/builtin/ShellTool');
    const { adapter } = createConfirmationAdapter(true);
    const tool = createBuiltinShellCommandTool({ confirm: adapter, getWorkspaceRoot: () => '/workspace' });

    const result = await tool.execute({ shell: 'fish', command: 'echo hi' });

    expect(result).toEqual({
      toolName: RUN_SHELL_COMMAND_TOOL_NAME,
      status: 'failure',
      error: {
        code: 'INVALID_INPUT',
        message: 'shell 仅支持 bash 或 powershell'
      }
    });
    expect(nativeMock.analyzeShellCommand).not.toHaveBeenCalled();
  });

  it('rejects execution without a workspace root', async () => {
    const { createBuiltinShellCommandTool, RUN_SHELL_COMMAND_TOOL_NAME } = await import('@/ai/tools/builtin/ShellTool');
    const { adapter } = createConfirmationAdapter(true);
    const tool = createBuiltinShellCommandTool({ confirm: adapter, getWorkspaceRoot: () => null });

    const result = await tool.execute({ shell: 'bash', command: 'pnpm test' });

    expect(result).toEqual({
      toolName: RUN_SHELL_COMMAND_TOOL_NAME,
      status: 'failure',
      error: {
        code: 'PERMISSION_DENIED',
        message: '缺少工作区根目录，拒绝执行 Shell 命令'
      }
    });
  });

  it('returns permission failure when safety analysis blocks the command', async () => {
    const { createBuiltinShellCommandTool, RUN_SHELL_COMMAND_TOOL_NAME } = await import('@/ai/tools/builtin/ShellTool');
    const { adapter, confirmMock } = createConfirmationAdapter(true);
    const tool = createBuiltinShellCommandTool({ confirm: adapter, getWorkspaceRoot: () => '/workspace' });
    nativeMock.analyzeShellCommand.mockResolvedValue({
      status: 'blocked',
      shell: 'bash',
      cwd: '/workspace',
      normalizedCommandPreview: 'rm -rf .',
      findings: [{ severity: 'blocker', code: 'DESTRUCTIVE_DELETE', message: 'blocked' }]
    });

    const result = await tool.execute({ shell: 'bash', command: 'rm -rf .' });

    expect(result).toEqual({
      toolName: RUN_SHELL_COMMAND_TOOL_NAME,
      status: 'failure',
      error: {
        code: 'PERMISSION_DENIED',
        message: 'Shell 命令安全检查未通过：blocked'
      }
    });
    expect(confirmMock).not.toHaveBeenCalled();
    expect(nativeMock.runShellCommand).not.toHaveBeenCalled();
  });

  it('returns cancelled when the user denies confirmation', async () => {
    const { createBuiltinShellCommandTool, RUN_SHELL_COMMAND_TOOL_NAME } = await import('@/ai/tools/builtin/ShellTool');
    const { adapter } = createConfirmationAdapter(false);
    const tool = createBuiltinShellCommandTool({ confirm: adapter, getWorkspaceRoot: () => '/workspace' });
    nativeMock.analyzeShellCommand.mockResolvedValue(createAllowedReport());

    const result = await tool.execute({ shell: 'bash', command: 'pnpm test' });

    expect(result).toEqual({
      toolName: RUN_SHELL_COMMAND_TOOL_NAME,
      status: 'cancelled',
      error: {
        code: 'USER_CANCELLED',
        message: '用户取消了工具调用'
      }
    });
    expect(nativeMock.runShellCommand).not.toHaveBeenCalled();
  });

  it('runs an allowed command after dangerous confirmation', async () => {
    const { createBuiltinShellCommandTool, RUN_SHELL_COMMAND_TOOL_NAME } = await import('@/ai/tools/builtin/ShellTool');
    const { adapter, confirmMock } = createConfirmationAdapter(true);
    const tool = createBuiltinShellCommandTool({ confirm: adapter, getWorkspaceRoot: () => '/workspace' });
    nativeMock.analyzeShellCommand.mockResolvedValue(createAllowedReport());
    nativeMock.runShellCommand.mockResolvedValue(createRunResult());

    const result = await tool.execute({ shell: 'bash', command: 'pnpm test' });

    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: RUN_SHELL_COMMAND_TOOL_NAME,
        riskLevel: 'dangerous',
        allowRemember: false
      })
    );
    expect(nativeMock.runShellCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        shell: 'bash',
        command: 'pnpm test',
        cwd: '/workspace',
        workspaceRoot: '/workspace',
        timeoutMs: 30000
      })
    );
    expect(result).toEqual({
      toolName: RUN_SHELL_COMMAND_TOOL_NAME,
      status: 'success',
      data: {
        ...createRunResult(),
        safety: createAllowedReport()
      }
    });
  });

  it('treats non-zero exit as an executed result', async () => {
    const { createBuiltinShellCommandTool } = await import('@/ai/tools/builtin/ShellTool');
    const { adapter } = createConfirmationAdapter(true);
    const tool = createBuiltinShellCommandTool({ confirm: adapter, getWorkspaceRoot: () => '/workspace' });
    nativeMock.analyzeShellCommand.mockResolvedValue(createAllowedReport());
    nativeMock.runShellCommand.mockResolvedValue(createRunResult(2));

    const result = await tool.execute({ shell: 'bash', command: 'pnpm test' });

    expect(result.status).toBe('success');
    expect(result.status === 'success' ? result.data.exitCode : null).toBe(2);
    expect(result.status === 'success' ? result.data.stderr : '').toBe('failed\n');
  });

  it('returns TOOL_TIMEOUT failure when command times out', async () => {
    const { createBuiltinShellCommandTool, RUN_SHELL_COMMAND_TOOL_NAME } = await import('@/ai/tools/builtin/ShellTool');
    const { adapter } = createConfirmationAdapter(true);
    const tool = createBuiltinShellCommandTool({ confirm: adapter, getWorkspaceRoot: () => '/workspace' });
    nativeMock.analyzeShellCommand.mockResolvedValue(createAllowedReport());
    nativeMock.runShellCommand.mockResolvedValue({
      ...createRunResult(),
      timedOut: true,
      durationMs: 30001,
      stdout: 'partial output\n',
      stderr: '',
      truncated: true
    });

    const result = await tool.execute({ shell: 'bash', command: 'sleep 60', timeoutMs: 1000 });

    expect(result.status).toBe('failure');
    expect(result.status === 'failure' ? result.error.code : '').toBe('TOOL_TIMEOUT');
    expect(result.status === 'failure' ? result.error.message : '').toContain('30001ms');
    expect(result.status === 'failure' ? result.error.message : '').toContain('partial output');
  });
});
