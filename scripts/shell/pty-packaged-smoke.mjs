/**
 * @file pty-packaged-smoke.mjs
 * @description 定位 electron-builder unpacked 应用并执行内置 --shell-pty-smoke release gate。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * 在 release 目录中定位当前平台的打包可执行文件。
 * @param releaseRoot - electron-builder 输出目录
 * @returns 可执行文件路径，不存在时返回 null
 */
function findExecutable(releaseRoot) {
  if (!existsSync(releaseRoot)) return null;
  const entries = readdirSync(releaseRoot, { recursive: true }).map((entry) => String(entry));
  let suffix = 'tibis';
  if (process.platform === 'darwin') suffix = '.app/Contents/MacOS/Tibis';
  else if (process.platform === 'win32') suffix = 'Tibis.exe';
  const candidates = entries
    .filter((entry) => entry.endsWith(suffix))
    .map((entry) => join(releaseRoot, entry))
    .filter((entry) => statSync(entry).isFile());
  return candidates[0] ?? null;
}

/**
 * 执行打包应用内置 smoke，并透传输出与退出码。
 * @returns 进程退出码
 */
function run() {
  const executable = process.argv[2] ? resolve(process.argv[2]) : findExecutable(resolve(process.cwd(), 'release'));
  if (!executable) {
    process.stderr.write('Shell packaged PTY smoke FAIL: executable not found\n');
    return 1;
  }
  const command = process.platform === 'linux' ? 'xvfb-run' : executable;
  const args = process.platform === 'linux' ? ['-a', executable, '--shell-pty-smoke'] : ['--shell-pty-smoke'];
  const result = spawnSync(command, args, { cwd: process.cwd(), stdio: 'inherit', windowsHide: true, timeout: 20_000 });
  if (result.error) {
    process.stderr.write(`Shell packaged PTY smoke FAIL: ${result.error.message}\n`);
    return 1;
  }
  return result.status ?? 1;
}

process.exitCode = run();
