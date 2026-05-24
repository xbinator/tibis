/**
 * @file skill.ts
 * @description Skill Pinia Store，管理 skill 列表、启用状态和扫描配置。
 */
import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { DEFAULT_SKILL_MAX_CONTENT_LENGTH, scanSkills, type SkillScannerAPI } from '@/ai/skill';
import type { SkillDefinition, SkillScanConfig } from '@/ai/skill/types';
import { local } from '@/shared/storage/base';

/** localStorage 持久化键名。 */
const STORAGE_KEY_DISABLED_NAMES = 'skill.disabledNames';

/**
 * 从 localStorage 加载数据。
 * @param key - 存储键名
 * @param defaults - 默认值
 * @returns 加载的数据或默认值
 */
function loadFromStorage<T>(key: string, defaults: T): T {
  const saved = local.getItem<unknown>(key);
  return saved !== null && saved !== undefined ? (saved as T) : defaults;
}

/**
 * Skill Pinia Store。
 */
export const useSkillStore = defineStore('skill', () => {
  /** 已发现的所有 skill。 */
  const skills = ref<SkillDefinition[]>([]);

  /** 是否已完成初始化扫描。 */
  const initialized = ref(false);

  /** 初始化 Promise，用于等待扫描完成。 */
  let initPromise: Promise<void> | null = null;
  /** 缓存的扫描 API，用于 rescan。 */
  let cachedApi: SkillScannerAPI | null = null;

  /** 扫描配置。 */
  const scanConfig = ref<SkillScanConfig>({
    homeDir: ''
  });

  /** 解析失败的 skill 及错误信息。 */
  const parseErrors = computed(() => {
    const errors = new Map<string, string>();
    for (const skill of skills.value) {
      if (skill.parseError) {
        errors.set(skill.filePath, skill.parseError);
      }
    }
    return errors;
  });

  /**
   * 按名称查找 skill。
   * @param name - skill 名称
   * @returns 匹配的 skill 或 undefined
   */
  function getSkillByName(name: string): SkillDefinition | undefined {
    return skills.value.find((s) => s.name === name);
  }

  /**
   * 获取已启用且无解析错误的 skill 列表。
   * @returns 可用 skill 列表
   */
  function getEnabledSkills(): SkillDefinition[] {
    return skills.value.filter((s) => s.enabled && !s.parseError);
  }

  /** 持久化禁用名称列表。 */
  function persistDisabledNames(): void {
    const disabledNames = skills.value.filter((s) => !s.enabled).map((s) => s.name);
    local.setItem(STORAGE_KEY_DISABLED_NAMES, disabledNames);
  }

  /**
   * 切换 skill 启用/禁用状态。
   * @param name - skill 名称
   */
  function toggleSkill(name: string): void {
    const skill = skills.value.find((s) => s.name === name);
    if (skill) {
      skill.enabled = !skill.enabled;
      persistDisabledNames();
    }
  }

  /**
   * 处理 skill 目录变更事件（增量更新）。
   * @param type - 事件类型
   * @param updatedSkill - 解析后的 skill（add/change 时提供）
   */
  function handleSkillChange(type: 'change' | 'add' | 'unlink', updatedSkill: SkillDefinition): void {
    const index = skills.value.findIndex((s) => s.filePath === updatedSkill.filePath);

    if (type === 'unlink') {
      if (index !== -1) {
        skills.value.splice(index, 1);
      }
      return;
    }

    // add 或 change，解析错误的直接丢弃
    if (updatedSkill.parseError) {
      if (index !== -1) {
        skills.value.splice(index, 1);
      }
      return;
    }

    if (index !== -1) {
      skills.value[index] = updatedSkill;
    } else {
      skills.value.push(updatedSkill);
    }
  }

  /**
   * 初始化：扫描 skill 目录。
   * @param homeDir - 用户主目录路径
   * @param api - electronAPI 实例
   */
  async function init(homeDir: string, api: SkillScannerAPI): Promise<void> {
    if (initPromise) {
      return initPromise;
    }

    scanConfig.value.homeDir = homeDir;
    cachedApi = api;

    initPromise = (async () => {
      try {
        const config: SkillScanConfig = {
          homeDir,
          maxContentLength: DEFAULT_SKILL_MAX_CONTENT_LENGTH
        };

        const discovered = await scanSkills(config, api);

        // 应用持久化的禁用状态
        const disabledNames = loadFromStorage<string[]>(STORAGE_KEY_DISABLED_NAMES, []);
        for (const skill of discovered) {
          if (disabledNames.includes(skill.name)) {
            skill.enabled = false;
          }
        }

        skills.value = discovered;
        initialized.value = true;
      } catch (error: unknown) {
        console.error('Skill scan failed:', error);
        initialized.value = true;
      }
    })();

    return initPromise;
  }

  /**
   * 重新扫描 skill 目录（使用缓存的 api 和 homeDir）。
   */
  async function rescan(): Promise<void> {
    if (!cachedApi || !scanConfig.value.homeDir) {
      console.warn('Skill rescan called before init');
      return;
    }
    initPromise = null;
    initialized.value = false;
    await init(scanConfig.value.homeDir, cachedApi);
  }

  /**
   * 等待初始化完成。
   */
  async function waitForInit(): Promise<void> {
    if (initialized.value) return;
    if (initPromise) await initPromise;
  }

  return {
    skills,
    initialized,
    scanConfig,
    parseErrors,
    getSkillByName,
    getEnabledSkills,
    toggleSkill,
    handleSkillChange,
    init,
    rescan,
    waitForInit
  };
});
