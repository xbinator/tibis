/**
 * @file file-reference.test.ts
 * @description 聊天文件引用插入事件回归测试。
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatFileReferenceInsertPayload } from '@/shared/chat/fileReference';

/**
 * 重新加载聊天文件引用模块，隔离模块内的待消费事件队列。
 * @returns 聊天文件引用模块
 */
async function loadFileReferenceModule(): Promise<typeof import('@/shared/chat/fileReference')> {
  vi.resetModules();
  return import('@/shared/chat/fileReference');
}

/**
 * 创建文件引用插入事件负载。
 * @param overrides - 覆盖字段
 * @returns 文件引用插入事件负载
 */
function createPayload(overrides: Partial<ChatFileReferenceInsertPayload> = {}): ChatFileReferenceInsertPayload {
  return {
    id: 'doc-1',
    ext: 'md',
    filePath: '/workspace/note.md',
    fileName: 'note',
    startLine: 2,
    endLine: 4,
    ...overrides
  };
}

describe('chat file reference insert events', (): void => {
  beforeEach((): void => {
    vi.clearAllMocks();
  });

  it('replays a pending insert when BChat registers after the editor emits it', async (): Promise<void> => {
    const { emitChatFileReferenceInsert, onChatFileReferenceInsert } = await loadFileReferenceModule();
    const payload = createPayload();
    const handler = vi.fn<(reference: ChatFileReferenceInsertPayload) => void>();

    emitChatFileReferenceInsert(payload);
    const dispose = onChatFileReferenceInsert(handler);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(payload);

    dispose();
  });

  it('does not replay an already consumed insert to later listeners', async (): Promise<void> => {
    const { emitChatFileReferenceInsert, onChatFileReferenceInsert } = await loadFileReferenceModule();
    const payload = createPayload();
    const firstHandler = vi.fn<(reference: ChatFileReferenceInsertPayload) => void>();
    const secondHandler = vi.fn<(reference: ChatFileReferenceInsertPayload) => void>();

    emitChatFileReferenceInsert(payload);
    const disposeFirst = onChatFileReferenceInsert(firstHandler);
    disposeFirst();
    const disposeSecond = onChatFileReferenceInsert(secondHandler);

    expect(firstHandler).toHaveBeenCalledTimes(1);
    expect(secondHandler).not.toHaveBeenCalled();

    disposeSecond();
  });

  it('accepts unsaved editor references with a null file path', async (): Promise<void> => {
    const { isChatFileReferenceInsertPayload } = await loadFileReferenceModule();

    expect(isChatFileReferenceInsertPayload(createPayload({ filePath: null }))).toBe(true);
  });
});
