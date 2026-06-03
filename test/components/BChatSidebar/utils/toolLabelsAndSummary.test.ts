/**
 * @file toolLabelsAndSummary.test.ts
 * @description 验证聊天工具标签和结果摘要的展示逻辑。
 */
import { describe, expect, it } from 'vitest';
import { createToolSuccessResult } from '@/ai/tools/results';
import { getActionLabel } from '@/components/BChatSidebar/utils/toolLabels';
import { getToolResultSummary } from '@/components/BChatSidebar/utils/toolResultSummary';

/**
 * 当前网页快照展示逻辑测试集。
 */
describe('BChatSidebar tool labels and summaries', () => {
  /**
   * 验证当前网页读取工具展示为用户可读动作。
   */
  it('labels read_current_webpage as current webpage read', () => {
    expect(getActionLabel('read_current_webpage')).toEqual({ alias: '读取当前网页' });
  });

  /**
   * 验证 MCP SDK 工具名会展示为可读的原始 tool 名称。
   */
  it('labels MCP SDK tool names with decoded original tool name', () => {
    expect(getActionLabel('mcp_4147526665562d5455586f30384151564165717539_6d6170735f77656174686572')).toEqual({
      alias: 'MCP: maps_weather'
    });
  });

  /**
   * 验证当前网页读取结果会被压缩为简明摘要。
   */
  it('summarizes read_current_webpage result', () => {
    const summary = getToolResultSummary(
      'read_current_webpage',
      createToolSuccessResult('read_current_webpage', {
        url: 'https://example.com/docs',
        title: 'Docs',
        text: 'Visible text',
        selectedText: 'Selected text',
        headings: [
          { level: 1, text: 'Intro' },
          { level: 2, text: 'Usage' }
        ],
        links: [{ text: 'Home', href: 'https://example.com' }],
        capturedAt: 1,
        truncated: { text: true, headings: false, links: false, selectedText: false }
      })
    );

    expect(summary).toEqual({
      text: '已读取网页: Docs',
      tags: [
        { label: '网址', value: 'https://example.com/docs' },
        { label: '页面标题数', value: '2' },
        { label: '页面链接数', value: '1' },
        { label: '选中文本', value: '有' },
        { label: '内容已截断', value: '是' }
      ]
    });
  });
});
