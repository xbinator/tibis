/**
 * @file main-boundary.test.ts
 * @description ChatRuntime 主进程源码边界测试。
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

/** ChatRuntime 主进程目录。 */
const CHAT_RUNTIME_DIR = path.resolve(process.cwd(), 'electron/main/modules/chat/runtime');

/**
 * 读取 ChatRuntime 主进程源码文件。
 * @param directoryPath - 待扫描目录
 * @returns 文件路径列表
 */
async function readRuntimeSourceFiles(directoryPath: string = CHAT_RUNTIME_DIR): Promise<string[]> {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) return readRuntimeSourceFiles(entryPath);
      return entry.name.endsWith('.mts') ? [entryPath] : [];
    })
  );

  return files.flat();
}

describe('chat runtime main boundary', (): void => {
  it('does not import renderer src modules from Electron main runtime code', async (): Promise<void> => {
    const files = await readRuntimeSourceFiles();
    const checks = await Promise.all(
      files.map(async (filePath) => {
        const content = await fs.readFile(filePath, 'utf8');
        return content.includes('../../../../../src/') || content.includes('from "@/') ? path.relative(process.cwd(), filePath) : null;
      })
    );
    const violations = checks.filter((filePath): filePath is string => filePath !== null);

    expect(violations).toEqual([]);
  });
});
