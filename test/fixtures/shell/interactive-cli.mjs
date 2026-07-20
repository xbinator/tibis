/**
 * @file interactive-cli.mjs
 * @description Shell PTY 测试使用的无网络交互式 CLI fixture。
 */

import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const scenario = process.argv[2] ?? 'boolean-default';

/**
 * 等待一次终端输入。
 * @returns 输入文本
 */
function readInput() {
  return new Promise((resolve) => {
    process.stdin.setEncoding('utf8');
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once('data', (data) => resolve(String(data)));
  });
}

/**
 * 执行 fixture 场景。
 * @returns 完成 Promise
 */
async function run() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stderr.write('TTY required\n');
    process.exitCode = 2;
    return;
  }

  if (scenario === 'boolean-default') {
    process.stdout.write('Continue? [Y/n]');
    const answer = await readInput();
    process.stdout.write(answer.includes('\r') ? '\r\naccepted\r\n' : '\r\nrejected\r\n');
    process.exitCode = answer.includes('\r') ? 0 : 3;
    // 保持 PTY 存活一段时间，验证历史 prompt 不会被重复回答。
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    process.stdin.pause();
    return;
  }

  if (scenario === 'stale-compile-prompt') {
    process.stdout.write('Building project...\r\nContinue? [Y/n]');
    const answer = await readInput();
    process.stdout.write(answer.includes('\r') ? '\r\naccepted after build\r\n' : '\r\nrejected after build\r\n');
    process.exitCode = answer.includes('\r') ? 0 : 3;
    process.stdin.pause();
    return;
  }

  if (scenario === 'secret-input') {
    process.stdout.write('Enter API token:');
    await readInput();
    process.exitCode = 4;
    return;
  }

  if (scenario === 'same-screen-reentry') {
    process.stdout.write('Continue? [Y/n]');
    const firstAnswer = await readInput();
    if (!firstAnswer.includes('\r')) {
      process.exitCode = 3;
      return;
    }
    for (let percent = 0; percent <= 100; percent += 10) {
      process.stdout.write(`\rDownloading ${percent}%`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    process.stdout.write('\u001b[2J\u001b[HContinue? [Y/n]');
    const secondAnswer = await readInput();
    process.stdout.write(secondAnswer.includes('\r') ? '\r\naccepted twice\r\n' : '\r\nsecond rejected\r\n');
    process.exitCode = secondAnswer.includes('\r') ? 0 : 4;
    process.stdin.pause();
    return;
  }

  if (scenario === 'multi-wizard') {
    process.stdout.write('Choose package:\r\n❯ Alpha\r\n  Beta');
    const firstAnswer = await readInput();
    if (!firstAnswer.includes('\r')) {
      process.exitCode = 3;
      return;
    }
    process.stdout.write('\u001b[2J\u001b[HChoose source:\r\n  Local\r\n❯ Registry');
    const secondAnswer = await readInput();
    if (!secondAnswer.includes('\r')) {
      process.exitCode = 4;
      return;
    }
    process.stdout.write('\u001b[2J\u001b[HInstall selected skills? [Y/n]');
    const thirdAnswer = await readInput();
    process.stdout.write(thirdAnswer.includes('\r') ? '\r\ninstalled wizard defaults\r\n' : '\r\ninstallation rejected\r\n');
    process.exitCode = thirdAnswer.includes('\r') ? 0 : 5;
    process.stdin.pause();
    return;
  }

  if (scenario === 'child-process-tree') {
    const childScript = [
      "process.on('SIGINT', () => undefined)",
      "process.on('SIGTERM', () => undefined)",
      "process.on('SIGHUP', () => undefined)",
      'setInterval(() => undefined, 1000)'
    ].join(';');
    const child = spawn(process.execPath, ['-e', childScript], { detached: true, stdio: 'ignore' });
    child.unref();
    const pidFile = process.argv[3];
    if (pidFile && child.pid) writeFileSync(pidFile, String(child.pid), 'utf8');
    process.stdout.write(`CHILD_PID=${child.pid ?? 0}\r\nEnter API token:`);
    await readInput();
    process.exitCode = 4;
    return;
  }

  process.stdout.write('Unknown prompt?');
  await readInput();
}

await run();
