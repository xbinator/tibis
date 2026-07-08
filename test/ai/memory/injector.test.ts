/**
 * @file injector.test.ts
 * @description 记忆 system prompt 注入与相关性筛选测试。
 */
import { describe, expect, it } from 'vitest';
import { buildSystemPromptContext } from '@/ai/memory/injector';
import type { BuildMemoryContextOptions, MemoryDoc } from '@/ai/memory/types';

/** 测试期记忆调试条目。 */
interface TestMemoryDebugItem {
  /** 分区名称。 */
  category: string;
  /** 条目预览文本。 */
  preview: string;
}

/** 测试期记忆调试信息。 */
interface TestMemorySelectionDebugInfo {
  /** 注入模式。 */
  mode: string;
  /** 召回关键词。 */
  keywords: string[];
  /** 最终选中的条目。 */
  selectedItems: TestMemoryDebugItem[];
  /** 最终未注入的条目。 */
  droppedItems: TestMemoryDebugItem[];
}

/** 带调试回调的测试构建选项。 */
type TestBuildMemoryContextOptions = BuildMemoryContextOptions & {
  /** 记忆选择调试回调。 */
  onSelectionDebug?: (debugInfo: TestMemorySelectionDebugInfo) => void;
};

/**
 * 创建测试用记忆文档。
 * @returns 包含多分区记忆的文档
 */
function createMemoryDoc(): MemoryDoc {
  return {
    sections: [
      { category: 'Instructions', items: [{ content: '始终使用 TypeScript 回答代码问题' }] },
      {
        category: 'Preferences',
        items: [{ content: '用户喜欢简洁回答' }, { content: '用户研究经济学案例' }, { content: '用户喜欢先看结论' }, { content: '用户偏好中文注释' }]
      },
      { category: 'Habits', items: [{ content: '用户习惯先写测试再实现' }] },
      { category: 'Facts', items: [{ content: '用户正在研究经济学中的价格弹性' }] },
      { category: 'Projects', items: [{ content: 'tibis 项目使用 Vue 3 和 Electron' }] },
      { category: 'Current Context', items: [{ content: '当前正在优化 src/ai/memory/injector.ts 的全局记忆注入策略' }] }
    ]
  };
}

describe('buildSystemPromptContext', (): void => {
  it('accepts relevant memory selection options', (): void => {
    const options: BuildMemoryContextOptions = {
      selection: {
        userMessage: '帮我看看 tibis 的记忆注入',
        references: ['src/ai/memory/injector.ts'],
        workspaceRoot: '/workspace/tibis'
      }
    };

    const context = buildSystemPromptContext(createMemoryDoc(), options);

    expect(context).toContain('<user_memory>');
  });

  it('keeps instructions and only relevant project memory in relevant mode', (): void => {
    const context = buildSystemPromptContext(createMemoryDoc(), {
      selection: {
        userMessage: 'tibis 的 injector 怎么优化',
        references: ['src/ai/memory/injector.ts'],
        workspaceRoot: '/workspace/tibis'
      }
    });

    expect(context).toContain('始终使用 TypeScript 回答代码问题');
    expect(context).toContain('tibis 项目使用 Vue 3 和 Electron');
    expect(context).toContain('当前正在优化 src/ai/memory/injector.ts 的全局记忆注入策略');
    expect(context).not.toContain('用户习惯先写测试再实现');
    expect(context).not.toContain('用户正在研究经济学中的价格弹性');
  });

  it('keeps at most three core preferences when no preference matches', (): void => {
    const context = buildSystemPromptContext(createMemoryDoc(), {
      selection: {
        userMessage: '帮我解释 tibis 架构',
        references: [],
        workspaceRoot: '/workspace/tibis'
      }
    });

    expect(context).toContain('用户喜欢简洁回答');
    expect(context).toContain('用户研究经济学案例');
    expect(context).toContain('用户喜欢先看结论');
    expect(context).not.toContain('用户偏好中文注释');
  });

  it('matches Chinese substrings after normalization', (): void => {
    const context = buildSystemPromptContext(createMemoryDoc(), {
      selection: {
        userMessage: '经济',
        references: [],
        workspaceRoot: '/workspace/tibis'
      }
    });

    expect(context).toContain('用户研究经济学案例');
    expect(context).toContain('用户正在研究经济学中的价格弹性');
  });

  it('recalls memory from long Chinese user messages', (): void => {
    const context = buildSystemPromptContext(createMemoryDoc(), {
      selection: {
        userMessage: '现在记忆是全部发送的是否可以优化一下',
        references: [],
        workspaceRoot: '/workspace/other'
      }
    });

    expect(context).toContain('当前正在优化 src/ai/memory/injector.ts 的全局记忆注入策略');
  });

  it('uses Message.references paths as recall keywords', (): void => {
    const context = buildSystemPromptContext(createMemoryDoc(), {
      selection: {
        userMessage: '看下这个文件',
        references: ['src/ai/memory/injector.ts'],
        workspaceRoot: '/workspace/tibis'
      }
    });

    expect(context).toContain('src/ai/memory/injector.ts');
  });

  it('keeps full mode compatible with old complete-memory behavior', (): void => {
    const context = buildSystemPromptContext(createMemoryDoc(), {
      selection: {
        userMessage: 'tibis',
        references: [],
        workspaceRoot: '/workspace/tibis',
        mode: 'full'
      }
    });

    expect(context).toContain('用户习惯先写测试再实现');
    expect(context).toContain('用户正在研究经济学中的价格弹性');
  });

  it('keeps numeric maxChars compatibility for existing callers', (): void => {
    const context = buildSystemPromptContext(createMemoryDoc(), 4000);

    expect(context).toContain('用户习惯先写测试再实现');
    expect(context).toContain('用户正在研究经济学中的价格弹性');
  });

  it('prunes relevant mode by item instead of dropping an entire selected section', (): void => {
    const doc: MemoryDoc = {
      sections: [
        {
          category: 'Instructions',
          items: [{ content: '规则一 TypeScript' }, { content: '规则二 测试优先' }, { content: '规则三 保持简洁' }]
        },
        { category: 'Preferences', items: [] },
        { category: 'Habits', items: [] },
        { category: 'Facts', items: [] },
        {
          category: 'Projects',
          items: [{ content: 'tibis memory selector one' }, { content: 'tibis memory selector two' }, { content: 'tibis memory selector three' }]
        },
        { category: 'Current Context', items: [] }
      ]
    };

    const context = buildSystemPromptContext(doc, {
      maxChars: 210,
      selection: {
        userMessage: 'tibis memory selector',
        references: [],
        workspaceRoot: '/workspace/tibis'
      }
    });

    expect(context).toContain('# Instructions');
    expect(context).toContain('规则一 TypeScript');
    expect(context).toContain('# Projects');
    expect(context).toMatch(/tibis memory selector (one|two|three)/);
    expect(context.length).toBeLessThanOrEqual(210);
  });

  it('prioritizes highly relevant items over fallback preferences when pruning relevant mode', (): void => {
    const doc: MemoryDoc = {
      sections: [
        { category: 'Instructions', items: [{ content: '规则' }] },
        { category: 'Preferences', items: [{ content: '用户喜欢简洁回答' }] },
        { category: 'Habits', items: [] },
        { category: 'Facts', items: [] },
        { category: 'Projects', items: [{ content: 'tibis memory selector target target target' }] },
        { category: 'Current Context', items: [] }
      ]
    };

    const context = buildSystemPromptContext(doc, {
      maxChars: 165,
      selection: {
        userMessage: 'tibis memory selector target',
        references: [],
        workspaceRoot: '/workspace/tibis'
      }
    });

    expect(context).toContain('tibis memory selector target target target');
    expect(context).not.toContain('用户喜欢简洁回答');
    expect(context.length).toBeLessThanOrEqual(165);
  });

  it('reports memory selection debug information', (): void => {
    let debugInfo: TestMemorySelectionDebugInfo | undefined;
    const options: TestBuildMemoryContextOptions = {
      selection: {
        userMessage: 'tibis injector',
        references: ['src/ai/memory/injector.ts'],
        workspaceRoot: '/workspace/tibis'
      },
      onSelectionDebug: (nextDebugInfo) => {
        debugInfo = nextDebugInfo;
      }
    };

    buildSystemPromptContext(createMemoryDoc(), options);

    expect(debugInfo).toMatchObject({
      mode: 'relevant',
      keywords: expect.arrayContaining(['tibis', 'injector']),
      selectedItems: expect.arrayContaining([expect.objectContaining({ category: 'Projects', preview: expect.stringContaining('tibis 项目') })]),
      droppedItems: expect.arrayContaining([expect.objectContaining({ category: 'Habits', preview: expect.stringContaining('先写测试') })])
    });
  });
});
