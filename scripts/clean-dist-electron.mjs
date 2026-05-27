/**
 * @file clean-dist-electron.mjs
 * @description 清理 Electron 主进程编译输出目录，避免陈旧文件进入安装包。
 */

import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * 删除 dist-electron 编译输出目录。
 * @returns 清理任务完成后的 Promise
 */
async function cleanDistElectron() {
  const distElectronPath = resolve(process.cwd(), 'dist-electron');

  await rm(distElectronPath, { force: true, recursive: true });
}

await cleanDistElectron();
