/**
 * @file builtin-memory.test.ts
 * @description edit_memory 工具测试
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

const storage = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { storage.set(key, value); },
  removeItem: (key: string) => { storage.delete(key); },
  clear: () => { storage.clear(); }
});

const edit = () => createBuiltinEditMemoryTool();

describe('edit_memory', () => {
  beforeEach(() => {
    inMemoryFs.clear();
    storage.clear();
    setActivePinia(createPinia());
  });

  // ── add ──
  it('adds item', async () => {
    const r = await edit().execute({ action: 'add', section: 'Facts', content: '项目用 Vue 3' });
    expect(r.status).toBe('success');
  });

  it('rejects duplicate', async () => {
    await edit().execute({ action: 'add', section: 'Facts', content: 'x' });
    const r = await edit().execute({ action: 'add', section: 'Facts', content: 'x' });
    expect((r as { status: 'success'; data: { summary: string } }).data.summary).toContain('未重复添加');
  });

  it('rejects when full', async () => {
    for (let i = 0; i < 20; i++) await edit().execute({ action: 'add', section: 'Facts', content: `条目${i}` });
    expect((await edit().execute({ action: 'add', section: 'Facts', content: '超限' })).status).toBe('failure');
  });

  it('requires content for add', async () => {
    expect((await edit().execute({ action: 'add', section: 'Facts', content: '' })).status).toBe('failure');
  });

  // ── update ──
  it('updates by index', async () => {
    await edit().execute({ action: 'add', section: 'Facts', content: '旧' });
    const r = await edit().execute({ action: 'update', section: 'Facts', index: 0, content: '新' });
    expect(r.status).toBe('success');
  });

  it('update fails when no match', async () => {
    expect((await edit().execute({ action: 'update', section: 'Facts', content: '不存在' })).status).toBe('failure');
  });

  // ── remove ──
  it('removes by index', async () => {
    await edit().execute({ action: 'add', section: 'Facts', content: '删' });
    const r = await edit().execute({ action: 'remove', section: 'Facts', index: 0 });
    expect(r.status).toBe('success');
  });

  it('removes by content', async () => {
    await edit().execute({ action: 'add', section: 'Facts', content: '删' });
    expect((await edit().execute({ action: 'remove', section: 'Facts', content: '删' })).status).toBe('success');
  });

  it('remove fails when no match', async () => {
    expect((await edit().execute({ action: 'remove', section: 'Facts', content: '不存在' })).status).toBe('failure');
  });

  // ── store consistency ──
  it('writes persist in store', async () => {
    await edit().execute({ action: 'add', section: 'Facts', content: '新事实' });
    const store = useMemoryStore();
    expect(store.doc.sections.find((s) => s.category === 'Facts')!.items.some((i) => i.content === '新事实')).toBe(true);
  });
});
