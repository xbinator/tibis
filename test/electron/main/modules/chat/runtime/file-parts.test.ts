/**
 * @file file-parts.test.ts
 * @description ChatRuntime file part snapshot materialization tests.
 */
import type { ChatMessageFilePartInput } from 'types/chat';
import { describe, expect, it, vi } from 'vitest';
import { materializeRuntimeFileParts } from '../../../../../../electron/main/modules/chat/runtime/messages/file-parts.mjs';

/**
 * 创建文件输入片段测试夹具。
 * @param path - 文件路径
 * @param url - 文件 URL
 * @returns 文件输入片段
 */
function createInput(path: string, url = `file:///workspace/${path}`): ChatMessageFilePartInput {
  const sourceValue = `{{@${path}}}`;

  return {
    type: 'file',
    id: 'file-part-1',
    filename: path.split('/').at(-1) ?? path,
    mime: 'text/plain',
    url,
    path,
    sourceText: { start: 0, end: sourceValue.length, value: sourceValue }
  };
}

describe('materializeRuntimeFileParts', (): void => {
  it('snapshots opened editor content before reading disk content', async (): Promise<void> => {
    const parts = await materializeRuntimeFileParts({
      parts: [createInput('src/foo.ts')],
      runtime: { runtimeId: 'runtime-1', workspaceRoot: '/workspace' },
      now: () => '2026-06-20T00:00:00.000Z',
      requestBridge: vi.fn().mockResolvedValue({
        status: 'success',
        data: { path: 'src/foo.ts', content: 'editor line 1\neditor line 2' }
      })
    });

    expect(parts[0]).toMatchObject({
      type: 'file',
      snapshot: {
        content: 'editor line 1\neditor line 2',
        startLine: 1,
        endLine: 2,
        totalLines: 2,
        capturedAt: '2026-06-20T00:00:00.000Z'
      }
    });
  });

  it('uses explicit line ranges from the file URL', async (): Promise<void> => {
    const parts = await materializeRuntimeFileParts({
      parts: [createInput('src/foo.ts', 'file:///workspace/src/foo.ts?start=2&end=3')],
      runtime: { runtimeId: 'runtime-1', workspaceRoot: '/workspace' },
      now: () => '2026-06-20T00:00:00.000Z',
      requestBridge: vi.fn().mockResolvedValue({
        status: 'success',
        data: { path: 'src/foo.ts', content: 'one\ntwo\nthree\nfour' }
      })
    });

    expect(parts[0]).toMatchObject({
      type: 'file',
      snapshot: {
        content: 'two\nthree',
        startLine: 2,
        endLine: 3,
        totalLines: 4
      }
    });
  });

  it('materializes unsaved paths through bridge content', async (): Promise<void> => {
    const parts = await materializeRuntimeFileParts({
      parts: [createInput('unsaved://file-1/Draft.md', 'unsaved://file-1/Draft.md')],
      runtime: { runtimeId: 'runtime-1', workspaceRoot: '/workspace' },
      now: () => '2026-06-20T00:00:00.000Z',
      requestBridge: vi.fn().mockResolvedValue({
        status: 'success',
        data: { path: 'unsaved://file-1/Draft.md', content: 'draft content' }
      })
    });

    expect(parts[0]).toMatchObject({
      type: 'file',
      snapshot: expect.objectContaining({ content: 'draft content' })
    });
  });
});
