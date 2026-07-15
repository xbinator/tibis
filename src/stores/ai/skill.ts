/**
 * @file skill.ts
 * @description Skill Pinia Store，管理目录索引、启用状态与懒加载内容缓存。
 */
import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { DEFAULT_SKILL_MAX_CONTENT_LENGTH, joinPath, parseSkillMarkdown, scanSkillDirectories, type SkillScannerAPI } from '@/ai/skill';
import type { SkillEntry, SkillIndex, SkillScanConfig } from '@/ai/skill/types';
import { local } from '@/shared/storage/base';
import { asyncTo } from '@/utils/asyncTo';
import { SharedRequest } from '@/utils/sharedRequest';

/** 按目录 ID 持久化禁用状态的键名。 */
const STORAGE_KEY_DISABLED_IDS = 'skill.disabledIds';

/** 旧版本按 frontmatter 名称持久化禁用状态的键名。 */
const STORAGE_KEY_DISABLED_NAMES = 'skill.disabledNames';

/**
 * 从本地存储读取数据。
 * @param key - 存储键名
 * @param defaults - 数据不存在时的默认值
 * @returns 已存储的数据或默认值
 */
function loadFromStorage<T>(key: string, defaults: T): T {
  const saved = local.getItem<unknown>(key);
  return saved !== null && saved !== undefined ? (saved as T) : defaults;
}

/**
 * 统一目录路径分隔符并移除末尾斜杠。
 * @param dirPath - 原始目录路径
 * @returns 规范化目录路径
 */
function normalizeResourcePath(resourcePath: string): string {
  return resourcePath.replace(/\\/g, '/').replace(/\/+$/, '');
}

/**
 * 从目录路径读取资源 ID。
 * @param dirPath - Skill 目录路径
 * @returns 目录末段名称
 */
function readDirectoryId(dirPath: string): string {
  return normalizeResourcePath(dirPath).split('/').filter(Boolean).at(-1) ?? '';
}

/**
 * Skill Pinia Store。
 */
export const useSkillStore = defineStore('skill', () => {
  /** 已发现的 Skill 目录及其可选内容缓存。 */
  const skills = ref<SkillEntry[]>([]);

  /** 是否已完成首次目录扫描。 */
  const initialized = ref(false);

  /** 扫描配置。 */
  const scanConfig = ref<SkillScanConfig>({
    homeDir: ''
  });

  /** 初始化等待屏障。 */
  let initPromise: Promise<void> | null = null;
  /** 初始化等待屏障完成回调。 */
  let resolveInitPromise: (() => void) | null = null;
  /** 合并重复初始化调用的任务。 */
  let initTaskPromise: Promise<void> | null = null;
  /** 合并并发目录刷新的任务。 */
  let refreshPromise: Promise<void> | null = null;
  /** 初始化时注入的平台 API。 */
  let cachedApi: SkillScannerAPI | null = null;
  /** 目录 watcher 事件修订序号，用于识别扫描期间发生的增删。 */
  let directoryRevision = 0;

  /** 解析失败的 Skill 及错误信息。 */
  const parseErrors = computed<Map<string, string>>((): Map<string, string> => {
    const errors = new Map<string, string>();
    for (const skill of skills.value) {
      if (skill.definition?.parseError) {
        errors.set(skill.filePath, skill.definition.parseError);
      }
    }
    return errors;
  });

  /**
   * 按目录 ID 查找 Skill。
   * @param id - Skill 目录 ID
   * @returns 匹配的 Store 条目
   */
  function getSkillById(id: string): SkillEntry | undefined {
    return skills.value.find((skill: SkillEntry): boolean => skill.id === id);
  }

  /**
   * 获取已启用且成功解析的 Skill。
   * @returns 当前可用于聊天或工具执行的条目
   */
  function getEnabledSkills(): SkillEntry[] {
    const includedNames = new Set<string>();
    return skills.value.filter((skill: SkillEntry): boolean => {
      const { definition } = skill;
      if (!skill.enabled || !definition || definition.parseError || includedNames.has(definition.name)) {
        return false;
      }

      includedNames.add(definition.name);
      return true;
    });
  }

  /**
   * 按已加载的 frontmatter 名称查找 Skill。
   * @param name - Skill frontmatter 名称
   * @returns 匹配的 Store 条目
   */
  function getSkillByName(name: string): SkillEntry | undefined {
    // 聊天执行优先采用与工具目录一致的启用条目；全部不可用时保留原始查找结果供错误提示使用。
    return (
      getEnabledSkills().find((skill: SkillEntry): boolean => skill.definition?.name === name) ??
      skills.value.find((skill: SkillEntry): boolean => skill.definition?.name === name)
    );
  }

  /**
   * 读取已禁用目录 ID。
   * @returns 已禁用 Skill ID 集合
   */
  function getDisabledIds(): Set<string> {
    return new Set(loadFromStorage<string[]>(STORAGE_KEY_DISABLED_IDS, []));
  }

  /**
   * 持久化当前禁用目录 ID。
   */
  function persistDisabledIds(): void {
    const disabledIds = skills.value.filter((skill: SkillEntry): boolean => !skill.enabled).map((skill: SkillEntry): string => skill.id);
    local.setItem(STORAGE_KEY_DISABLED_IDS, disabledIds);
  }

  /**
   * 为新发现目录创建未加载条目。
   * @param index - Skill 目录索引
   * @param disabledIds - 已持久化的禁用目录 ID
   * @returns Store 条目
   */
  function createSkillEntry(index: SkillIndex, disabledIds: Set<string>): SkillEntry {
    return {
      ...index,
      enabled: !disabledIds.has(index.id),
      revision: 0
    };
  }

  /**
   * 将扫描结果合并到 Store，同时保留未变化目录的内容缓存。
   * @param discovered - 最新目录索引
   */
  function applySkillIndices(discovered: SkillIndex[]): void {
    const previousById = new Map(skills.value.map((skill: SkillEntry): [string, SkillEntry] => [skill.id, skill]));
    const disabledIds = getDisabledIds();
    const nextSkills = discovered.map((index: SkillIndex): SkillEntry => {
      const previous = previousById.get(index.id);
      if (previous && previous.dirPath === index.dirPath && previous.filePath === index.filePath && previous.source === index.source) {
        return previous;
      }

      if (previous) {
        previous.revision += 1;
      }
      return createSkillEntry(index, disabledIds);
    });

    const nextIds = new Set(discovered.map((index: SkillIndex): string => index.id));
    for (const previous of skills.value) {
      if (!nextIds.has(previous.id)) {
        previous.revision += 1;
      }
    }

    skills.value = nextSkills;
  }

  /**
   * 将旧版按 frontmatter 名称保存的禁用状态迁移为目录 ID。
   * @param skill - 已加载 Skill 条目
   */
  function migrateDisabledName(skill: SkillEntry): void {
    const name = skill.definition?.name;
    if (!name) {
      return;
    }

    const disabledNames = loadFromStorage<string[]>(STORAGE_KEY_DISABLED_NAMES, []);
    if (!disabledNames.includes(name)) {
      return;
    }

    if (skill.enabled) {
      skill.enabled = false;
      persistDisabledIds();
    }

    // 消费已迁移名称，避免用户重新启用后下次启动又被旧数据禁用。
    local.setItem(
      STORAGE_KEY_DISABLED_NAMES,
      disabledNames.filter((disabledName: string): boolean => disabledName !== name)
    );
  }

  /**
   * 将入口文件原文解析并写入当前 Store 条目。
   * @param skill - 目标 Skill 条目
   * @param sourceContent - 完整 SKILL.md 原文
   */
  function applySkillContent(skill: SkillEntry, sourceContent: string): void {
    skill.sourceContent = sourceContent;
    skill.definition = parseSkillMarkdown(sourceContent, skill.filePath, {
      source: skill.source,
      maxContentLength: scanConfig.value.maxContentLength ?? DEFAULT_SKILL_MAX_CONTENT_LENGTH
    });
    skill.loadError = undefined;
    migrateDisabledName(skill);
  }

  /**
   * 从磁盘执行一次 Skill 首次加载。
   * @param id - Skill 目录 ID
   * @returns 已加载或被更新操作替代的当前条目
   */
  async function loadSkill(id: string): Promise<SkillEntry> {
    const skill = getSkillById(id);
    if (!skill || !cachedApi) {
      throw new Error(`Skill not found: ${id}`);
    }

    if (skill.sourceContent !== undefined) {
      return skill;
    }

    const { revision } = skill;
    const [readError, file] = await asyncTo(cachedApi.readFile(skill.filePath));
    if (readError) {
      const current = getSkillById(id);
      if (current === skill && current.revision === revision) {
        current.loadError = readError.message;
        throw readError;
      }

      // 旧 Entry 读取失败时，应用内保存可直接返回缓存，目录替换则继续读取当前 Entry。
      if (!current) {
        throw readError;
      }
      if (current.sourceContent !== undefined) {
        return current;
      }
      return loadSkill(id);
    }

    const current = getSkillById(id);
    if (!current) {
      throw new Error(`Skill not found: ${id}`);
    }

    if (current === skill && current.revision === revision) {
      applySkillContent(current, file.content);
      return current;
    }

    // 应用内保存可以直接返回缓存；目录被替换时递归读取新条目。
    if (current.sourceContent !== undefined) {
      return current;
    }
    return loadSkill(id);
  }

  /** 按 Skill ID 共享执行中的首次加载请求。 */
  const sharedSkillRequest = new SharedRequest<string, SkillEntry>(loadSkill);

  /**
   * 获取 Skill 内容；首次从磁盘读取，之后返回 Store 缓存。
   * @param id - Skill 目录 ID
   * @returns 当前 Store 条目；目录不存在时返回 undefined
   */
  async function getSkill(id: string): Promise<SkillEntry | undefined> {
    const skill = getSkillById(id);
    if (!skill) {
      return undefined;
    }
    if (skill.sourceContent !== undefined) {
      return skill;
    }

    const [, loadedSkill] = await asyncTo(sharedSkillRequest.fetch(id));
    return loadedSkill ?? getSkillById(id);
  }

  /**
   * 获取当前全部 Skill，单项读取失败通过 Entry.loadError 表达。
   * @returns 与当前目录顺序一致且仍存在的 Store 条目
   */
  async function getSkills(): Promise<SkillEntry[]> {
    const loadedSkills = await Promise.all(skills.value.map((skill: SkillEntry): Promise<SkillEntry | undefined> => getSkill(skill.id)));
    return loadedSkills.filter((skill: SkillEntry | undefined): skill is SkillEntry => skill !== undefined);
  }

  /**
   * 用应用内最新原文更新 Skill 内容缓存。
   * @param id - Skill 目录 ID
   * @param sourceContent - 最新完整 SKILL.md 原文
   * @returns 更新后的条目
   */
  function updateSkillContent(id: string, sourceContent: string): SkillEntry | undefined {
    const skill = getSkillById(id);
    if (!skill) {
      return undefined;
    }

    skill.revision += 1;
    applySkillContent(skill, sourceContent);
    return skill;
  }

  /**
   * 将应用内保存的入口文件内容同步到匹配的 Skill 缓存。
   * @param filePath - 已成功保存的文件绝对路径
   * @param sourceContent - 已成功保存的完整文件内容
   */
  function handleFileSaved(filePath: string, sourceContent: string): void {
    const normalizedFilePath = normalizeResourcePath(filePath);
    const skill = skills.value.find((entry: SkillEntry): boolean => normalizeResourcePath(entry.filePath) === normalizedFilePath);
    if (skill) {
      updateSkillContent(skill.id, sourceContent);
    }
  }

  /**
   * 切换 Skill 启用状态并按目录 ID 持久化。
   * @param id - Skill 目录 ID
   */
  function toggleSkill(id: string): void {
    const skill = getSkillById(id);
    if (!skill) {
      return;
    }

    skill.enabled = !skill.enabled;
    persistDisabledIds();
  }

  /**
   * 处理直接子目录的新增或删除事件。
   * @param type - 目录事件类型
   * @param dirPath - Skill 资源目录路径
   */
  function handleSkillDirectory(type: 'add' | 'unlink', dirPath: string): void {
    const normalizedDirPath = normalizeResourcePath(dirPath);
    const id = readDirectoryId(normalizedDirPath);
    if (!id || id.startsWith('.')) {
      return;
    }
    directoryRevision += 1;

    const existingIndex = skills.value.findIndex((skill: SkillEntry): boolean => normalizeResourcePath(skill.dirPath) === normalizedDirPath);
    if (type === 'unlink') {
      if (existingIndex !== -1) {
        skills.value[existingIndex].revision += 1;
        skills.value.splice(existingIndex, 1);
      }
      return;
    }

    const existingById = getSkillById(id);
    if (existingById?.dirPath === normalizedDirPath) {
      return;
    }
    if (existingById) {
      existingById.revision += 1;
      skills.value.splice(skills.value.indexOf(existingById), 1);
    }

    skills.value.push(
      createSkillEntry(
        {
          id,
          dirPath: normalizedDirPath,
          filePath: joinPath(normalizedDirPath, 'SKILL.md'),
          source: 'global'
        },
        getDisabledIds()
      )
    );
  }

  /**
   * 扫描目录直到扫描期间没有新的 watcher 事件。
   * @returns 稳定时刻的 Skill 目录索引
   */
  async function scanStableSkills(): Promise<SkillIndex[]> {
    if (!cachedApi) {
      return [];
    }

    const scanRevision = directoryRevision;
    const discovered = await scanSkillDirectories(scanConfig.value, cachedApi);
    if (scanRevision !== directoryRevision) {
      return scanStableSkills();
    }

    return discovered;
  }

  /**
   * 重新扫描 Skill 目录索引。
   */
  async function refreshSkills(): Promise<void> {
    if (!cachedApi || !scanConfig.value.homeDir) {
      return;
    }
    if (!refreshPromise) {
      refreshPromise = scanStableSkills()
        .then((discovered: SkillIndex[]): void => {
          applySkillIndices(discovered);
        })
        .finally((): void => {
          refreshPromise = null;
        });
    }
    await refreshPromise;
  }

  /**
   * 在异步布局挂载前建立初始化等待屏障。
   */
  function prepareInitialization(): void {
    if (initialized.value || initPromise) {
      return;
    }

    initPromise = new Promise<void>((resolve: () => void): void => {
      resolveInitPromise = resolve;
    });
  }

  /**
   * 完成初始化等待屏障。
   */
  function finishInitialization(): void {
    initialized.value = true;
    resolveInitPromise?.();
    resolveInitPromise = null;
    initPromise ??= Promise.resolve();
  }

  /**
   * 初始化 Skill 目录索引。
   * @param homeDir - 用户主目录路径
   * @param api - 平台文件 API
   */
  async function init(homeDir: string, api: SkillScannerAPI): Promise<void> {
    if (initTaskPromise) {
      return initTaskPromise;
    }

    prepareInitialization();
    scanConfig.value.homeDir = homeDir;
    cachedApi = api;
    initTaskPromise = (async (): Promise<void> => {
      try {
        await refreshSkills();
      } catch (error: unknown) {
        console.error('Skill scan failed:', error);
      } finally {
        finishInitialization();
      }
    })();
    return initTaskPromise;
  }

  /**
   * 等待首次目录扫描完成。
   */
  async function waitForInit(): Promise<void> {
    if (initialized.value) {
      return;
    }
    if (initPromise) {
      await initPromise;
    }
  }

  return {
    skills,
    initialized,
    scanConfig,
    parseErrors,
    getSkillById,
    getSkillByName,
    getEnabledSkills,
    getSkill,
    getSkills,
    updateSkillContent,
    handleFileSaved,
    toggleSkill,
    handleSkillDirectory,
    refreshSkills,
    prepareInitialization,
    finishInitialization,
    init,
    waitForInit
  };
});
