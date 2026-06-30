/**
 * @file widgetSkillDraft.ts
 * @description 聊天侧小组件 skill 草稿匹配与消息创建工具。
 */
import type { Message } from './types';
import type { ChatMessageWidgetPart } from 'types/chat';
import { cloneDeep, isPlainObject, isString } from 'lodash-es';
import type { WidgetData, WidgetRenderContext } from '@/components/BWidget/types';
import { readWidgetPreviewRenderContext } from '@/components/BWidget/utils/widgetPreviewContext';
import { createBase } from './messageHelper';
import { createWidgetMessagePart } from './widgetMessagePart';

/**
 * 本地草稿支持的小组件 skill 名称。
 */
export type WidgetSkillDraftName = string;

/**
 * 小组件 skill 草稿命中结果。
 */
export interface WidgetSkillDraftResolution {
  /** 命中的小组件 skill 名称 */
  skillName: WidgetSkillDraftName;
  /** 可直接写入聊天消息的小组件片段 */
  part: ChatMessageWidgetPart;
}

/**
 * 读取后的 Widget Skill 声明。
 */
interface ResolvedWidgetSkillMetadata {
  /** Skill 名称 */
  name: string;
  /** Skill 描述 */
  description?: string;
  /** 触发词 */
  triggers: string[];
  /** 别名 */
  aliases: string[];
}

/**
 * 判断用户输入是否包含任一触发词。
 * @param content - 标准化后的用户输入
 * @param triggers - 触发词列表
 * @returns 是否命中触发词
 */
function hasTrigger(content: string, triggers: readonly string[]): boolean {
  return triggers.some((trigger) => content.includes(trigger.trim().toLowerCase()));
}

/**
 * 读取字符串数组配置。
 * @param value - 原始配置值
 * @returns 清理后的字符串数组
 */
function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter(isString)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

/**
 * 从小组件数据读取自身声明的 skill 元信息。
 * @param dataItem - 小组件数据
 * @returns 有效 skill 声明，缺失时返回 null
 */
function readWidgetSkillMetadata(dataItem: WidgetData): ResolvedWidgetSkillMetadata | null {
  const rawSkill = dataItem.metadata.skill;

  if (!isPlainObject(rawSkill)) {
    return null;
  }

  const skillRecord = rawSkill as Record<string, unknown>;
  const name = isString(skillRecord.name) && skillRecord.name.trim() ? skillRecord.name.trim() : dataItem.name.trim();
  const triggers = readStringArray(skillRecord.triggers);
  const aliases = readStringArray(skillRecord.aliases);

  if (!name || (!triggers.length && !aliases.length)) {
    return null;
  }

  return {
    name,
    description: isString(skillRecord.description) ? skillRecord.description : undefined,
    triggers,
    aliases
  };
}

/**
 * 基于小组件预览上下文生成草稿渲染上下文。
 * @param dataItem - 小组件数据
 * @returns 小组件渲染上下文
 */
function createWidgetDraftRenderContext(dataItem: WidgetData): WidgetRenderContext {
  const previewContext = cloneDeep(readWidgetPreviewRenderContext(dataItem.metadata) ?? { input: {}, state: {} });

  return {
    ...previewContext,
    input: {
      ...previewContext.input
    },
    state: {
      ...previewContext.state
    }
  };
}

/**
 * 创建小组件草稿会话 ID。
 * @param skillName - skill 名称
 * @returns 小组件草稿会话 ID
 */
function createWidgetSkillDraftSessionId(skillName: string): string {
  const normalizedName = skillName.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
  return `widget-skill-${normalizedName}-draft`;
}

/**
 * 从小组件数据列表中解析本地 skill 草稿。
 * @param content - 用户输入文本
 * @param dataItems - 待匹配的小组件数据列表
 * @returns 命中的小组件草稿，未命中时返回 null
 */
export function resolveWidgetSkillDraftFromDataItems(content: string, dataItems: readonly WidgetData[]): WidgetSkillDraftResolution | null {
  const normalizedContent = content.trim().toLowerCase();

  for (const sourceDataItem of dataItems) {
    const skill = readWidgetSkillMetadata(sourceDataItem);
    if (!skill || !hasTrigger(normalizedContent, [...skill.triggers, ...skill.aliases])) {
      continue;
    }

    const dataItem = cloneDeep(sourceDataItem);
    return {
      skillName: skill.name,
      part: createWidgetMessagePart({
        sessionId: createWidgetSkillDraftSessionId(skill.name),
        status: 'success',
        dataItem,
        renderContext: createWidgetDraftRenderContext(dataItem)
      })
    };
  }

  return null;
}

/**
 * 根据用户输入解析小组件 skill 草稿。
 * @param content - 用户输入文本
 * @returns 当前未接入小组件数据源，固定返回 null
 */
export function resolveWidgetSkillDraft(content: string): WidgetSkillDraftResolution | null {
  return resolveWidgetSkillDraftFromDataItems(content, []);
}

/**
 * 创建承载小组件草稿的助手消息。
 * @param draft - 小组件草稿命中结果
 * @returns 助手消息
 */
export function createWidgetSkillDraftAssistantMessage(draft: WidgetSkillDraftResolution): Message {
  return createBase({
    role: 'assistant',
    content: '',
    parts: [draft.part],
    loading: false,
    finished: true
  });
}
