/**
 * @file builtin-memory.test.ts
 * @description edit_memory 工具测试（分区级覆盖模式）
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBuiltinEditMemoryTool } from '@/ai/tools/builtin/MemoryTool';
import { useMemoryStore } from '@/stores/ai/memory';

const inMemoryFs = new Map<string, { content: string }>();
const homeDir = '/mock/home';

vi.mock('@/shared/platform', () => ({
  native: {
    getHomeDir: vi.fn(async () => homeDir),
    getPathStatus: vi.fn(async (filePath: string) => ({ exists: inMemoryFs.has(filePath), isFile: inMemoryFs.has(filePath), isDirectory: false })),
    readFile: vi.fn(async (filePath: string) => {
      const file = inMemoryFs.get(filePath);
      if (!file) throw new Error(`ENOENT: ${filePath}`);
      return { content: file.content };
    }),
    writeFile: vi.fn(async (filePath: string, content: string) => { inMemoryFs.set(filePath, { content }); })
  }
}));

vi.mock('@/shared/platform/electron-api', () => ({
  getElectronAPI: vi.fn(() => ({ ensureDir: vi.fn(async () => undefined) }))
}));

vi.stubGlobal('localStorage', {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {}
});

const edit = () => createBuiltinEditMemoryTool();

describe('edit_memory', () => {
  beforeEach(() => {
    inMemoryFs.clear();
    setActivePinia(createPinia());
  });

  it('sets items in a single section', async () => {
    const r = await edit().execute({
      sections: { Facts: ['项目用 Vue 3', '团队有 3 人'] }
    });
    expect(r.status).toBe('success');
    if (r.status === 'success') {
      expect(r.data.summary).toContain('Facts');
      const facts = r.data.sections.find((s) => s.category === 'Facts');
      expect(facts?.items).toEqual(['项目用 Vue 3', '团队有 3 人']);
    }
  });

  it('overwrites existing section content', async () => {
    await edit().execute({ sections: { Facts: ['旧事实 A', '旧事实 B'] } });
    const r = await edit().execute({ sections: { Facts: ['新事实'] } });

    if (r.status === 'success') {
      const facts = r.data.sections.find((s) => s.category === 'Facts');
      expect(facts?.items).toEqual(['新事实']);
    }
  });

  it('clears section when given empty array', async () => {
    await edit().execute({ sections: { Facts: ['旧事实'] } });
    const r = await edit().execute({ sections: { Facts: [] } });

    if (r.status === 'success') {
      const facts = r.data.sections.find((s) => s.category === 'Facts');
      expect(facts?.items).toEqual([]);
    }
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
    expect(r.status).toBe('success');
    if (r.status === 'success') {
      expect(r.data.summary).toContain('Facts');
      expect(r.data.summary).toContain('Preferences');
      expect(r.data.summary).toContain('Habits');
    }
  });

  it('rejects invalid section name', async () => {
    const r = await edit().execute({ sections: { InvalidSection: ['x'] } });
    expect(r.status).toBe('failure');
  });

  it('rejects when exceeding max items', async () => {
    const items = Array.from({ length: 21 }, (_, i) => `条目 ${i}`);
    const r = await edit().execute({ sections: { Facts: items } });
    expect(r.status).toBe('failure');
  });

  it('filters empty strings', async () => {
    const r = await edit().execute({ sections: { Facts: ['', '   ', '有效条目'] } });
    if (r.status === 'success') {
      const facts = r.data.sections.find((s) => s.category === 'Facts');
      expect(facts?.items).toEqual(['有效条目']);
    }
  });

  it('requires at least one section', async () => {
    const r = await edit().execute({ sections: {} });
    expect(r.status).toBe('failure');
  });
});
