/**
 * @file scanner.ts
 * @description Skill 目录扫描器，发现并解析 SKILL.md 文件。
 */
import type { SkillDefinition, SkillScanConfig } from './types';
import { parseSkillMarkdown } from './parser';

/**
 * 扫描器依赖的平台 API 接口。
 * 仅声明扫描所需的方法，便于测试注入。
 */
export interface SkillScannerAPI {
  /** 读取文件内容 */
  readFile: (filePath: string) => Promise<{ content: string }>;
  /** 读取工作区目录 */
  readWorkspaceDirectory: (options: {
    directoryPath: string;
    workspaceRoot?: string;
  }) => Promise<{ entries: Array<{ name: string; type: 'file' | 'directory' }> }>;
  /** 获取路径状态 */
  getPathStatus?: (targetPath: string) => Promise<{ exists: boolean; isFile: boolean; isDirectory: boolean }>;
}

/**
 * 扫描指定目录下的 SKILL.md 文件。
 * @param dirPath - 要扫描的目录绝对路径
 * @param source - skill 来源标记
 * @param api - electronAPI 实例
 * @param maxContentLength - 内容最大长度
 * @returns 解析后的 SkillDefinition 数组
 */
async function scanDirectory(dirPath: string, source: SkillDefinition['source'], api: SkillScannerAPI, maxContentLength?: number): Promise<SkillDefinition[]> {
  const skills: SkillDefinition[] = [];

  try {
    const { entries } = await api.readWorkspaceDirectory({ directoryPath: dirPath });
    const dirEntries = entries.filter((e) => e.type === 'directory');

    const results = await Promise.allSettled(
      dirEntries.map(async (entry) => {
        const skillDirPath = `${dirPath}/${entry.name}`;
        const skillFilePath = `${skillDirPath}/SKILL.md`;
        const { content } = await api.readFile(skillFilePath);
        return parseSkillMarkdown(content, skillFilePath, { source, maxContentLength });
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        skills.push(result.value);
      }
    }
  } catch {
    // 目录不存在或不可读，跳过
  }

  return skills;
}

/**
 * 扫描所有来源的 Skill。
 * 扫描顺序：项目目录 → 用户配置路径（用户路径优先级更高，同名覆盖项目）。
 * @param config - 扫描配置
 * @param api - electronAPI 实例
 * @returns 去重后的 SkillDefinition 数组
 */
export async function scanSkills(config: SkillScanConfig, api: SkillScannerAPI): Promise<SkillDefinition[]> {
  const { maxContentLength } = config;

  // 扫描项目目录
  const projectSkillsDir = `${config.workspaceRoot}/.agents/skills`;
  const projectSkills = await scanDirectory(projectSkillsDir, 'project', api, maxContentLength);

  // 去重：同名 skill 后者覆盖前者
  const skillMap = new Map<string, SkillDefinition>();
  for (const skill of projectSkills) {
    const key = skill.name || skill.filePath;
    skillMap.set(key, skill);
  }

  return Array.from(skillMap.values());
}
