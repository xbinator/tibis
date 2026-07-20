/**
 * @file termination.mts
 * @description PTY 平台进程树发现、存活判断与终止原语，宽限期编排由 runner 负责。
 */
import { spawnSync } from 'node:child_process';
import type { PtyProcess } from './pty-process.mjs';

/** 终止策略所需的最小 PTY 端口。 */
export type TerminablePty = Pick<PtyProcess, 'pid' | 'write' | 'kill'>;

/** 可发送给系统进程 API 的信号。 */
type ProcessSignal = NodeJS.Signals | 0;

/** 可注入的系统进程树操作。 */
export interface ProcessTreeOperations {
  /** 向 PID 或负进程组 PID 发送信号。 */
  killSystemProcess(pid: number, signal: ProcessSignal): void;
  /** 列出 root PID 的全部后代。 */
  listDescendants(pid: number): number[];
  /** 运行 Windows taskkill tree 命令。 */
  runTaskkill(pid: number, force: boolean): boolean;
}

/** 平台相关 PTY 进程树终止策略。 */
export interface PtyTerminationStrategy {
  /** 捕获当前可见的全部后代，供 leader 退出后继续清理。 */
  trackTree(process: TerminablePty): void;
  /** 捕获后代并请求应用优雅中断。 */
  interruptTree(process: TerminablePty): void;
  /** 终止已捕获的完整进程树。 */
  terminateTree(process: TerminablePty): void;
  /** 强制终止已捕获的完整进程树。 */
  forceTree(process: TerminablePty): void;
  /** 判断已捕获进程树是否仍有成员存活。 */
  isTreeAlive(process: TerminablePty): boolean;
  /** 释放单次命令保存的进程树快照。 */
  releaseTree(process: TerminablePty): void;
}

/** 单个 PTY leader 的进程树跟踪状态。 */
interface CapturedProcessTree {
  /** 运行期间累计观察到的后代。 */
  descendants: Set<number>;
  /** 进程表读取是否曾失败，失败时必须保守地判定清理未验证。 */
  inspectionFailed: boolean;
}

/**
 * 从 PID/PPID 文本表解析 root PID 的全部后代。
 * @param output - 每行包含 PID 和 PPID 的文本
 * @param rootPid - PTY 会话 leader PID
 * @returns 由父到子的后代 PID 列表
 */
function parseDescendants(output: string, rootPid: number): number[] {
  const childrenByParent = new Map<number, number[]>();
  for (const line of output.split('\n')) {
    const match = line.trim().match(/^(\d+)\s+(\d+)$/);
    if (!match) continue;
    const pid = Number(match[1]);
    const parentPid = Number(match[2]);
    const children = childrenByParent.get(parentPid) ?? [];
    children.push(pid);
    childrenByParent.set(parentPid, children);
  }

  const descendants: number[] = [];
  const pending = [...(childrenByParent.get(rootPid) ?? [])];
  while (pending.length > 0) {
    const pid = pending.shift();
    if (pid === undefined || descendants.includes(pid)) continue;
    descendants.push(pid);
    pending.push(...(childrenByParent.get(pid) ?? []));
  }
  return descendants;
}

/**
 * 从 ps 输出解析 root PID 的全部后代。
 * @param rootPid - PTY 会话 leader PID
 * @returns 由父到子的后代 PID 列表
 */
function listUnixDescendants(rootPid: number): number[] {
  const result = spawnSync('ps', ['-axo', 'pid=,ppid='], { encoding: 'utf8', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0 || typeof result.stdout !== 'string') throw new Error('无法读取 Unix 进程表');
  return parseDescendants(result.stdout, rootPid);
}

/**
 * 从 Windows CIM 进程表读取 root PID 的全部后代。
 * @param rootPid - PTY 会话 leader PID
 * @returns 由父到子的后代 PID 列表
 */
function listWindowsDescendants(rootPid: number): number[] {
  const script = "Get-CimInstance Win32_Process | ForEach-Object { Write-Output ($_.ProcessId.ToString() + ' ' + $_.ParentProcessId.ToString()) }";
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0 || typeof result.stdout !== 'string') throw new Error('无法读取 Windows 进程表');
  return parseDescendants(result.stdout, rootPid);
}

/**
 * 执行 Windows taskkill 进程树终止。
 * @param pid - 根进程 PID
 * @param force - 是否强制终止
 * @returns taskkill 是否成功
 */
function runWindowsTaskkill(pid: number, force: boolean): boolean {
  const args = ['/PID', String(pid), '/T'];
  if (force) args.push('/F');
  const result = spawnSync('taskkill.exe', args, { stdio: 'ignore', windowsHide: true });
  return result.status === 0;
}

/**
 * 判断指定 PID 或进程组是否仍存在。
 * @param pid - PID，负值表示进程组
 * @param operations - 系统进程操作
 * @returns 是否仍存在或无权限确认
 */
function isAlive(pid: number, operations: ProcessTreeOperations): boolean {
  try {
    operations.killSystemProcess(pid, 0);
    return true;
  } catch (error: unknown) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

/**
 * 安全发送 Unix 信号，目标退出时忽略 ESRCH。
 * @param pid - PID 或负进程组 PID
 * @param signal - 终止信号
 * @param operations - 系统进程操作
 */
function signalUnix(pid: number, signal: NodeJS.Signals, operations: ProcessTreeOperations): boolean {
  try {
    operations.killSystemProcess(pid, signal);
    return true;
  } catch (error: unknown) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH';
  }
}

/**
 * 创建平台终止策略。
 * @param platform - Node 平台标识
 * @param overrides - 测试或宿主覆盖的系统操作
 * @returns PTY 进程树终止原语
 */
export function createPtyStrategy(platform: NodeJS.Platform = process.platform, overrides: Partial<ProcessTreeOperations> = {}): PtyTerminationStrategy {
  const windows = platform === 'win32';
  const operations: ProcessTreeOperations = {
    killSystemProcess(pid: number, signal: ProcessSignal): void {
      process.kill(pid, signal);
    },
    listDescendants: windows ? listWindowsDescendants : listUnixDescendants,
    runTaskkill: runWindowsTaskkill,
    ...overrides
  };
  const treesByRoot = new Map<number, CapturedProcessTree>();

  /** 累计保存后代关系，避免根进程退出或后代 re-parent 后丢失 PPID 链。 */
  function captureTree(process: TerminablePty): void {
    const tree = treesByRoot.get(process.pid) ?? { descendants: new Set<number>(), inspectionFailed: false };
    treesByRoot.set(process.pid, tree);
    try {
      for (const pid of operations.listDescendants(process.pid)) tree.descendants.add(pid);
    } catch {
      // 无法读取进程表时不能把“未知”误报成“进程树已清空”。
      tree.inspectionFailed = true;
    }
  }

  /** 向 Unix 后代和 PTY 进程组发送同一信号。 */
  function signalUnixTree(process: TerminablePty, signal: NodeJS.Signals): void {
    const tree = treesByRoot.get(process.pid) ?? { descendants: new Set<number>(), inspectionFailed: false };
    treesByRoot.set(process.pid, tree);
    const descendants = [...tree.descendants];
    for (const pid of [...descendants].reverse()) {
      if (!signalUnix(pid, signal, operations)) tree.inspectionFailed = true;
    }
    if (!signalUnix(-process.pid, signal, operations)) tree.inspectionFailed = true;
  }

  /** 调用 Windows tree kill，并把底层启动失败留给存活验证处理。 */
  function runTaskkill(pid: number, force: boolean): boolean {
    try {
      return operations.runTaskkill(pid, force);
    } catch {
      return false;
    }
  }

  /** 使用 taskkill 清理 root 以及运行期间捕获的 detached 后代。 */
  function signalWindowsTree(process: TerminablePty, force: boolean): void {
    const descendants = [...(treesByRoot.get(process.pid)?.descendants ?? [])];
    const rootKilled = runTaskkill(process.pid, force);
    for (const pid of [...descendants].reverse()) runTaskkill(pid, force);
    if (!rootKilled) {
      try {
        process.kill();
      } catch {
        // 后续 isTreeAlive 是权威验证；底层 kill 失败不能跳过完整清理链。
      }
    }
  }

  return {
    trackTree(process: TerminablePty): void {
      captureTree(process);
    },
    interruptTree(process: TerminablePty): void {
      captureTree(process);
      try {
        process.write('\u0003');
      } catch {
        // leader 可能刚退出，后续 terminate/force 仍会处理已捕获后代。
      }
    },
    terminateTree(process: TerminablePty): void {
      if (windows) {
        signalWindowsTree(process, false);
        return;
      }
      signalUnixTree(process, 'SIGTERM');
    },
    forceTree(process: TerminablePty): void {
      if (windows) {
        signalWindowsTree(process, true);
        return;
      }
      signalUnixTree(process, 'SIGKILL');
    },
    isTreeAlive(process: TerminablePty): boolean {
      const tree = treesByRoot.get(process.pid);
      if (tree?.inspectionFailed) return true;
      const descendants = [...(tree?.descendants ?? [])];
      if (windows) return isAlive(process.pid, operations) || descendants.some((pid: number): boolean => isAlive(pid, operations));
      return isAlive(-process.pid, operations) || descendants.some((pid: number): boolean => isAlive(pid, operations));
    },
    releaseTree(process: TerminablePty): void {
      treesByRoot.delete(process.pid);
    }
  };
}
