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
  it('summarizes read_current_webpage with simplified DOM metadata', (): void => {
    const summary = getToolResultSummary(
      'read_current_webpage',
      successResult('read_current_webpage', {
        url: 'https://example.com/register',
        title: '挂号',
        header: 'Page info: 800x600px [Start of page]',
        content: '[1]<button>搜索</button>',
        footer: '[End of page]',
        text: '搜索',
        selectedText: '',
        headings: [{ level: 1, text: '挂号' }],
        links: [],
        capturedAt: 1,
        truncated: { text: false, content: false, headings: false, links: false, selectedText: false }
      })
    );

    expect(summary).toEqual({
      text: '已读取网页: 挂号',
      tags: [
        { label: '网址', value: 'https://example.com/register' },
        { label: '页面标题数', value: '1' },
        { label: '页面链接数', value: '0' },
        { label: '结构内容', value: '有' }
      ]
    });
  });

  it('summarizes read_current_webpage with top layer metadata', (): void => {
    const summary = getToolResultSummary(
      'read_current_webpage',
      successResult('read_current_webpage', {
        url: 'https://example.com/register',
        title: '挂号',
        header: 'Page info: 800x600px [Start of page]',
        content: '[1]<button>确认</button>',
        footer: '[End of page]',
        text: '温馨提示 确认',
        selectedText: '',
        headings: [],
        links: [],
        capturedAt: 1,
        truncated: { text: false, content: false, headings: false, links: false, selectedText: false },
        viewport: {
          width: 800,
          height: 600,
          scrollX: 0,
          scrollY: 0,
          topLayer: {
            kind: 'dialog',
            label: '温馨提示',
            text: '医生在多个院区/科室出诊，请确认预约信息',
            rect: { x: 80, y: 140, width: 640, height: 360 },
            elementIndexes: [1],
            primaryActionIndex: 1,
            dimmed: true
          },
          elements: []
        }
      })
    );

    expect(summary?.tags).toContainEqual({ label: '顶层浮层', value: '温馨提示' });
  });

  it('summarizes read_current_webpage with manually selected element metadata', (): void => {
    const summary = getToolResultSummary(
      'read_current_webpage',
      successResult('read_current_webpage', {
        url: 'https://example.com/register',
        title: '挂号',
        header: 'Page info: 800x600px [Start of page]',
        content: '[1]<button>确认</button>',
        footer: '[End of page]',
        text: '确认',
        selectedText: '',
        headings: [],
        links: [],
        capturedAt: 1,
        truncated: { text: false, content: false, headings: false, links: false, selectedText: false },
        selectedElement: {
          tagName: 'BUTTON',
          id: 'confirm-button',
          className: 'primary-action',
          text: '确认',
          selector: 'button#confirm-button',
          attributes: [],
          ancestors: [],
          computedStyles: {},
          rect: { x: 20, y: 30, width: 120, height: 40 },
          matchedIndex: 1
        }
      })
    );

    expect(summary?.tags).toContainEqual({ label: '选中元素', value: '#1 确认' });
  });

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

  it('summarizes apply_drawing_operations with the applied operation count', (): void => {
    const summary = getToolResultSummary(
      'apply_drawing_operations',
      successResult('apply_drawing_operations', {
        appliedOperations: 3,
        data: {
          elements: [{ id: 'node-1' }],
          viewport: { center: { x: 0, y: 0 }, zoom: 1 }
        }
      })
    );

    expect(summary).toEqual({
      text: '已操作画板',
      tags: [
        { label: '元素', value: '1' },
        { label: '操作', value: '3' }
      ]
    });
  });

  it('summarizes create_drawing as a created drawing draft', (): void => {
    const summary = getToolResultSummary(
      'create_drawing',
      successResult('create_drawing', {
        title: '流程图',
        path: 'unsaved://draft-1/flow.tibis',
        data: {
          elements: [{ id: 'node-1' }],
          viewport: { center: { x: 0, y: 0 }, zoom: 1 }
        }
      })
    );

    expect(summary).toEqual({
      text: '已创建画板: 流程图',
      tags: [
        { label: '元素', value: '1' },
        { label: '文件', value: 'flow.tibis' }
      ]
    });
  });

  it('summarizes operate_webpage click results with the target element', (): void => {
    const summary = getToolResultSummary(
      'operate_webpage',
      successResult('operate_webpage', {
        ok: true,
        action: 'click',
        target: { index: 2, label: '预约挂号', tagName: 'BUTTON' },
        message: 'executed',
        navigationStarted: false,
        pageChanged: true,
        shouldReadAgain: true
      })
    );

    expect(summary).toEqual({
      text: '已点击网页元素',
      tags: [
        { label: '动作', value: '点击' },
        { label: '目标', value: '#2 预约挂号' }
      ]
    });
  });

  it('summarizes operate_webpage press results with the target element', (): void => {
    const summary = getToolResultSummary(
      'operate_webpage',
      successResult('operate_webpage', {
        ok: true,
        action: 'press',
        target: { index: 1, label: '搜索医院', tagName: 'INPUT' },
        message: 'executed',
        navigationStarted: false,
        pageChanged: true,
        shouldReadAgain: true
      })
    );

    expect(summary).toEqual({
      text: '已按下网页按键',
      tags: [
        { label: '动作', value: '按键' },
        { label: '目标', value: '#1 搜索医院' }
      ]
    });
  });

  it('summarizes operate_webpage scroll results with movement details', (): void => {
    const summary = getToolResultSummary(
      'operate_webpage',
      successResult('operate_webpage', {
        ok: true,
        action: 'scroll',
        target: { index: 1, label: '列表', tagName: 'DIV' },
        message: 'executed',
        navigationStarted: false,
        pageChanged: true,
        shouldReadAgain: true,
        scroll: {
          targetType: 'element',
          before: { x: 0, y: 0 },
          after: { x: 0, y: 240 },
          changed: true
        }
      })
    );

    expect(summary).toEqual({
      text: '已滚动网页',
      tags: [
        { label: '动作', value: '滚动' },
        { label: '目标', value: '#1 列表' },
        { label: '滚动目标', value: '元素' },
        { label: '位置', value: '0,0 → 0,240' }
      ]
    });
  });
});
