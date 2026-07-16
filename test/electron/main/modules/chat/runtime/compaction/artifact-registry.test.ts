/**
 * @file artifact-registry.test.ts
 * @description 上下文压缩 artifact 稳定身份注册表测试。
 */
import type { ArtifactState, ChatMessageRecord } from 'types/chat';
import { describe, expect, it } from 'vitest';
import { createArtifactRegistry } from '../../../../../../../electron/main/modules/chat/runtime/compaction/artifact-registry.mjs';

/**
 * 创建顺序 artifact ID 工厂。
 * @returns ID 工厂
 */
function createIdFactory(): () => string {
  let sequence = 0;
  return (): string => {
    sequence += 1;
    return `artifact-${sequence}`;
  };
}

describe('artifact registry', (): void => {
  it('同一路径连续读取和修改复用稳定 ID', (): void => {
    const registry = createArtifactRegistry({ createId: createIdFactory() });

    expect(registry.observe({ path: 'src/a.ts', operation: 'read' })).toBe('artifact-1');
    expect(registry.observe({ path: 'src/a.ts', operation: 'modified' })).toBe('artifact-1');
    expect(registry.resolve('src/a.ts')).toBe('artifact-1');
  });

  it('bridge 提供的现有文档 ID 优先于 Runtime 分配 ID', (): void => {
    const registry = createArtifactRegistry({ createId: createIdFactory() });

    expect(registry.observe({ artifactId: 'document-1', path: 'src/a.ts', operation: 'read' })).toBe('document-1');
    expect(registry.resolve('src/a.ts')).toBe('document-1');
  });

  it('路径移动后保留 artifact 身份', (): void => {
    const registry = createArtifactRegistry({ createId: createIdFactory() });
    registry.observe({ path: 'src/a.ts', operation: 'read' });

    expect(registry.move({ previousPath: 'src/a.ts', path: 'src/utils/a.ts' })).toBe('artifact-1');
    expect(registry.resolve('src/a.ts')).toBeUndefined();
    expect(registry.resolve('src/utils/a.ts')).toBe('artifact-1');
  });

  it('删除后在同一路径创建文件会分配新 ID', (): void => {
    const registry = createArtifactRegistry({ createId: createIdFactory() });
    registry.observe({ path: 'src/a.ts', operation: 'read' });
    registry.observe({ path: 'src/a.ts', operation: 'deleted' });

    expect(registry.observe({ path: 'src/a.ts', operation: 'created' })).toBe('artifact-2');
  });

  it('从 checkpoint artifact 和后续工具结果重建移动映射', (): void => {
    const checkpointArtifacts: ArtifactState[] = [
      {
        id: 'document-1',
        path: 'src/a.ts',
        purpose: '入口模块',
        status: 'modified',
        keyChanges: ['导出入口'],
        shouldReload: false,
        sourcePartIds: ['tool-old']
      }
    ];
    const messages: ChatMessageRecord[] = [
      {
        id: 'assistant-1',
        sessionId: 'session-1',
        role: 'assistant',
        content: '',
        parts: [
          {
            id: 'tool-move',
            type: 'tool',
            toolCallId: 'call-move',
            toolName: 'move_file',
            status: 'done',
            input: {},
            result: {
              toolName: 'move_file',
              status: 'success',
              data: {
                artifactId: 'document-1',
                previousPath: 'src/a.ts',
                path: 'src/utils/a.ts'
              }
            }
          }
        ],
        createdAt: '2026-07-16T00:00:00.000Z',
        finished: true
      }
    ];

    const registry = createArtifactRegistry({ checkpointArtifacts, createId: createIdFactory(), messages });

    expect(registry.resolve('src/a.ts')).toBeUndefined();
    expect(registry.resolve('src/utils/a.ts')).toBe('document-1');
  });

  it('没有文件 ID 或移动证据时不会按文件名猜测关联', (): void => {
    const registry = createArtifactRegistry({ createId: createIdFactory() });

    const firstId = registry.observe({ path: 'src/a.ts', operation: 'read' });
    const secondId = registry.observe({ path: 'other/a.ts', operation: 'read' });

    expect(secondId).not.toBe(firstId);
  });
});
