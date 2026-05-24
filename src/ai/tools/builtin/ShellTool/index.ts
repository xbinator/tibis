/**
 * @file index.ts
 * @description 内置 Shell 命令执行工具，负责安全分析、危险级确认和主进程命令执行。
 */
import type { AIToolConfirmationDecision, AIToolConfirmationRequest } from '../../confirmation';
import type { ToolRequiredConfirmationOptions, ToolWorkspaceOptions } from '../../shared/types';
import type { AIToolExecutionResult, AIToolExecutor } from 'types/ai';
import type { ElectronShellCommandRunResult, ElectronShellCommandSafetyReport, ElectronShellCommandShell } from 'types/electron-api';
import { nanoid } from 'nanoid';
import { native } from '@/shared/platform';
import { createToolCancelledResult, createToolFailureResult, createToolSuccessResult } from '../../results';

/** run_shell_command 工具名称。 */
export const RUN_SHELL_COMMAND_TOOL_NAME = 'run_shell_command';

/** 默认命令超时时间。 */
const DEFAULT_TIMEOUT_MS = 30_000;

/** 最小命令超时时间。 */
const MIN_TIMEOUT_MS = 1_000;

/** 最大命令超时时间。 */
const MAX_TIMEOUT_MS = 120_000;

/**
 * Shell 命令工具输入。
 */
export interface RunShellCommandInput {
  /** 内部命令 ID，通常来自 toolCallId。 */
  commandId?: unknown;
  /** Shell 类型。 */
  shell?: unknown;
  /** 命令文本。 */
  command?: unknown;
  /** 执行目录，默认使用工作区根目录。 */
  cwd?: unknown;
  /** 超时时间，单位毫秒。 */
  timeoutMs?: unknown;
}

/**
 * Shell 命令工具结果。
 */
export interface RunShellCommandToolResult extends ElectronShellCommandRunResult {
  /** 安全分析报告。 */
  safety: ElectronShellCommandSafetyReport;
}

/**
 * 创建 Shell 命令工具选项。
 */
export interface CreateBuiltinShellCommandToolOptions extends ToolRequiredConfirmationOptions, ToolWorkspaceOptions {}

/**
 * 判断是否为支持的 shell。
 * @param value - 待检查值
 * @returns 是否为支持的 shell
 */
function isSupportedShell(value: unknown): value is ElectronShellCommandShell {
  return value === 'bash' || value === 'powershell';
}

/**
 * 归一化命令超时时间。
 * @param timeoutMs - 原始超时时间
 * @returns 归一化超时时间
 */
function normalizeTimeoutMs(timeoutMs: unknown): number {
  if (timeoutMs === undefined) {
    return DEFAULT_TIMEOUT_MS;
  }

  if (!Number.isInteger(timeoutMs)) {
    throw new Error('timeoutMs 必须是整数');
  }

  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, timeoutMs));
}

/**
 * 判断确认结果是否批准。
 * @param decision - 确认结果
 * @returns 是否批准
 */
function isConfirmationApproved(decision: AIToolConfirmationDecision | boolean): boolean {
  if (typeof decision === 'boolean') {
    return decision;
  }

  return decision.approved;
}

/**
 * 提取安全检查失败消息。
 * @param safety - 安全分析报告
 * @returns 失败消息
 */
function formatSafetyFailureMessage(safety: ElectronShellCommandSafetyReport): string {
  const firstBlocker = safety.findings.find((finding) => finding.severity === 'blocker');
  return `Shell 命令安全检查未通过：${firstBlocker?.message ?? '命令被安全策略拦截'}`;
}

/**
 * 格式化确认描述。
 * @param shell - Shell 类型
 * @param cwd - 执行目录
 * @param timeoutMs - 超时时间
 * @param safety - 安全分析报告
 * @returns 确认描述
 */
function formatConfirmationDescription(shell: ElectronShellCommandShell, cwd: string, timeoutMs: number, safety: ElectronShellCommandSafetyReport): string {
  const findingText = safety.findings.length ? safety.findings.map((finding) => `- [${finding.severity}] ${finding.message}`).join('\n') : '- 未发现阻断项';

  return [`AI 请求执行 Shell 命令。`, `Shell: ${shell}`, `CWD: ${cwd}`, `Timeout: ${timeoutMs}ms`, `安全检查:`, findingText].join('\n');
}

/**
 * 执行带确认生命周期的命令。
 * @param options - 工具创建选项
 * @param request - 确认请求
 * @param operation - 实际执行函数
 * @returns 工具执行结果
 */
async function executeConfirmedShellCommand(
  options: CreateBuiltinShellCommandToolOptions,
  request: AIToolConfirmationRequest,
  operation: () => Promise<RunShellCommandToolResult>
): Promise<AIToolExecutionResult<RunShellCommandToolResult>> {
  await options.confirm.onExecutionStart?.(request);

  try {
    const data = await operation();
    await options.confirm.onExecutionComplete?.(request, { status: 'success' });
    return createToolSuccessResult(RUN_SHELL_COMMAND_TOOL_NAME, data);
  } catch (error) {
    const message = error instanceof Error ? error.message : '执行 Shell 命令失败';
    await options.confirm.onExecutionComplete?.(request, { status: 'failure', errorMessage: message });
    return createToolFailureResult(RUN_SHELL_COMMAND_TOOL_NAME, 'EXECUTION_FAILED', message);
  }
}

/**
 * 创建内置 Shell 命令执行工具。
 * @param options - 工具创建选项
 * @returns Shell 命令工具执行器
 */
export function createBuiltinShellCommandTool(options: CreateBuiltinShellCommandToolOptions): AIToolExecutor<RunShellCommandInput, RunShellCommandToolResult> {
  return {
    definition: {
      name: RUN_SHELL_COMMAND_TOOL_NAME,
      description: '在当前工作区内执行一条 bash 或 PowerShell 命令。命令会先经过安全检查，再由用户确认后执行；适合运行测试、构建、lint 和短脚本。',
      source: 'builtin',
      riskLevel: 'dangerous',
      requiresActiveDocument: false,
      permissionCategory: 'system',
      safeAutoApprove: false,
      parameters: {
        type: 'object',
        properties: {
          shell: { type: 'string', enum: ['bash', 'powershell'], description: '命令使用的 shell。' },
          command: { type: 'string', description: '要执行的命令文本。' },
          cwd: { type: 'string', description: '可选执行目录，必须位于当前工作区内；默认工作区根目录。' },
          timeoutMs: { type: 'number', description: '可选超时时间，默认 30000ms，范围 1000-120000ms。' }
        },
        required: ['shell', 'command'],
        additionalProperties: false
      }
    },
    async execute(input: RunShellCommandInput) {
      if (!isSupportedShell(input.shell)) {
        return createToolFailureResult(RUN_SHELL_COMMAND_TOOL_NAME, 'INVALID_INPUT', 'shell 仅支持 bash 或 powershell');
      }

      const command = typeof input.command === 'string' ? input.command.trim() : '';
      if (!command) {
        return createToolFailureResult(RUN_SHELL_COMMAND_TOOL_NAME, 'INVALID_INPUT', '命令不能为空');
      }

      const workspaceRoot = options.getWorkspaceRoot?.() ?? null;
      if (!workspaceRoot) {
        return createToolFailureResult(RUN_SHELL_COMMAND_TOOL_NAME, 'PERMISSION_DENIED', '缺少工作区根目录，拒绝执行 Shell 命令');
      }

      let timeoutMs: number;
      try {
        timeoutMs = normalizeTimeoutMs(input.timeoutMs);
      } catch (error) {
        return createToolFailureResult(RUN_SHELL_COMMAND_TOOL_NAME, 'INVALID_INPUT', error instanceof Error ? error.message : 'timeoutMs 参数无效');
      }

      const cwd = typeof input.cwd === 'string' && input.cwd.trim().length > 0 ? input.cwd.trim() : workspaceRoot;
      const safety = await native.analyzeShellCommand({
        shell: input.shell,
        command,
        cwd,
        workspaceRoot
      });

      if (safety.status === 'blocked') {
        return createToolFailureResult(RUN_SHELL_COMMAND_TOOL_NAME, 'PERMISSION_DENIED', formatSafetyFailureMessage(safety));
      }

      const confirmationRequest: AIToolConfirmationRequest = {
        toolName: RUN_SHELL_COMMAND_TOOL_NAME,
        title: 'AI 想要执行 Shell 命令',
        description: formatConfirmationDescription(input.shell, cwd, timeoutMs, safety),
        riskLevel: 'dangerous',
        allowRemember: false,
        beforeText: safety.normalizedCommandPreview
      };
      const decision = await options.confirm.confirm(confirmationRequest);
      if (!isConfirmationApproved(decision)) {
        return createToolCancelledResult(RUN_SHELL_COMMAND_TOOL_NAME);
      }

      return executeConfirmedShellCommand(options, confirmationRequest, async () => {
        const runResult = await native.runShellCommand({
          commandId: typeof input.commandId === 'string' && input.commandId.trim().length > 0 ? input.commandId.trim() : nanoid(),
          shell: input.shell as ElectronShellCommandShell,
          command,
          cwd,
          workspaceRoot,
          timeoutMs
        });

        return {
          ...runResult,
          safety
        };
      });
    }
  };
}
