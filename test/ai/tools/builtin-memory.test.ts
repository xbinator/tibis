/**
 * @file builtin-memory.test.ts
 * @description 记忆管理工具（edit_memory）测试
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBuiltinMemoryTool, EDIT_MEMORY_TOOL_NAME } from '@/ai/tools/builtin/MemoryTool';
import { useMemoryStore } from '@/stores/ai/memory';

/** 内存文件系统，用于模拟 native 文件读写 */
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
  getItem(key: string): string | null {
    return storage.get(key) ?? null;
  },
  setItem(key: string, value: string): void {
    storage.set(key, value);
  },
  removeItem(key: string): void {
    storage.delete(key);
  },
  clear(): void {
    storage.clear();
  }
});

/**
 * 创建工具实例
 * @returns 记忆管理工具
 */
function createTool() {
  return createBuiltinMemoryTool();
}

describe('edit_memory tool', () => {
  beforeEach(() => {
    inMemoryFs.clear();
    storage.clear();
    setActivePinia(createPinia());
  });

  // ===== read =====

  describe('read', () => {
    it('returns empty memory when no file exists', async () => {
      const tool = createTool();
      const result = await tool.execute({ action: 'read' });

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.data.summary).toContain('共 0 条记忆');
        expect(result.data.sections.every((s) => s.items.length === 0)).toBe(true);
      }
    });

    it('reads memory from existing file', async () => {
      const store = useMemoryStore();
      const factsSection = store.doc.sections.find((s) => s.category === 'Facts')!;
      factsSection.items.push({ content: '项目使用 Vue 3' });
      factsSection.items.push({ content: '团队有 3 人' });
      await store.saveMemory();

      const tool = createTool();
      const result = await tool.execute({ action: 'read' });

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        const facts = result.data.sections.find((s) => s.category === 'Facts');
        expect(facts?.items).toContain('项目使用 Vue 3');
        expect(facts?.items).toContain('团队有 3 人');
        expect(result.data.summary).toContain('共 2 条记忆');
      }
    });
  });

  // ===== add =====

  describe('add', () => {
    it('adds a new item to an empty section', async () => {
      const tool = createTool();
      const result = await tool.execute({
        action: 'add',
        section: 'Facts',
        content: '项目使用 Vue 3'
      });

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.data.summary).toContain('已向 Facts 分区添加');
        expect(result.data.summary).toContain('项目使用 Vue 3');
        const facts = result.data.sections.find((s) => s.category === 'Facts');
        expect(facts?.items).toContain('项目使用 Vue 3');
      }
    });

    it('adds to an existing section without affecting other items', async () => {
      const tool = createTool();

      await tool.execute({ action: 'add', section: 'Facts', content: '第一条' });
      await tool.execute({ action: 'add', section: 'Facts', content: '第二条' });

      const result = await tool.execute({ action: 'read' });
      if (result.status === 'success') {
        const facts = result.data.sections.find((s) => s.category === 'Facts');
        expect(facts?.items).toHaveLength(2);
      }
    });

    it('rejects duplicate content with exact match', async () => {
      const tool = createTool();
      await tool.execute({ action: 'add', section: 'Facts', content: '项目使用 Vue 3' });

      const result = await tool.execute({
        action: 'add',
        section: 'Facts',
        content: '项目使用 Vue 3'
      });

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.data.summary).toContain('未重复添加');
      }

      // Verify only one entry exists
      const readResult = await tool.execute({ action: 'read' });
      if (readResult.status === 'success') {
        const facts = readResult.data.sections.find((s) => s.category === 'Facts');
        expect(facts?.items.filter((i) => i === '项目使用 Vue 3')).toHaveLength(1);
      }
    });

    it('rejects adding to a section that has reached the limit', async () => {
      const tool = createTool();

      // Fill the section to max (20 items)
      for (let i = 0; i < 20; i++) {
        await tool.execute({ action: 'add', section: 'Facts', content: `条目 ${i + 1}` });
      }

      const result = await tool.execute({
        action: 'add',
        section: 'Facts',
        content: '超限条目'
      });

      expect(result.status).toBe('failure');
      if (result.status === 'failure') {
        expect(result.error.code).toBe('EXECUTION_FAILED');
        expect(result.error.message).toContain('已达上限');
      }
    });

    it('requires content for add', async () => {
      const tool = createTool();
      const result = await tool.execute({ action: 'add', section: 'Facts', content: '' });

      expect(result.status).toBe('failure');
      if (result.status === 'failure') {
        expect(result.error.code).toBe('INVALID_INPUT');
      }
    });

    it('requires section for add', async () => {
      const tool = createTool();
      const result = await tool.execute({ action: 'add', content: 'some value' });

      expect(result.status).toBe('failure');
    });
  });

  // ===== update =====

  describe('update', () => {
    it('updates an item by index', async () => {
      const tool = createTool();
      await tool.execute({ action: 'add', section: 'Facts', content: '旧内容' });

      const result = await tool.execute({
        action: 'update',
        section: 'Facts',
        index: 0,
        content: '新内容'
      });

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.data.summary).toContain('旧内容');
        expect(result.data.summary).toContain('新内容');
        const facts = result.data.sections.find((s) => s.category === 'Facts');
        expect(facts?.items).toContain('新内容');
        expect(facts?.items).not.toContain('旧内容');
      }
    });

    it('updates an item by index with new content', async () => {
      const tool = createTool();
      await tool.execute({ action: 'add', section: 'Facts', content: '助手名为大宝' });

      // AI 应先 read 获取索引，再用 index + 新内容更新
      const result = await tool.execute({
        action: 'update',
        section: 'Facts',
        index: 0,
        content: '助手名为宝宝'
      });

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.data.summary).toContain('助手名为大宝');
        expect(result.data.summary).toContain('助手名为宝宝');
        const facts = result.data.sections.find((s) => s.category === 'Facts');
        expect(facts?.items).toContain('助手名为宝宝');
        expect(facts?.items).not.toContain('助手名为大宝');
      }
    });

    it('finds existing item by content but content is same as old (no-op)', async () => {
      const tool = createTool();
      await tool.execute({ action: 'add', section: 'Facts', content: '助手名为大宝' });

      // 用 content 匹配找到条目，但 content 没变=无实际改动
      const result = await tool.execute({
        action: 'update',
        section: 'Facts',
        content: '助手名为大宝'
      });

      // 虽然 "更新" 成功，但内容未变
      expect(result.status).toBe('success');
      if (result.status === 'success') {
        const facts = result.data.sections.find((s) => s.category === 'Facts');
        expect(facts?.items).toContain('助手名为大宝');
        expect(facts?.items).toHaveLength(1);
      }
    });

    it('fails when no matching item found', async () => {
      const tool = createTool();
      await tool.execute({ action: 'add', section: 'Facts', content: '项目使用 Vue 3' });

      const result = await tool.execute({
        action: 'update',
        section: 'Facts',
        content: '不存在的内容'
      });

      expect(result.status).toBe('failure');
    });

    it('requires content for update', async () => {
      const tool = createTool();
      const result = await tool.execute({ action: 'update', section: 'Facts', content: '' });

      expect(result.status).toBe('failure');
    });
  });

  // ===== remove =====

  describe('remove', () => {
    it('removes an item by index', async () => {
      const tool = createTool();
      await tool.execute({ action: 'add', section: 'Facts', content: '将被删除' });

      const result = await tool.execute({
        action: 'remove',
        section: 'Facts',
        index: 0
      });

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        const facts = result.data.sections.find((s) => s.category === 'Facts');
        expect(facts?.items).not.toContain('将被删除');
        expect(result.data.summary).toContain('将被删除');
      }
    });

    it('removes an item by exact content match', async () => {
      const tool = createTool();
      await tool.execute({ action: 'add', section: 'Facts', content: '将被删除' });

      const result = await tool.execute({
        action: 'remove',
        section: 'Facts',
        content: '将被删除'
      });

      expect(result.status).toBe('success');
    });

    it('fails when no matching item found', async () => {
      const tool = createTool();

      const result = await tool.execute({
        action: 'remove',
        section: 'Facts',
        content: '不存在'
      });

      expect(result.status).toBe('failure');
    });
  });

  // ===== 错误情况 =====

  describe('error cases', () => {
    it('returns error for unknown action', async () => {
      const tool = createTool();
      const result = await tool.execute({ action: 'unknown' as 'read' });

      expect(result.status).toBe('failure');
    });

    it('returns error for invalid section name', async () => {
      const tool = createTool();
      const result = await tool.execute({
        action: 'add',
        section: 'InvalidSection' as 'Facts',
        content: 'test'
      });

      expect(result.status).toBe('failure');
    });
  });

  // ===== Store 一致性 =====

  describe('store consistency', () => {
    it('tool writes are reflected in store cache', async () => {
      const tool = createTool();
      const store = useMemoryStore();

      // Initially empty
      await store.loadMemory();
      expect(store.isEmpty).toBe(true);

      // Add via tool
      await tool.execute({ action: 'add', section: 'Facts', content: '新事实' });

      // Store should reflect the change
      const facts = store.doc.sections.find((s) => s.category === 'Facts');
      expect(facts?.items.some((i) => i.content === '新事实')).toBe(true);
    });

    it('store changes are readable via tool read', async () => {
      const tool = createTool();
      const store = useMemoryStore();
      await store.loadMemory();

      const facts = store.doc.sections.find((s) => s.category === 'Facts')!;
      facts.items.push({ content: '从 Store 添加' });
      await store.saveMemory();

      const result = await tool.execute({ action: 'read' });
      if (result.status === 'success') {
        const factsRead = result.data.sections.find((s) => s.category === 'Facts');
        expect(factsRead?.items).toContain('从 Store 添加');
      }
    });
  });
});
