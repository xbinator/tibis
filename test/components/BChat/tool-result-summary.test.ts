/**
 * @file tool-result-summary.test.ts
 * @description 验证聊天工具结果摘要中的可打开文件元数据。
 */
import type { AIToolExecutionResult } from 'types/ai';
import { describe, expect, it } from 'vitest';
import { getToolResultSummary } from '@/components/BChat/utils/toolResultSummary';

/**
 * 创建成功工具结果。
 * @param toolName - 工具名称
 * @param data - 工具返回数据
 * @returns 工具成功结果
 */
function successResult(toolName: string, data: Record<string, unknown>): AIToolExecutionResult<Record<string, unknown>> {
  return {
    toolName,
    status: 'success',
    data
  };
}

describe('toolResultSummary open file metadata', (): void => {
  it('marks write_file file tag as openable when a file is created', (): void => {
    const summary = getToolResultSummary('write_file', successResult('write_file', { path: '/workspace/docs/report.md', content: '# Report', created: true }));

    expect(summary).toEqual({
      text: '已创建文件',
      tags: [{ label: '文件', value: 'report.md', action: 'openFile', path: '/workspace/docs/report.md' }]
    });
  });

  it('marks edit_file file tag as openable', (): void => {
    const summary = getToolResultSummary('edit_file', successResult('edit_file', { path: '/workspace/src/app.ts', replacedCount: 2 }));

    expect(summary?.tags?.[0]).toEqual({
      label: '文件',
      value: 'app.ts',
      action: 'openFile',
      path: '/workspace/src/app.ts'
    });
  });

  it('marks open_resource file tag as openable only for file resources', (): void => {
    const fileSummary = getToolResultSummary('open_resource', successResult('open_resource', { resourceType: 'file', path: '/workspace/notes/today.md' }));
    const webSummary = getToolResultSummary('open_resource', successResult('open_resource', { resourceType: 'webview', path: 'https://example.com' }));

    expect(fileSummary?.tags).toEqual([{ label: '文件', value: 'today.md', action: 'openFile', path: '/workspace/notes/today.md' }]);
    expect(webSummary?.tags).toEqual([{ label: '网址', value: 'https://example.com' }]);
  });
});
