/**
 * @file skill.test.ts
 * @description Skill Store 目录索引与内容懒加载测试。
 * @vitest-environment jsdom
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import type { SkillScannerAPI } from '@/ai/skill';
import { local } from '@/shared/storage/base';
import { useSkillStore } from '@/stores/ai/skill';

/** Skill 测试文件路径。 */
const SKILL_FILE_PATH = '/Users/test/.agents/skills/weather/SKILL.md';

/**
 * Skill 扫描器测试 API。
 */
interface SkillScannerAPIMock extends SkillScannerAPI {
  /** 读取文件 mock。 */
  readFile: Mock<SkillScannerAPI['readFile']>;
  /** 读取目录 mock。 */
  readWorkspaceDirectory: Mock<SkillScannerAPI['readWorkspaceDirectory']>;
}

/**
 * 可由测试控制完成时机的 Promise。
 */
interface Deferred<T> {
  /** 延迟 Promise。 */
  promise: Promise<T>;
  /** 完成 Promise。 */
  resolve: (value: T) => void;
  /** 拒绝 Promise。 */
  reject: (reason: Error) => void;
}

/**
 * 创建可控 Promise。
 * @returns 可控 Promise
 */
function createDeferred<T>(): Deferred<T> {
  let resolvePromise: (value: T) => void = (): void => undefined;
  let rejectPromise: (reason: Error) => void = (): void => undefined;
  const promise = new Promise<T>((resolve: (value: T) => void, reject: (reason: Error) => void): void => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

/**
 * 创建 Skill Markdown。
 * @param body - Skill 指令正文
 * @param name - Skill frontmatter 名称
 * @returns 完整 Skill Markdown
 */
function createSkillMarkdown(body: string, name = 'weather'): string {
  return ['---', `name: ${name}`, 'description: Weather instructions', '---', body].join('\n');
}

/**
 * 创建 Skill Store 测试 API。
 * @param content - 首次读取的入口文件内容
 * @returns 扫描器测试 API
 */
function createScannerAPI(content = createSkillMarkdown('initial instructions')): SkillScannerAPIMock {
  return {
    readFile: vi.fn<SkillScannerAPI['readFile']>().mockResolvedValue({ content }),
    readWorkspaceDirectory: vi.fn<SkillScannerAPI['readWorkspaceDirectory']>().mockResolvedValue({
      entries: [{ name: 'weather', type: 'directory' }]
    })
  };
}

describe('skill store lazy content', (): void => {
  beforeEach((): void => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('initializes directory entries without reading SKILL.md', async (): Promise<void> => {
    const api = createScannerAPI();
    const store = useSkillStore();

    await store.init('/Users/test', api);

    expect(store.initialized).toBe(true);
    expect(store.skills).toEqual([
      {
        id: 'weather',
        source: 'global',
        dirPath: '/Users/test/.agents/skills/weather',
        filePath: SKILL_FILE_PATH,
        enabled: true,
        revision: 0
      }
    ]);
    expect(api.readFile).not.toHaveBeenCalled();
  });

  it('loads a Skill once and returns the cached entry afterwards', async (): Promise<void> => {
    const api = createScannerAPI();
    const store = useSkillStore();
    await store.init('/Users/test', api);

    const first = await store.getSkill('weather');
    const second = await store.getSkill('weather');

    expect(first?.sourceContent).toContain('initial instructions');
    expect(first?.definition?.content).toBe('initial instructions');
    expect(second).toBe(first);
    expect(api.readFile).toHaveBeenCalledOnce();
  });

  it('shares concurrent first loads for the same Skill', async (): Promise<void> => {
    const api = createScannerAPI();
    const store = useSkillStore();
    await store.init('/Users/test', api);
    const deferred = createDeferred<{ content: string }>();
    api.readFile.mockImplementationOnce((): Promise<{ content: string }> => deferred.promise);

    const first = store.getSkill('weather');
    const second = store.getSkill('weather');
    await vi.waitFor((): void => {
      expect(api.readFile).toHaveBeenCalledOnce();
    });
    deferred.resolve({ content: createSkillMarkdown('shared instructions') });

    expect((await first)?.definition?.content).toBe('shared instructions');
    expect(await second).toBe(await first);
  });

  it('returns the current entry with loadError and retries on the next get', async (): Promise<void> => {
    const api = createScannerAPI();
    const store = useSkillStore();
    await store.init('/Users/test', api);
    api.readFile.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ content: createSkillMarkdown('retried instructions') });

    const failedSkill = await store.getSkill('weather');
    expect(failedSkill?.loadError).toBe('offline');
    expect(failedSkill?.sourceContent).toBeUndefined();
    await expect(store.getSkill('weather')).resolves.toMatchObject({ sourceContent: expect.stringContaining('retried instructions') });
    expect(api.readFile).toHaveBeenCalledTimes(2);
  });

  it('returns undefined when the directory ID does not exist', async (): Promise<void> => {
    const api = createScannerAPI();
    const store = useSkillStore();
    await store.init('/Users/test', api);

    await expect(store.getSkill('missing')).resolves.toBeUndefined();
    expect(api.readFile).not.toHaveBeenCalled();
  });

  it('caches parse failures after a successful read', async (): Promise<void> => {
    const api = createScannerAPI('invalid skill markdown');
    const store = useSkillStore();
    await store.init('/Users/test', api);

    const first = await store.getSkill('weather');
    const second = await store.getSkill('weather');

    expect(first?.sourceContent).toBe('invalid skill markdown');
    expect(first?.definition?.parseError).toContain('Missing YAML frontmatter');
    expect(second).toBe(first);
    expect(api.readFile).toHaveBeenCalledOnce();
  });

  it('does not let a slow first load overwrite application-saved content', async (): Promise<void> => {
    const api = createScannerAPI();
    const store = useSkillStore();
    await store.init('/Users/test', api);
    const deferred = createDeferred<{ content: string }>();
    api.readFile.mockImplementationOnce((): Promise<{ content: string }> => deferred.promise);

    const loading = store.getSkill('weather');
    await vi.waitFor((): void => {
      expect(api.readFile).toHaveBeenCalledOnce();
    });
    store.updateSkillContent('weather', createSkillMarkdown('saved instructions'));
    deferred.resolve({ content: createSkillMarkdown('stale instructions') });

    expect((await loading)?.definition?.content).toBe('saved instructions');
    expect(store.getSkillById('weather')?.definition?.content).toBe('saved instructions');
  });

  it('reloads a replacement directory before resolving a shared first load', async (): Promise<void> => {
    const api = createScannerAPI();
    const store = useSkillStore();
    await store.init('/Users/test', api);
    const deferred = createDeferred<{ content: string }>();
    api.readFile
      .mockImplementationOnce((): Promise<{ content: string }> => deferred.promise)
      .mockResolvedValueOnce({ content: createSkillMarkdown('replacement instructions') });

    const loading = store.getSkill('weather');
    await vi.waitFor((): void => {
      expect(api.readFile).toHaveBeenCalledOnce();
    });
    store.handleSkillDirectory('unlink', '/Users/test/.agents/skills/weather');
    store.handleSkillDirectory('add', '/Users/test/.agents/skills/weather');
    deferred.resolve({ content: createSkillMarkdown('stale instructions') });

    expect((await loading)?.definition?.content).toBe('replacement instructions');
    expect(api.readFile).toHaveBeenCalledTimes(2);
  });

  it('reloads a replacement directory when the stale first load rejects', async (): Promise<void> => {
    const api = createScannerAPI();
    const store = useSkillStore();
    await store.init('/Users/test', api);
    const deferred = createDeferred<{ content: string }>();
    api.readFile
      .mockImplementationOnce((): Promise<{ content: string }> => deferred.promise)
      .mockResolvedValueOnce({ content: createSkillMarkdown('replacement after failure') });

    const loading = store.getSkill('weather');
    await vi.waitFor((): void => {
      expect(api.readFile).toHaveBeenCalledOnce();
    });
    store.handleSkillDirectory('unlink', '/Users/test/.agents/skills/weather');
    store.handleSkillDirectory('add', '/Users/test/.agents/skills/weather');
    deferred.reject(new Error('stale entry removed'));

    expect((await loading)?.definition?.content).toBe('replacement after failure');
    expect(api.readFile).toHaveBeenCalledTimes(2);
  });

  it('updates cached content when the application saves the matching entry file', async (): Promise<void> => {
    const api = createScannerAPI();
    const store = useSkillStore();
    await store.init('/Users/test', api);
    const savedContent = createSkillMarkdown('saved through editor');

    store.handleFileSaved(SKILL_FILE_PATH, savedContent);
    store.handleFileSaved('/Users/test/notes/SKILL.md', createSkillMarkdown('unrelated content'));

    expect(store.getSkillById('weather')?.sourceContent).toBe(savedContent);
    expect(store.getSkillById('weather')?.definition?.content).toBe('saved through editor');
    expect(api.readFile).not.toHaveBeenCalled();
  });

  it('loads all entries while isolating individual failures', async (): Promise<void> => {
    const api = createScannerAPI();
    api.readWorkspaceDirectory.mockResolvedValue({
      entries: [
        { name: 'weather', type: 'directory' },
        { name: 'travel', type: 'directory' }
      ]
    });
    api.readFile.mockImplementation((filePath: string): Promise<{ content: string }> => {
      return filePath.includes('/weather/')
        ? Promise.resolve({ content: createSkillMarkdown('weather instructions') })
        : Promise.reject(new Error('travel offline'));
    });
    const store = useSkillStore();
    await store.init('/Users/test', api);

    const results = await store.getSkills();

    expect(results.map((entry): string => entry.id)).toEqual(['weather', 'travel']);
    expect(store.getSkillById('weather')?.definition?.content).toBe('weather instructions');
    expect(store.getSkillById('travel')?.loadError).toBe('travel offline');
  });

  it('deduplicates enabled Skill names and selects an enabled duplicate', async (): Promise<void> => {
    const api = createScannerAPI();
    api.readWorkspaceDirectory.mockResolvedValue({
      entries: [
        { name: 'weather-primary', type: 'directory' },
        { name: 'weather-secondary', type: 'directory' }
      ]
    });
    api.readFile.mockImplementation((filePath: string): Promise<{ content: string }> => {
      const body = filePath.includes('primary') ? 'primary instructions' : 'secondary instructions';
      return Promise.resolve({ content: createSkillMarkdown(body, 'weather') });
    });
    const store = useSkillStore();
    await store.init('/Users/test', api);
    await store.getSkills();

    expect(store.skills).toHaveLength(2);
    expect(store.getEnabledSkills().map((entry): string => entry.id)).toEqual(['weather-primary']);
    store.toggleSkill('weather-primary');
    expect(store.getEnabledSkills().map((entry): string => entry.id)).toEqual(['weather-secondary']);
    expect(store.getSkillByName('weather')?.id).toBe('weather-secondary');
  });

  it('preserves loaded content and disabled state across directory refreshes', async (): Promise<void> => {
    const api = createScannerAPI();
    const store = useSkillStore();
    await store.init('/Users/test', api);
    await store.getSkill('weather');
    store.toggleSkill('weather');

    await store.refreshSkills();

    expect(store.getSkillById('weather')?.enabled).toBe(false);
    expect(store.getSkillById('weather')?.definition?.content).toBe('initial instructions');
    expect(api.readFile).toHaveBeenCalledOnce();
  });

  it('repeats a directory refresh when a watcher event arrives during scanning', async (): Promise<void> => {
    const api = createScannerAPI();
    api.readWorkspaceDirectory.mockResolvedValueOnce({ entries: [] });
    const store = useSkillStore();
    await store.init('/Users/test', api);
    const deferred = createDeferred<{ entries: Array<{ name: string; type: 'directory' }> }>();
    api.readWorkspaceDirectory
      .mockImplementationOnce((): Promise<{ entries: Array<{ name: string; type: 'directory' }> }> => deferred.promise)
      .mockResolvedValueOnce({ entries: [{ name: 'weather', type: 'directory' }] });

    const refreshing = store.refreshSkills();
    await vi.waitFor((): void => {
      expect(api.readWorkspaceDirectory).toHaveBeenCalledTimes(2);
    });
    store.handleSkillDirectory('add', '/Users/test/.agents/skills/weather');
    deferred.resolve({ entries: [] });
    await refreshing;

    expect(api.readWorkspaceDirectory).toHaveBeenCalledTimes(3);
    expect(store.getSkillById('weather')).toBeDefined();
  });

  it('preserves a disabled ID after directory removal and re-addition', async (): Promise<void> => {
    const api = createScannerAPI();
    const store = useSkillStore();
    await store.init('/Users/test', api);
    store.toggleSkill('weather');
    api.readWorkspaceDirectory.mockResolvedValueOnce({ entries: [] });
    await store.refreshSkills();
    api.readWorkspaceDirectory.mockResolvedValueOnce({ entries: [{ name: 'weather', type: 'directory' }] });

    await store.refreshSkills();

    expect(store.getSkillById('weather')?.enabled).toBe(false);
  });

  it('migrates a legacy disabled Skill name to its directory ID', async (): Promise<void> => {
    local.setItem('skill.disabledNames', ['weather-name']);
    const api = createScannerAPI(createSkillMarkdown('instructions', 'weather-name'));
    const store = useSkillStore();
    await store.init('/Users/test', api);

    await store.getSkill('weather');

    expect(store.getSkillById('weather')?.enabled).toBe(false);
    expect(local.getItem<string[]>('skill.disabledIds')).toEqual(['weather']);
    expect(local.getItem<string[]>('skill.disabledNames')).toEqual([]);
  });

  it('adds and removes directory indices without reading entry content', async (): Promise<void> => {
    const api = createScannerAPI();
    api.readWorkspaceDirectory.mockResolvedValue({ entries: [] });
    const store = useSkillStore();
    await store.init('/Users/test', api);

    store.handleSkillDirectory('add', '/Users/test/.agents/skills/weather');

    expect(store.getSkillById('weather')).toMatchObject({
      id: 'weather',
      filePath: SKILL_FILE_PATH,
      source: 'global'
    });
    expect(store.getSkillById('weather')?.sourceContent).toBeUndefined();
    expect(api.readFile).not.toHaveBeenCalled();

    store.handleSkillDirectory('unlink', '/Users/test/.agents/skills/weather');
    expect(store.getSkillById('weather')).toBeUndefined();
  });

  it('waits for initialization after the layout declares it pending', async (): Promise<void> => {
    const api = createScannerAPI();
    const store = useSkillStore();
    store.prepareInitialization();
    let completed = false;
    const waiting = store.waitForInit().then((): void => {
      completed = true;
    });
    await Promise.resolve();

    expect(completed).toBe(false);
    await store.init('/Users/test', api);
    await waiting;
    expect(completed).toBe(true);
  });
});
