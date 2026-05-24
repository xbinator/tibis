/**
 * @file safety.mts
 * @description Shell 命令安全分析器，负责输入校验、工作区约束和高风险命令拦截。
 */
import path from 'node:path';
import type { ShellCommandSafetyFinding, ShellCommandSafetyReport, ShellCommandSafetyRequest, ShellCommandShell } from './types.mjs';

/** 支持的 shell 集合。 */
const SUPPORTED_SHELLS = new Set<ShellCommandShell>(['bash', 'powershell']);

/** 高风险删除命令匹配。 */
const DESTRUCTIVE_DELETE_PATTERN =
  /\brm\s+(?:-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*|-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*)\b|\bRemove-Item\b[\s\S]*(?:-Recurse\b[\s\S]*-Force\b|-Force\b[\s\S]*-Recurse\b)/i;

/** 网络下载后直接交给 shell 执行的命令匹配。 */
const NETWORK_PIPE_TO_SHELL_PATTERN = /\b(?:curl|wget|Invoke-WebRequest|iwr)\b[\s\S]*\|[\s\S]*\b(?:bash|sh|zsh|pwsh|powershell)\b/i;

/** 可能泄露环境变量或密钥的命令匹配。 */
const ENV_DUMP_PATTERN = /(?:^|[;&|]\s*)(?:env|printenv|Get-ChildItem\s+Env:)\b/i;

/** 后台或分离进程匹配。 */
const BACKGROUND_PROCESS_PATTERN = /(?:^|[^&])&\s*$|\b(?:Start-Process)\b/i;

/**
 * 判断未知值是否为支持的 shell。
 * @param value - 待检查值
 * @returns 是否为支持的 shell
 */
function isSupportedShell(value: unknown): value is ShellCommandShell {
  return typeof value === 'string' && SUPPORTED_SHELLS.has(value as ShellCommandShell);
}

/**
 * 创建安全发现项。
 * @param code - 发现项编码
 * @param message - 发现项说明
 * @param nodeText - 触发规则的命令片段
 * @returns 安全发现项
 */
function createBlocker(code: string, message: string, nodeText?: string): ShellCommandSafetyFinding {
  return {
    severity: 'blocker',
    code,
    message,
    ...(nodeText ? { nodeText } : {})
  };
}

/**
 * 归一化路径字符串。
 * @param value - 未知输入
 * @returns 归一化路径，非法时返回空字符串
 */
function normalizePathInput(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

/**
 * 判断目标目录是否在工作区内。
 * @param targetPath - 目标目录
 * @param workspaceRoot - 工作区根目录
 * @returns 是否在工作区内
 */
function isPathInsideWorkspace(targetPath: string, workspaceRoot: string): boolean {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedRoot = path.resolve(workspaceRoot);
  const relativePath = path.relative(resolvedRoot, resolvedTarget);

  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

/**
 * 添加命令策略发现项。
 * @param command - 命令文本
 * @param findings - 待追加发现项列表
 */
function appendPolicyFindings(command: string, findings: ShellCommandSafetyFinding[]): void {
  if (DESTRUCTIVE_DELETE_PATTERN.test(command)) {
    findings.push(createBlocker('DESTRUCTIVE_DELETE', '命令包含递归强制删除操作，需要人工改写为更小范围的安全操作。', command));
  }

  if (NETWORK_PIPE_TO_SHELL_PATTERN.test(command)) {
    findings.push(createBlocker('NETWORK_PIPE_TO_SHELL', '命令将网络下载内容直接交给 shell 执行，存在供应链执行风险。', command));
  }

  if (ENV_DUMP_PATTERN.test(command)) {
    findings.push(createBlocker('ENVIRONMENT_DUMP', '命令可能输出环境变量或密钥信息。', command));
  }

  if (BACKGROUND_PROCESS_PATTERN.test(command)) {
    findings.push(createBlocker('BACKGROUND_PROCESS', '命令可能启动后台或分离进程，当前工具只支持有界前台命令。', command));
  }
}

/**
 * 分析 Shell 命令安全性。
 * @param request - 安全分析请求
 * @returns 安全分析报告
 */
export function analyzeShellCommandSafety(request: ShellCommandSafetyRequest): ShellCommandSafetyReport {
  const command = typeof request.command === 'string' ? request.command.trim() : '';
  const cwd = normalizePathInput(request.cwd);
  const workspaceRoot = normalizePathInput(request.workspaceRoot);
  const shell = isSupportedShell(request.shell) ? request.shell : 'unknown';
  const findings: ShellCommandSafetyFinding[] = [];

  if (!isSupportedShell(request.shell)) {
    findings.push(createBlocker('UNSUPPORTED_SHELL', '仅支持 bash 和 powershell 命令。'));
  }

  if (!command) {
    findings.push(createBlocker('EMPTY_COMMAND', '命令不能为空。'));
  }

  if (!workspaceRoot) {
    findings.push(createBlocker('MISSING_WORKSPACE_ROOT', '缺少工作区根目录，拒绝执行本地命令。'));
  }

  if (!cwd) {
    findings.push(createBlocker('MISSING_CWD', '缺少命令执行目录。'));
  }

  if (cwd && workspaceRoot && !isPathInsideWorkspace(cwd, workspaceRoot)) {
    findings.push(createBlocker('CWD_OUTSIDE_WORKSPACE', '命令执行目录必须位于当前工作区内。', cwd));
  }

  if (command) {
    appendPolicyFindings(command, findings);
  }

  return {
    status: findings.some((finding) => finding.severity === 'blocker') ? 'blocked' : 'allowed',
    shell,
    findings,
    normalizedCommandPreview: command,
    cwd
  };
}
