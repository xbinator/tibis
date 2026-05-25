/**
 * @file workspace-root.test.ts
 * @description 验证 Tibis 工作区根目录提供器的路径解析和目录创建逻辑。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock node:os 和 node:fs/promises
const mockHomedir = vi.fn(() => '/home/testuser');
const mockAccess = vi.fn();
const mockMkdir = vi.fn();
const mockRealpath = vi.fn();

vi.mock('node:os', () => ({
  default: {
    homedir: mockHomedir
  },
  homedir: mockHomedir
}));

vi.mock('node:fs/promises', () => ({
  default: {
    access: mockAccess,
    mkdir: mockMkdir,
    realpath: mockRealpath
  },
  access: mockAccess,
  mkdir: mockMkdir,
  realpath: mockRealpath
}));

vi.mock('node:path', async () => {
  const actual = await vi.importActual('node:path');
  return {
    ...actual,
    default: {
      ...actual,
      join: (...args: string[]) => args.join('/')
    }
  };
});

describe('workspace root provider', () => {
  beforeEach(() => {
    vi.resetModules();
    mockHomedir.mockReturnValue('/home/testuser');
    mockAccess.mockReset();
    mockMkdir.mockReset();
    mockRealpath.mockReset();
  });

  it('resolves default workspace root to ~/Tibis', async () => {
    const { resolveDefaultWorkspaceRoot } = await import('../../electron/main/modules/workspace/root.mjs');
    expect(resolveDefaultWorkspaceRoot()).toBe('/home/testuser/Tibis');
  });

  it('returns existing directory without creating', async () => {
    mockAccess.mockResolvedValue(undefined);
    mockRealpath.mockResolvedValue('/home/testuser/Tibis');

    const { ensureTibisWorkspaceRoot } = await import('../../electron/main/modules/workspace/root.mjs');
    const result = await ensureTibisWorkspaceRoot();

    expect(result).toEqual({ rootPath: '/home/testuser/Tibis', created: false });
    expect(mockMkdir).not.toHaveBeenCalled();
  });

  it('creates directory when it does not exist', async () => {
    mockAccess.mockRejectedValue(new Error('ENOENT'));
    mockMkdir.mockResolvedValue(undefined);
    mockRealpath.mockResolvedValue('/home/testuser/Tibis');

    const { ensureTibisWorkspaceRoot } = await import('../../electron/main/modules/workspace/root.mjs');
    const result = await ensureTibisWorkspaceRoot();

    expect(result).toEqual({ rootPath: '/home/testuser/Tibis', created: true });
    expect(mockMkdir).toHaveBeenCalledWith('/home/testuser/Tibis', { recursive: true });
  });

  it('resolves symlinks via realpath', async () => {
    mockAccess.mockResolvedValue(undefined);
    mockRealpath.mockResolvedValue('/real/path/Tibis');

    const { ensureTibisWorkspaceRoot } = await import('../../electron/main/modules/workspace/root.mjs');
    const result = await ensureTibisWorkspaceRoot();

    expect(result.rootPath).toBe('/real/path/Tibis');
  });
});
