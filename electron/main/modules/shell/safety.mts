/**
 * @file safety.mts
 * @description Shell 命令安全分析器，负责输入校验、工作区约束、高风险命令拦截和 AST 结构检查。
 */
import path from 'node:path';
import type { ShellCommandSafetyFinding, ShellCommandSafetyReport, ShellCommandSafetyRequest, ShellCommandShell } from './types.mjs';
import { parseShellCommand } from './parser.mjs';

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

/** 权限或所有权变更匹配，阻止递归开放权限和变更文件所有者。 */
const PERMISSION_MUTATION_PATTERN = /\bchmod\s+(?:-[a-zA-Z]*[Rr][a-zA-Z]*\s*)?(?:777|a\+rwx|ugo\+rwx)\b|\bchown\b|\bicacls\b|\bSet-Acl\b/i;

/** Shell 配置文件写入匹配，阻止覆盖或追加到 shell profile。 */
const SHELL_PROFILE_PATTERN =
  /[>>>]\s*(?:~\/(?:\.bashrc|\.bash_profile|\.profile|\.zshrc|\.zshenv)|\$profile\b|\$PROFILE\b|\$HOME\/\.(?:bashrc|bash_profile|profile|zshrc|zshenv))/i;

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
 * @param severity - 严重级别
 * @param code - 发现项编码
 * @param message - 发现项说明
 * @param nodeText - 触发规则的命令片段
 * @returns 安全发现项
 */
function createFinding(severity: ShellCommandSafetyFinding['severity'], code: string, message: string, nodeText?: string): ShellCommandSafetyFinding {
  return { severity, code, message, ...(nodeText ? { nodeText } : {}) };
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
 * 添加命令策略发现项（regex 模式匹配）。
 * @param command - 命令文本
 * @param findings - 待追加发现项列表
 */
function appendPolicyFindings(command: string, findings: ShellCommandSafetyFinding[]): void {
  if (DESTRUCTIVE_DELETE_PATTERN.test(command)) {
    findings.push(createFinding('blocker', 'DESTRUCTIVE_DELETE', '命令包含递归强制删除操作，需要人工改写为更小范围的安全操作。', command));
  }

  if (NETWORK_PIPE_TO_SHELL_PATTERN.test(command)) {
    findings.push(createFinding('blocker', 'NETWORK_PIPE_TO_SHELL', '命令将网络下载内容直接交给 shell 执行，存在供应链执行风险。', command));
  }

  if (ENV_DUMP_PATTERN.test(command)) {
    findings.push(createFinding('blocker', 'ENVIRONMENT_DUMP', '命令可能输出环境变量或密钥信息。', command));
  }

  if (BACKGROUND_PROCESS_PATTERN.test(command)) {
    findings.push(createFinding('blocker', 'BACKGROUND_PROCESS', '命令可能启动后台或分离进程，当前工具只支持有界前台命令。', command));
  }

  if (PERMISSION_MUTATION_PATTERN.test(command)) {
    findings.push(
      createFinding('blocker', 'PERMISSION_MUTATION', '命令包含权限或所有权变更操作（chmod 777 / chown / icacls / Set-Acl），需要人工审核。', command)
    );
  }

  if (SHELL_PROFILE_PATTERN.test(command)) {
    findings.push(createFinding('blocker', 'SHELL_PROFILE_MUTATION', '命令尝试写入 Shell 配置文件，可能持久化恶意行为。', command));
  }
}

/**
 * 从 AST 节点提取字面量字符串值。
 * 如果节点包含变量扩展或命令替换，返回 null（无法静态解析）。
 * @param node - AST 节点
 * @returns 字面量字符串，或 null
 */
function extractLiteralPath(node: import('web-tree-sitter').Node): string | null {
  // 检查是否包含无法静态解析的结构
  const hasExpansion =
    node.descendantsOfType(['expansion', 'simple_expansion', 'command_substitution', 'variable_name', 'sub_expression', 'braced_variable']).length > 0;
  if (hasExpansion) {
    return null;
  }

  const text = node.text.trim();
  // 去除引号
  if ((text.startsWith("'") && text.endsWith("'")) || (text.startsWith('"') && text.endsWith('"'))) {
    return text.slice(1, -1);
  }
  return text;
}

/**
 * 解析目标路径相对于执行目录的实际路径。
 * @param rawPath - 原始路径字符串
 * @param cwd - 命令执行目录
 * @returns 解析后的绝对路径，或 null（路径包含变量无法解析）
 */
function resolveTargetPath(rawPath: string | null, cwd: string): string | null {
  if (!rawPath) return null;
  // 展开 ~ 为用户主目录
  if (rawPath.startsWith('~/')) {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    if (!home) return null;
    return path.resolve(home, rawPath.slice(2));
  }
  return path.resolve(cwd, rawPath);
}

/**
 * Bash 安全重定向目标白名单。
 * /dev/null 是 Unix 空设备，丢弃输出，不构成文件写入风险。
 */
const BASH_SAFE_REDIRECT_TARGETS = new Set(['/dev/null']);

/**
 * PowerShell 安全重定向目标白名单。
 * $null 和 Out-Null 是 PowerShell 丢弃输出的方式。
 */
const POWERSHELL_SAFE_REDIRECT_TARGETS = new Set(['$null', 'out-null']);

/**
 * 判断重定向目标是否为安全例外（如 /dev/null、$null）。
 * @param rawPath - 原始路径字符串
 * @param shell - Shell 类型
 * @returns 是否为安全重定向目标
 */
function isSafeRedirectTarget(rawPath: string, shell: ShellCommandShell): boolean {
  const normalized = rawPath.toLowerCase().trim();
  if (shell === 'bash') {
    return BASH_SAFE_REDIRECT_TARGETS.has(normalized);
  }
  if (shell === 'powershell') {
    return POWERSHELL_SAFE_REDIRECT_TARGETS.has(normalized);
  }
  return false;
}

/** AST 结构检查的公共参数。 */
interface StructuralCheckOptions {
  /** 命令文本 */
  command: string;
  /** 执行目录 */
  cwd: string;
  /** 工作区根目录 */
  workspaceRoot: string;
  /** AST 根节点 */
  rootNode: import('web-tree-sitter').Node;
  /** 待追加发现项列表 */
  findings: ShellCommandSafetyFinding[];
}

/**
 * Bash AST 结构检查。
 * @param options - 结构检查参数
 */
function appendBashStructuralFindings(options: StructuralCheckOptions): void {
  const { cwd, workspaceRoot, rootNode, findings } = options;
  // 收集所有 command 节点，检查 cd 到 workspace 外
  const commands = rootNode.descendantsOfType('command');
  for (const cmd of commands) {
    const nameNode = cmd.child(0);
    if (!nameNode || nameNode.type !== 'command_name') continue;
    const cmdName = nameNode.text.trim();

    // 检查 cd / builtin cd
    if (cmdName === 'cd' || cmdName === 'builtin') {
      // 对于 builtin，第二个 child 是子命令名
      const effectiveName = cmdName === 'builtin' ? cmd.child(1)?.text.trim() : cmdName;
      if (effectiveName !== 'cd') continue;

      // 找到路径参数（跳过 command_name 和可能的 builtin）
      const argNode = cmdName === 'builtin' ? cmd.child(2) : cmd.child(1);
      if (!argNode) continue;

      const rawPath = extractLiteralPath(argNode);
      if (rawPath === null) {
        // 包含变量，无法静态分析
        findings.push(
          createFinding('warning', 'CD_DYNAMIC_PATH', '命令中 cd 的目标路径包含变量或扩展，无法静态验证是否在工作区内。', argNode.text.slice(0, 80))
        );
        continue;
      }

      const resolvedTarget = resolveTargetPath(rawPath, cwd);
      if (resolvedTarget && !isPathInsideWorkspace(resolvedTarget, workspaceRoot)) {
        findings.push(createFinding('blocker', 'CD_OUTSIDE_WORKSPACE', `cd 目标目录位于工作区外: ${rawPath}`, argNode.text.slice(0, 80)));
      }
    }
  }

  // 检查文件重定向目标是否在工作区外
  const redirects = rootNode.descendantsOfType('file_redirect');
  for (const redir of redirects) {
    // file_redirect 的子节点包含文件路径（word 节点）
    const wordNodes = redir.descendantsOfType('word');
    if (wordNodes.length === 0) continue;

    // 最后一个 word 通常是文件路径
    const fileNode = wordNodes[wordNodes.length - 1];
    const rawPath = extractLiteralPath(fileNode);
    if (rawPath === null) continue;

    // 放行安全重定向目标（如 /dev/null）
    if (isSafeRedirectTarget(rawPath, 'bash')) continue;

    const resolvedTarget = resolveTargetPath(rawPath, cwd);
    if (resolvedTarget && !isPathInsideWorkspace(resolvedTarget, workspaceRoot)) {
      findings.push(createFinding('blocker', 'REDIRECT_OUTSIDE_WORKSPACE', `输出重定向目标位于工作区外: ${rawPath}`, fileNode.text.slice(0, 80)));
    }
  }

  // 检查命令替换中是否嵌套了危险命令
  const substitutions = rootNode.descendantsOfType('command_substitution');
  for (const sub of substitutions) {
    const innerCommands = sub.descendantsOfType('command');
    for (const innerCmd of innerCommands) {
      const innerCmdText = innerCmd.text;
      if (DESTRUCTIVE_DELETE_PATTERN.test(innerCmdText)) {
        findings.push(createFinding('blocker', 'SUBSTITUTED_DANGEROUS_COMMAND', '命令替换中包含危险删除操作。', innerCmdText.slice(0, 80)));
      }
      if (NETWORK_PIPE_TO_SHELL_PATTERN.test(innerCmdText)) {
        findings.push(createFinding('blocker', 'SUBSTITUTED_NETWORK_PIPE', '命令替换中包含网络下载管道到 shell 执行。', innerCmdText.slice(0, 80)));
      }
    }
  }
}

/**
 * PowerShell AST 结构检查。
 * @param options - 结构检查参数
 */
function appendPowerShellStructuralFindings(options: StructuralCheckOptions): void {
  const { cwd, workspaceRoot, rootNode, findings } = options;
  // 收集所有 command_name_expr 节点，检查 cd / Set-Location 到 workspace 外
  const commandNames = rootNode.descendantsOfType('command_name_expr');
  for (const nameNode of commandNames) {
    const cmdName = nameNode.text.trim().toLowerCase();

    if (cmdName === 'cd' || cmdName === 'sl' || cmdName === 'set-location' || cmdName === 'chdir') {
      // 找到父级的 command_elements 或 argument_list
      const { parent } = nameNode;
      if (!parent) continue;

      // 在父节点中查找参数（排除当前 node）
      const args = parent.children.filter((c) => c.id !== nameNode.id && c.type !== 'command_argument_sep');
      const pathArg = args[0];
      if (!pathArg) continue;

      const rawPath = extractLiteralPath(pathArg);
      if (rawPath === null) {
        findings.push(
          createFinding(
            'warning',
            'CD_DYNAMIC_PATH',
            '命令中 cd/Set-Location 的目标路径包含变量或扩展，无法静态验证是否在工作区内。',
            pathArg.text.slice(0, 80)
          )
        );
        continue;
      }

      const resolvedTarget = resolveTargetPath(rawPath, cwd);
      if (resolvedTarget && !isPathInsideWorkspace(resolvedTarget, workspaceRoot)) {
        findings.push(createFinding('blocker', 'CD_OUTSIDE_WORKSPACE', `cd/Set-Location 目标目录位于工作区外: ${rawPath}`, pathArg.text.slice(0, 80)));
      }
    }
  }

  // 检查重定向目标是否在工作区外
  const redirections = rootNode.descendantsOfType('redirection');
  for (const redir of redirections) {
    const fileNodes = redir.descendantsOfType('redirected_file_name');
    for (const fileNode of fileNodes) {
      const rawPath = extractLiteralPath(fileNode);
      if (rawPath === null) continue;

      // 放行安全重定向目标（如 $null）
      if (isSafeRedirectTarget(rawPath, 'powershell')) continue;

      const resolvedTarget = resolveTargetPath(rawPath, cwd);
      if (resolvedTarget && !isPathInsideWorkspace(resolvedTarget, workspaceRoot)) {
        findings.push(createFinding('blocker', 'REDIRECT_OUTSIDE_WORKSPACE', `输出重定向目标位于工作区外: ${rawPath}`, fileNode.text.slice(0, 80)));
      }
    }
  }

  // 检查子表达式中的危险命令
  const subExpressions = rootNode.descendantsOfType('sub_expression');
  for (const sub of subExpressions) {
    const innerText = sub.text;
    if (DESTRUCTIVE_DELETE_PATTERN.test(innerText)) {
      findings.push(createFinding('blocker', 'SUBSTITUTED_DANGEROUS_COMMAND', '子表达式中包含危险删除操作。', innerText.slice(0, 80)));
    }
    if (NETWORK_PIPE_TO_SHELL_PATTERN.test(innerText)) {
      findings.push(createFinding('blocker', 'SUBSTITUTED_NETWORK_PIPE', '子表达式中包含网络下载管道到 shell 执行。', innerText.slice(0, 80)));
    }
  }
}

/**
 * 添加基于 AST 的结构化安全检查。
 * @param options - 结构检查参数
 * @param shell - shell 类型
 */
function appendStructuralFindings(options: StructuralCheckOptions, shell: ShellCommandShell): void {
  if (shell === 'bash') {
    appendBashStructuralFindings(options);
  } else {
    appendPowerShellStructuralFindings(options);
  }
}

/**
 * 分析 Shell 命令安全性。
 * @param request - 安全分析请求
 * @returns 安全分析报告
 */
export async function analyzeShellCommandSafety(request: ShellCommandSafetyRequest): Promise<ShellCommandSafetyReport> {
  const command = typeof request.command === 'string' ? request.command.trim() : '';
  const cwd = normalizePathInput(request.cwd);
  const workspaceRoot = normalizePathInput(request.workspaceRoot);
  const shell = isSupportedShell(request.shell) ? request.shell : 'unknown';
  const findings: ShellCommandSafetyFinding[] = [];

  if (!isSupportedShell(request.shell)) {
    findings.push(createFinding('blocker', 'UNSUPPORTED_SHELL', '仅支持 bash 和 powershell 命令。'));
  }

  if (!command) {
    findings.push(createFinding('blocker', 'EMPTY_COMMAND', '命令不能为空。'));
  }

  if (!workspaceRoot) {
    findings.push(createFinding('blocker', 'MISSING_WORKSPACE_ROOT', '缺少工作区根目录，拒绝执行本地命令。'));
  }

  if (!cwd) {
    findings.push(createFinding('blocker', 'MISSING_CWD', '缺少命令执行目录。'));
  }

  if (cwd && workspaceRoot && !isPathInsideWorkspace(cwd, workspaceRoot)) {
    findings.push(createFinding('blocker', 'CWD_OUTSIDE_WORKSPACE', '命令执行目录必须位于当前工作区内。', cwd));
  }

  // AST 结构检查（语法错误会阻塞，初始化失败同样阻塞）
  if (command && isSupportedShell(request.shell) && cwd && workspaceRoot) {
    const parseResult = await parseShellCommand(command, request.shell as ShellCommandShell);

    if (parseResult.ok && parseResult.rootNode) {
      appendStructuralFindings({ command, cwd, workspaceRoot, rootNode: parseResult.rootNode, findings }, request.shell as ShellCommandShell);
    } else if (parseResult.error) {
      if (parseResult.error.includes('初始化失败')) {
        // 解析器不可用时阻塞执行，避免仅靠 regex 遗漏结构性风险
        findings.push(createFinding('blocker', 'PARSER_UNAVAILABLE', '命令解析器初始化失败，无法进行 AST 结构检查，拒绝执行。'));
      } else {
        // 语法错误阻塞执行
        findings.push(createFinding('blocker', 'SYNTAX_ERROR', `命令语法错误: ${parseResult.error}`));
      }
    }
  }

  // Regex 策略检查（作为 AST 检查的补充和降级兜底）
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
