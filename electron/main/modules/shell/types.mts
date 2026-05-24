/**
 * @file types.mts
 * @description Shell 命令安全分析、运行请求与输出事件的共享类型。
 */

/** Shell 命令工具支持的 shell 类型。 */
export type ShellCommandShell = 'bash' | 'powershell';

/** Shell 命令安全分析状态。 */
export type ShellCommandSafetyStatus = 'allowed' | 'blocked';

/** Shell 命令安全发现项严重级别。 */
export type ShellCommandSafetySeverity = 'info' | 'warning' | 'blocker';

/**
 * Shell 命令安全分析请求。
 */
export interface ShellCommandSafetyRequest {
  /** 待执行 shell。 */
  shell?: unknown;
  /** 待执行命令文本。 */
  command?: unknown;
  /** 命令工作目录。 */
  cwd?: unknown;
  /** 当前工作区根目录。 */
  workspaceRoot?: unknown;
}

/**
 * Shell 命令安全分析发现项。
 */
export interface ShellCommandSafetyFinding {
  /** 发现项严重级别。 */
  severity: ShellCommandSafetySeverity;
  /** 机器可读错误码。 */
  code: string;
  /** 面向用户的说明。 */
  message: string;
  /** 触发规则的命令片段。 */
  nodeText?: string;
}

/**
 * Shell 命令安全分析报告。
 */
export interface ShellCommandSafetyReport {
  /** 安全分析状态。 */
  status: ShellCommandSafetyStatus;
  /** 分析的 shell 类型，无法识别时为 unknown。 */
  shell: ShellCommandShell | 'unknown';
  /** 安全发现项列表。 */
  findings: ShellCommandSafetyFinding[];
  /** 归一化后的命令预览。 */
  normalizedCommandPreview: string;
  /** 归一化后的执行目录。 */
  cwd: string;
}

/**
 * Shell 命令执行请求。
 */
export interface ShellCommandRunRequest {
  /** 命令唯一标识。 */
  commandId: string;
  /** 执行 shell。 */
  shell: ShellCommandShell;
  /** 命令文本。 */
  command: string;
  /** 命令执行目录。 */
  cwd: string;
  /** 当前工作区根目录。 */
  workspaceRoot: string;
  /** 进程超时时间，单位毫秒。 */
  timeoutMs: number;
  /** 最终结果中每个输出流的最大字符数。 */
  maxOutputChars?: number;
}

/**
 * Shell 命令实时输出片段。
 */
export interface ShellCommandOutputChunk {
  /** 命令唯一标识。 */
  commandId: string;
  /** 输出流类型。 */
  stream: 'stdout' | 'stderr';
  /** 输出文本。 */
  text: string;
  /** 单命令递增序号。 */
  sequence: number;
  /** 输出产生时间。 */
  createdAt: string;
}

/**
 * Shell 命令执行结果。
 */
export interface ShellCommandRunResult {
  /** 命令唯一标识。 */
  commandId: string;
  /** 执行 shell。 */
  shell: ShellCommandShell;
  /** 命令文本。 */
  command: string;
  /** 命令执行目录。 */
  cwd: string;
  /** 退出码，信号退出时为 null。 */
  exitCode: number | null;
  /** 退出信号，正常退出时为 null。 */
  signal: string | null;
  /** 执行耗时。 */
  durationMs: number;
  /** 是否因超时结束。 */
  timedOut: boolean;
  /** 截断后的 stdout。 */
  stdout: string;
  /** 截断后的 stderr。 */
  stderr: string;
  /** 输出是否被截断。 */
  truncated: boolean;
}
