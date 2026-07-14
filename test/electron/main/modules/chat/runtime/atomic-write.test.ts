/**
 * @file atomic-write.test.ts
 * @description atomically 文件写入失败清理契约测试。
 */
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { writeFile as writeFileAtomically } from 'atomically';
import { describe, expect, it } from 'vitest';

describe('atomic file write', (): void => {
  it('removes the temporary file when final replacement fails', async (): Promise<void> => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tibis-atomic-write-'));
    const targetPath = path.join(tempRoot, 'target.md');
    try {
      await fs.mkdir(targetPath);

      await expect(writeFileAtomically(targetPath, 'content', { encoding: 'utf8', timeout: 0 })).rejects.toBeInstanceOf(Error);

      const remainingEntries = await fs.readdir(tempRoot);
      expect(remainingEntries).toEqual(['target.md']);
      expect(remainingEntries.some((entry: string): boolean => entry.includes('.tmp-'))).toBe(false);
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });
});
