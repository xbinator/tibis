/**
 * @file SkillTool/index.ts
 * @description Skill 工具实现，LLM 通过此工具按需加载 Skill 指令。
 */
import type { AIToolExecutor } from 'types/ai';
import type { SkillDefinition } from '@/ai/skill/types';
import { createToolFailureResult, createToolSuccessResult } from '../../results';

/** Skill 工具名称。 */
export const SKILL_TOOL_NAME = 'skill';

/** Skill 工具 description 最大长度，避免大量 skill 挤占上下文。 */
const MAX_SKILL_DESCRIPTION_LENGTH = 4000;

/** Skill 工具 description 固定头部。 */
const SKILL_DESCRIPTION_HEADER = 'Load a skill by name to get specialized instructions. Available skills:';

/** Skill 工具 description 固定尾部。 */
const SKILL_DESCRIPTION_FOOTER = 'Call this tool with the skill name to load its full instructions.';

/**
 * Skill store 接口，仅声明 SkillTool 所需的方法。
 */
export interface SkillStoreLike {
  /** 获取已启用的 skill 列表 */
  getEnabledSkills: () => SkillDefinition[];
  /** 按名称查找 skill */
  getSkillByName: (name: string) => SkillDefinition | undefined;
  /** 执行前解析磁盘中的最新启用 Skill */
  resolveLatestEnabledSkill?: (name: string) => Promise<SkillDefinition | undefined>;
  /** 是否已完成初始化 */
  initialized: boolean;
}

/**
 * 生成 skill 工具的动态 description。
 * @param store - skill store 实例
 * @returns description 字符串
 */
function buildSkillDescription(store: SkillStoreLike): string {
  const skills = store.getEnabledSkills();

  if (skills.length === 0) {
    return (
      'Load a skill by name to get specialized instructions. No skills available. ' +
      'Skills can be added by placing SKILL.md files in .agents/skills/ directories.'
    );
  }

  const lines: string[] = [];
  const availableSkills = skills.filter((s) => !s.parseError);

  for (const skill of availableSkills) {
    const nextLine = `- ${skill.name}: ${skill.description}`;
    const omitted = availableSkills.length - lines.length - 1;
    const omissionLine = omitted > 0 ? `... ${omitted} more skills omitted to keep this tool description compact.` : '';
    const candidate = [SKILL_DESCRIPTION_HEADER, ...lines, nextLine, omissionLine, '', SKILL_DESCRIPTION_FOOTER].filter(Boolean).join('\n');

    if (candidate.length > MAX_SKILL_DESCRIPTION_LENGTH) {
      if (omissionLine) {
        lines.push(omissionLine);
      }
      break;
    }

    lines.push(nextLine);
  }

  return [SKILL_DESCRIPTION_HEADER, ...lines, '', SKILL_DESCRIPTION_FOOTER].join('\n');
}

/**
 * 转义 XML 文本节点中的特殊字符。
 * @param value - 原始文本
 * @returns 转义后的文本
 */
function escapeXmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * 构建返回给模型的 skill 内容。
 * @param skill - Skill 定义
 * @returns 带元数据的 skill 指令文本
 */
function buildSkillContent(skill: SkillDefinition): string {
  const metadata = [
    '<skill_metadata>',
    `<dir_path>${escapeXmlText(skill.dirPath)}</dir_path>`,
    `<file_path>${escapeXmlText(skill.filePath)}</file_path>`,
    `<content_hash>${escapeXmlText(skill.contentHash ?? '')}</content_hash>`,
    '<shell_cwd_hint>When running scripts or using resources bundled with this skill, call run_shell_command with cwd set to dir_path.</shell_cwd_hint>',
    '</skill_metadata>'
  ].join('\n');

  return `${metadata}\n<skill_content name="${escapeXmlText(skill.name)}">\n${skill.content}\n</skill_content>`;
}

/**
 * 创建 Skill 工具执行器。
 * @param store - skill store 实例
 * @returns 工具执行器
 */
export function createSkillTool(store: SkillStoreLike): AIToolExecutor<{ name: string }, string> {
  return {
    definition: {
      name: SKILL_TOOL_NAME,
      description: () => buildSkillDescription(store),
      source: 'builtin',
      riskLevel: 'read',
      permissionCategory: 'system',
      requiresActiveDocument: false,
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'The name of the skill to load.'
          }
        },
        required: ['name'],
        additionalProperties: false
      }
    },
    async execute(input: { name: string }) {
      const skill = store.resolveLatestEnabledSkill ? await store.resolveLatestEnabledSkill(input.name) : store.getSkillByName(input.name);

      if (!skill) {
        const available = store
          .getEnabledSkills()
          .filter((s) => !s.parseError)
          .map((s) => s.name)
          .join(', ');

        return createToolFailureResult(SKILL_TOOL_NAME, 'TOOL_NOT_FOUND', `Skill '${input.name}' not found. Available skills: ${available || 'none'}`);
      }

      if (skill.parseError) {
        return createToolFailureResult(SKILL_TOOL_NAME, 'INVALID_INPUT', `Skill '${input.name}' is invalid: ${skill.parseError}`);
      }

      const content = buildSkillContent(skill);
      return createToolSuccessResult(SKILL_TOOL_NAME, content);
    }
  };
}
