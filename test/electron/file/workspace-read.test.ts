/**
 * @file workspace-read.test.ts
 * @description 工作区文件读取服务测试（纯 I/O，不做安全拦截）。
 */
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readWorkspaceDirectory, readWorkspaceFile } from '../../../electron/main/modules/workspace/read.mjs';

/** 测试临时目录路径 */
let tempRoot = '';
/** 测试工作区目录路径 */
let workspaceRoot = '';

/**
 * 写入工作区内测试文件。
 * @param relativePath - 相对工作区路径
 * @param content - 文件内容
 * @returns 写入后的绝对路径
 */
async function writeWorkspaceFixture(relativePath: string, content: string): Promise<string> {
  const filePath = path.join(workspaceRoot, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf-8');
  return filePath;
}

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(tmpdir(), 'tibis-workspace-read-'));
  workspaceRoot = path.join(tempRoot, 'workspace');
  await mkdir(workspaceRoot, { recursive: true });
});

afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

describe('readWorkspaceFile', () => {
  it('reads a line slice from a workspace text file', async () => {
    const filePath = await writeWorkspaceFixture('src/example.ts', ['line 1', 'line 2', 'line 3', 'line 4'].join('\n'));

    const result = await readWorkspaceFile({
      filePath: 'src/example.ts',
      workspaceRoot,
      offset: 2,
      limit: 2
    });

    expect(result).toEqual({
      content: 'line 2\nline 3',
      hasMore: true,
      nextOffset: 4,
      path: await realpath(filePath),
      totalLines: 4,
      readLines: 2
    });
  });

  it('reads remaining lines when limit is omitted', async () => {
    const filePath = await writeWorkspaceFixture('src/full.ts', ['line 1', 'line 2', 'line 3'].join('\n'));

    const result = await readWorkspaceFile({
      filePath: 'src/full.ts',
      workspaceRoot,
      offset: 2
    });

    expect(result).toEqual({
      content: 'line 2\nline 3',
      hasMore: false,
      nextOffset: null,
      path: await realpath(filePath),
      totalLines: 3,
      readLines: 2
    });
  });

  it('reads files with any extension since security is handled by the business layer', async () => {
    const content = 'not really an image';
    await writeWorkspaceFixture('asset.png', content);

    const result = await readWorkspaceFile({
      filePath: 'asset.png',
      workspaceRoot
    });

    expect(result.content).toBe(content);
    expect(result.totalLines).toBe(1);
  });

  it('reads an absolute file path when no workspace root is provided', async () => {
    const filePath = await writeWorkspaceFixture('README.md', '# Tibis');

    const result = await readWorkspaceFile({
      filePath
    });

    expect(result).toEqual({
      content: '# Tibis',
      hasMore: false,
      nextOffset: null,
      path: await realpath(filePath),
      totalLines: 1,
      readLines: 1
    });
  });

  it('rejects relative paths when no workspace root is provided', async () => {
    await expect(
      readWorkspaceFile({
        filePath: 'README.md'
      })
    ).rejects.toThrow('未配置工作区根目录时只能使用绝对路径');
  });

  it('rejects invalid offset values', async () => {
    await writeWorkspaceFixture('test.ts', 'content');

    await expect(
      readWorkspaceFile({
        filePath: 'test.ts',
        workspaceRoot,
        offset: -1
      })
    ).rejects.toThrow('offset 必须是大于等于 1 的整数');
  });

  it('rejects invalid limit values', async () => {
    await writeWorkspaceFixture('test.ts', 'content');

    await expect(
      readWorkspaceFile({
        filePath: 'test.ts',
        workspaceRoot,
        limit: 0
      })
    ).rejects.toThrow('limit 必须是大于等于 1 的整数');
  });

  it('rejects empty file path', async () => {
    await expect(
      readWorkspaceFile({
        filePath: '',
        workspaceRoot
      })
    ).rejects.toThrow('路径不能为空');
  });

  it('reads files outside the workspace since boundary check is handled by the business layer', async () => {
    const siblingRoot = path.join(tempRoot, 'workspace-sibling');
    await mkdir(siblingRoot, { recursive: true });
    const outsideFile = path.join(siblingRoot, 'secret.ts');
    await writeFile(outsideFile, 'secret', 'utf-8');

    const result = await readWorkspaceFile({
      filePath: outsideFile,
      workspaceRoot
    });

    expect(result.content).toBe('secret');
  });
});

describe('readWorkspaceDirectory', () => {
  it('lists only direct children in the target directory', async () => {
    const sourceDir = path.join(workspaceRoot, 'src');
    const nestedDir = path.join(sourceDir, 'nested');
    await mkdir(nestedDir, { recursive: true });
    await writeFile(path.join(sourceDir, 'main.ts'), 'console.log("hi")', 'utf-8');
    await writeFile(path.join(nestedDir, 'hidden.ts'), 'secret', 'utf-8');

    const result = await readWorkspaceDirectory({
      directoryPath: 'src',
      workspaceRoot
    });

    expect(result).toEqual({
      path: await realpath(sourceDir),
      entries: [
        {
          name: 'main.ts',
          path: await realpath(path.join(sourceDir, 'main.ts')),
          type: 'file'
        },
        {
          name: 'nested',
          path: await realpath(nestedDir),
          type: 'directory'
        }
      ]
    });
  });

  it('reads directories outside the workspace since boundary check is handled by the business layer', async () => {
    const siblingRoot = path.join(tempRoot, 'workspace-sibling');
    const outsideDir = path.join(siblingRoot, 'secret');
    await mkdir(outsideDir, { recursive: true });

    const result = await readWorkspaceDirectory({
      directoryPath: outsideDir,
      workspaceRoot
    });

    expect(result.path).toBe(await realpath(outsideDir));
    expect(result.entries).toEqual([]);
  });

  it('reads blacklisted directories since security is handled by the business layer', async () => {
    await mkdir(path.join(workspaceRoot, '.git'), { recursive: true });

    const result = await readWorkspaceDirectory({
      directoryPath: '.git',
      workspaceRoot
    });

    expect(result.path).toBe(await realpath(path.join(workspaceRoot, '.git')));
  });
});
