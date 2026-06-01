/**
 * @file builtin-memory.test.ts
 * @description 记忆管理工具测试（read_memory + edit_memory 拆分版）
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBuiltinEditMemoryTool, createBuiltinReadMemoryTool, EDIT_MEMORY_TOOL_NAME, READ_MEMORY_TOOL_NAME } from '@/ai/tools/builtin/MemoryTool';
import { useMemoryStore } from '@/stores/ai/memory';

const inMemoryFs = new Map<string, { content: string }>();
const homeDir = '/mock/home';

vi.mock('@/shared/platform', () => ({
  native: {
    getHomeDir: vi.fn(async () => homeDir),
    getPathStatus: vi.fn(async (filePath: string) => ({
      exists: inMemoryFs.has(filePath),
      isFile: inMemoryFs.has(filePath),
      isDirectory: false
    })),
    readFile: vi.fn(async (filePath: string) => {
      const file = inMemoryFs.get(filePath);
      if (!file) throw new Error(`ENOENT: ${filePath}`);
      return { content: file.content };
    }),
    writeFile: vi.fn(async (filePath: string, content: string) => {
      inMemoryFs.set(filePath, { content });
    })
  }
}));

vi.mock('@/shared/platform/electron-api', () => ({
  getElectronAPI: vi.fn(() => ({
    ensureDir: vi.fn(async () => undefined)
  }))
}));

const storage = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { storage.set(key, value); },
  removeItem: (key: string) => { storage.delete(key); },
  clear: () => { storage.clear(); }
});

function readTool() { return createBuiltinReadMemoryTool(); }
function editTool() { return createBuiltinEditMemoryTool(); }

describe('read_memory tool', () => {
  beforeEach(() => {
    inMemoryFs.clear();
    storage.clear();
    setActivePinia(createPinia());
  });

  it('returns empty memory', async () => {
    const result = await readTool().execute();
    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.data.summary).toContain('共 0 条');
    }
  });

  it('returns existing memory', async () => {
    const store = useMemoryStore();
    store.doc.sections.find((s) => s.category === 'Facts')!.items.push({ content: '项目用 Vue 3' });
    await store.saveMemory();

    const result = await readTool().execute();
    if (result.status === 'success') {
      const facts = result.data.sections.find((s: { category: string }) => s.category === 'Facts');
      expect(facts?.items).toContain('项目用 Vue 3');
    }
  });
});

describe('edit_memory tool', () => {
  beforeEach(() => {
    inMemoryFs.clear();
    storage.clear();
    setActivePinia(createPinia());
  });

  // add
  describe('add', () => {
    it('adds a new item', async () => {
      const result = await editTool().execute({ action: 'add', section: 'Facts', content: '项目用 Vue 3' });
      expect(result.status).toBe('success');
    });

    it('rejects duplicate by exact match', async () => {
      await editTool().execute({ action: 'add', section: 'Facts', content: '项目用 Vue 3' });
      const result = await editTool().execute({ action: 'add', section: 'Facts', content: '项目用 Vue 3' });
      if (result.status === 'success') {
        expect(result.data.summary).toContain('未重复添加');
      }
    });

    it('rejects when section full', async () => {
      for (let i = 0; i < 20; i++) {
        await editTool().execute({ action: 'add', section: 'Facts', content: `条目 ${i + 1}` });
      }
      const result = await editTool().execute({ action: 'add', section: 'Facts', content: '超限' });
      expect(result.status).toBe('failure');
    });

    it('requires content', async () => {
      const result = await editTool().execute({ action: 'add', section: 'Facts', content: '' });
      expect(result.status).toBe('failure');
    });
  });

  // update
  describe('update', () => {
    it('updates by index', async () => {
      await editTool().execute({ action: 'add', section: 'Facts', content: '旧内容' });
      const result = await editTool().execute({ action: 'update', section: 'Facts', index: 0, content: '新内容' });

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        const facts = result.data.sections.find((s: { category: string }) => s.category === 'Facts');
        expect(facts?.items).toContain('新内容');
        expect(facts?.items).not.toContain('旧内容');
      }
    });

    it('fails when no match', async () => {
      const result = await editTool().execute({ action: 'update', section: 'Facts', content: '不存在' });
      expect(result.status).toBe('failure');
    });
  });

  // remove
  describe('remove', () => {
    it('removes by index', async () => {
      await editTool().execute({ action: 'add', section: 'Facts', content: '删除我' });
      const result = await editTool().execute({ action: 'remove', section: 'Facts', index: 0 });

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.data.summary).toContain('删除我');
      }
    });

    it('removes by exact content match', async () => {
      await editTool().execute({ action: 'add', section: 'Facts', content: '删除我' });
      const result = await editTool().execute({ action: 'remove', section: 'Facts', content: '删除我' });
      expect(result.status).toBe('success');
    });

    it('fails when no match', async () => {
      const result = await editTool().execute({ action: 'remove', section: 'Facts', content: '不存在' });
      expect(result.status).toBe('failure');
    });
  });

  // errors
  describe('errors', () => {
    it('invalid section returns failure', async () => {
      const result = await editTool().execute({ action: 'add', section: 'Invalid' as 'Facts', content: 'x' });
      expect(result.status).toBe('failure');
    });
  });
});

describe('tool names', () => {
  it('has distinct names', () => {
    expect(READ_MEMORY_TOOL_NAME).toBe('read_memory');
    expect(EDIT_MEMORY_TOOL_NAME).toBe('edit_memory');
    expect(READ_MEMORY_TOOL_NAME).not.toBe(EDIT_MEMORY_TOOL_NAME);
  });
});

describe('store consistency', () => {
  beforeEach(() => {
    inMemoryFs.clear();
    storage.clear();
    setActivePinia(createPinia());
  });

  it('edit_memory writes reflect in read_memory', async () => {
    await editTool().execute({ action: 'add', section: 'Facts', content: '新事实' });

    const result = await readTool().execute();
    if (result.status === 'success') {
      const facts = result.data.sections.find((s: { category: string }) => s.category === 'Facts');
      expect(facts?.items).toContain('新事实');
    }
  });
});
