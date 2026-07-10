/**
 * @file code-highlighter.test.ts
 * @description BMessage 共享代码高亮器测试。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const lowlightMocks = vi.hoisted(() => ({
  createLowlight: vi.fn(),
  registered: vi.fn((): boolean => true),
  highlight: vi.fn(() => ({
    type: 'root',
    children: [
      {
        type: 'element',
        properties: { className: ['hljs-keyword'] },
        children: [{ type: 'text', value: 'const' }]
      }
    ]
  }))
}));

vi.mock('lowlight', () => ({
  common: {},
  createLowlight: lowlightMocks.createLowlight.mockReturnValue({
    registered: lowlightMocks.registered,
    highlight: lowlightMocks.highlight
  })
}));

describe('highlightMessageCode', (): void => {
  beforeEach(async (): Promise<void> => {
    vi.resetModules();
    lowlightMocks.createLowlight.mockClear();
    lowlightMocks.registered.mockClear();
    lowlightMocks.highlight.mockClear();
  });

  it('creates one lowlight instance for multiple highlight calls', async (): Promise<void> => {
    const { highlightMessageCode } = await import('@/components/BMessage/utils/codeHighlight');

    highlightMessageCode('ts', 'const first = 1', true);
    highlightMessageCode('ts', 'const second = 2', true);

    expect(lowlightMocks.createLowlight).toHaveBeenCalledOnce();
    expect(lowlightMocks.highlight).toHaveBeenCalledTimes(2);
  });

  it('skips syntax highlighting for incomplete code fences', async (): Promise<void> => {
    const { highlightMessageCode } = await import('@/components/BMessage/utils/codeHighlight');

    const result = highlightMessageCode('ts', 'const value = 1', false);

    expect(lowlightMocks.highlight).not.toHaveBeenCalled();
    expect(result).toEqual([{ type: 'text', value: 'const value = 1' }]);
  });

  it('converts completed highlights into safe render nodes', async (): Promise<void> => {
    const { highlightMessageCode } = await import('@/components/BMessage/utils/codeHighlight');

    const result = highlightMessageCode('ts', 'const value = 1', true);

    expect(lowlightMocks.highlight).toHaveBeenCalledWith('typescript', 'const value = 1');
    expect(result[0]).toMatchObject({ type: 'element', className: 'hljs-keyword' });
  });

  it('reuses completed highlights when later snapshots rebuild the same code block', async (): Promise<void> => {
    const { highlightMessageCode } = await import('@/components/BMessage/utils/codeHighlight');

    const first = highlightMessageCode('ts', 'const value = 1', true);
    const second = highlightMessageCode('ts', 'const value = 1', true);

    expect(lowlightMocks.highlight).toHaveBeenCalledOnce();
    expect(second).toBe(first);
  });
});
