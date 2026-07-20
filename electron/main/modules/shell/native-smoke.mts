/**
 * @file native-smoke.mts
 * @description 在当前 Electron ABI 中验证 node-pty、headless terminal、输入写入和正常退出。
 */
import type { PtyDisposable, PtyProcess, PtyProcessFactory } from './interaction/pty-process.mjs';
import { createNativePtyFactory } from './interaction/pty-process.mjs';
import { createScreenProjector, type TerminalSnapshotProjector } from './interaction/screen-projector.mjs';

/** 原生 PTY smoke 结果。 */
export interface ShellPtySmokeResult {
  /** 是否完成完整 PTY 循环。 */
  ok: boolean;
  /** 可安全输出到 CI 日志的单行说明。 */
  message: string;
}

/** 原生 PTY smoke 可注入选项。 */
export interface ShellPtySmokeOptions {
  /** 测试注入的 PTY 工厂；缺省时延迟加载 node-pty。 */
  ptyFactory?: PtyProcessFactory;
  /** 测试或打包应用的工作目录。 */
  cwd?: string;
  /** 平台覆盖，仅用于单元测试。 */
  platform?: NodeJS.Platform;
  /** smoke 总超时。 */
  timeoutMs?: number;
}

/**
 * 创建跨平台、无需网络或仓库 fixture 的交互命令。
 * @param platform - 当前 Node 平台
 * @returns Shell 类型与命令文本
 */
function createSmokeCommand(platform: NodeJS.Platform): { shell: 'bash' | 'powershell'; command: string } {
  if (platform === 'win32') {
    return {
      shell: 'powershell',
      command: "Write-Host -NoNewline 'Continue? [Y/n]'; $null = Read-Host; Write-Host 'accepted'"
    };
  }
  return {
    shell: 'bash',
    command: "printf 'Continue? [Y/n]'; read answer; printf '\\naccepted\\n'"
  };
}

/**
 * 在当前 Electron 主进程完成一次真实 PTY 输出、Enter 和退出循环。
 * @param options - 可注入依赖和超时
 * @returns smoke 验收结果
 */
export function runShellPtySmoke(options: ShellPtySmokeOptions = {}): Promise<ShellPtySmokeResult> {
  const platform = options.platform ?? process.platform;
  const smokeCommand = createSmokeCommand(platform);
  let terminal: PtyProcess;
  let projector: TerminalSnapshotProjector | undefined;
  try {
    const factory = options.ptyFactory ?? createNativePtyFactory();
    projector = createScreenProjector({ columns: 80, rows: 24 });
    terminal = factory.spawn({
      shell: smokeCommand.shell,
      command: smokeCommand.command,
      cwd: options.cwd ?? process.cwd(),
      columns: 80,
      rows: 24
    });
  } catch (error: unknown) {
    projector?.dispose();
    const message = error instanceof Error ? error.message : '原生 PTY 无法加载';
    return Promise.resolve({ ok: false, message: `Shell PTY ABI smoke FAIL: ${message}` });
  }
  if (!projector) return Promise.resolve({ ok: false, message: 'Shell PTY ABI smoke FAIL: terminal projector unavailable' });
  const screenProjector = projector;

  return new Promise<ShellPtySmokeResult>((resolve: (result: ShellPtySmokeResult) => void): void => {
    let dataSubscription: PtyDisposable | null = null;
    let exitSubscription: PtyDisposable | null = null;
    let output = '';
    let answered = false;
    let settled = false;
    let processing = Promise.resolve();
    let timeout: ReturnType<typeof setTimeout> | null = null;

    /** 释放 smoke 持有的所有资源并只完成一次。 */
    function finish(result: ShellPtySmokeResult): void {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      dataSubscription?.dispose();
      exitSubscription?.dispose();
      screenProjector.dispose();
      resolve(result);
    }

    /** 返回失败并确保底层 PTY 不再存活。 */
    function stopFailure(message: string): void {
      finish({ ok: false, message: `Shell PTY ABI smoke FAIL: ${message}` });
      try {
        terminal.kill();
      } catch {
        // smoke 已返回失败；底层 kill 异常不能产生第二个未捕获错误。
      }
    }

    timeout = setTimeout((): void => {
      stopFailure('timeout');
    }, options.timeoutMs ?? 5_000);

    dataSubscription = terminal.onData((data: string): void => {
      output += data;
      processing = processing.then((): Promise<void> => screenProjector.write(data)).catch((): void => stopFailure('terminal projector unavailable'));
      if (!answered && output.includes('Continue? [Y/n]')) {
        answered = true;
        try {
          terminal.write('\r');
        } catch {
          stopFailure('PTY write failed');
        }
      }
    });
    exitSubscription = terminal.onExit((event: { exitCode: number; signal?: number }): void => {
      processing.then((): void => {
        if (settled) return;
        const projected = screenProjector.projectOutput(2_000).content;
        if (event.exitCode === 0 && answered && output.includes('accepted') && projected.includes('accepted')) {
          finish({ ok: true, message: 'Shell PTY ABI smoke PASS' });
          return;
        }
        finish({ ok: false, message: `Shell PTY ABI smoke FAIL: exit ${event.exitCode}` });
      });
    });
  });
}
