/**
 * @file builtin-memory.test.ts
 * @description edit_memory 工具测试（分区级覆盖模式）
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MemoryCategory } from '@/ai/memory/types';
import { createBuiltinEditMemoryTool } from '@/ai/tools/builtin/MemoryTool';
import { useMemoryStore } from '@/stores/ai/memory';

const inMemoryFs = new Map<string, { content: string }>();
const homeDir = '/mock/home';
let shouldFailWrite = false;

vi.mock('@/shared/platform', () => ({
  native: {
    getHomeDir: vi.fn(async () => homeDir),
    getPathStatus: vi.fn(async (filePath: string) => ({ exists: inMemoryFs.has(filePath), isFile: inMemoryFs.has(filePath), isDirectory: false })),
    readFile: vi.fn(async (filePath: string) => {
      const file = inMemoryFs.get(filePath);
      if (!file) throw new Error(`ENOENT: ${filePath}`);
      return { content: file.content };
    }),
    writeFile: vi.fn(async (filePath: string, content: string) => {
      if (shouldFailWrite) throw new Error('mock write failed');
      inMemoryFs.set(filePath, { content });
    })
  }
}));

vi.mock('@/shared/platform/electron-api', () => ({
  getElectronAPI: vi.fn(() => ({ ensureDir: vi.fn(async () => undefined) }))
}));

vi.stubGlobal('localStorage', {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
  clear: () => undefined
});

const edit = () => createBuiltinEditMemoryTool();

/**
 * edit_memory 成功结果中的分区快照
 */
interface EditMemorySectionSnapshot {
  /** 分区名称 */
  category: MemoryCategory;
  /** 分区条目文本 */
  items: string[];
  /** 分区条目数量 */
  count: number;
}

/**
 * edit_memory 成功结果数据
 */
interface EditMemorySuccessData {
  /** 修改摘要 */
  summary: string;
  /** 所有分区快照 */
  sections: EditMemorySectionSnapshot[];
}

/**
 * 将工具结果断言为成功结果数据
 * @param result - 工具执行结果
 * @returns 成功结果数据
 */
function expectSuccessData(result: Awaited<ReturnType<ReturnType<typeof edit>['execute']>>): EditMemorySuccessData {
  expect(result.status).toBe('success');
  if (result.status !== 'success') {
    throw new Error('Expected edit_memory to succeed');
  }
  return result.data as EditMemorySuccessData;
}

describe('edit_memory', () => {
  beforeEach(() => {
    inMemoryFs.clear();
    shouldFailWrite = false;
    setActivePinia(createPinia());
  });

  it('sets items in a single section', async () => {
    const r = await edit().execute({
      sections: { Facts: ['项目用 Vue 3', '团队有 3 人'] }
    });
    const data = expectSuccessData(r);
    expect(data.summary).toContain('Facts');
    const facts = data.sections.find((s: EditMemorySectionSnapshot) => s.category === 'Facts');
    expect(facts?.items).toEqual(['项目用 Vue 3', '团队有 3 人']);
  });

  it('overwrites existing section content', async () => {
    await edit().execute({ sections: { Facts: ['旧事实 A', '旧事实 B'] } });
    const r = await edit().execute({ sections: { Facts: ['新事实'] } });

    const data = expectSuccessData(r);
    const facts = data.sections.find((s: EditMemorySectionSnapshot) => s.category === 'Facts');
    expect(facts?.items).toEqual(['新事实']);
  });

  it('clears section when given empty array', async () => {
    await edit().execute({ sections: { Facts: ['旧事实'] } });
    const r = await edit().execute({ sections: { Facts: [] } });

    const data = expectSuccessData(r);
    const facts = data.sections.find((s: EditMemorySectionSnapshot) => s.category === 'Facts');
    expect(facts?.items).toEqual([]);
  });

  it('does not affect unmentioned sections', async () => {
    await edit().execute({ sections: { Facts: ['事实'] } });
    await edit().execute({ sections: { Preferences: ['偏好'] } });

    // Facts should still be there
    const store = useMemoryStore();
    const facts = store.doc.sections.find((s) => s.category === 'Facts')!;
    expect(facts.items[0].content).toBe('事实');

    const prefs = store.doc.sections.find((s) => s.category === 'Preferences')!;
    expect(prefs.items[0].content).toBe('偏好');
  });

  it('updates multiple sections at once', async () => {
    const r = await edit().execute({
      sections: {
        Facts: ['事实 1'],
        Preferences: ['偏好 1'],
        Habits: ['习惯 1']
      }
    });
    const data = expectSuccessData(r);
    expect(data.summary).toContain('Facts');
    expect(data.summary).toContain('Preferences');
    expect(data.summary).toContain('Habits');
  });

  it('rejects invalid section name', async () => {
    const input = { sections: { InvalidSection: ['x'] } } as unknown as Parameters<ReturnType<typeof edit>['execute']>[0];
    const r = await edit().execute(input);
    expect(r.status).toBe('failure');
  });

  it('rejects when exceeding max items', async () => {
    const items = Array.from({ length: 21 }, (_, i) => `条目 ${i}`);
    const r = await edit().execute({ sections: { Facts: items } });
    expect(r.status).toBe('failure');
  });

  it('filters empty strings', async () => {
    const r = await edit().execute({ sections: { Facts: ['', '   ', '有效条目'] } });
    const data = expectSuccessData(r);
    const facts = data.sections.find((s: EditMemorySectionSnapshot) => s.category === 'Facts');
    expect(facts?.items).toEqual(['有效条目']);
  });

  it('rejects non-string section items', async () => {
    const input = { sections: { Facts: ['有效条目', 123] } } as unknown as Parameters<ReturnType<typeof edit>['execute']>[0];
    const r = await edit().execute(input);

    expect(r.status).toBe('failure');
  });

  it('returns failure when memory cannot be saved', async () => {
    shouldFailWrite = true;

    const r = await edit().execute({ sections: { Facts: ['无法保存的事实'] } });

    expect(r.status).toBe('failure');
  });

  it('requires at least one section', async () => {
    const r = await edit().execute({ sections: {} });
    expect(r.status).toBe('failure');
  });
});
