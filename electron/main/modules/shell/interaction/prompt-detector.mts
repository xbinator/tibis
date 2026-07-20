/**
 * @file prompt-detector.mts
 * @description 对稳定 prompt region 进行保守分类，不执行阈值或 PTY 操作。
 */
import type { ShellScreenSnapshot, StablePromptRegion } from './types.mjs';
import { classifyBooleanPrompt } from './boolean-prompt.mjs';

/** PromptDetector 的纯决策结果。 */
export type PromptDecision =
  | { type: 'auto_default'; promptKind: 'boolean_default' | 'wizard_default'; confidence: number }
  | { type: 'unsupported_input'; reason: 'text' | 'path' | 'account' | 'secret' }
  | { type: 'active_output' }
  | { type: 'unknown' };

/**
 * 检测不允许自动回答的提示类别。
 * @param content - 稳定提示区域
 * @returns 不支持原因或 null
 */
function detectUnsupported(content: string): Extract<PromptDecision, { type: 'unsupported_input' }> | null {
  if (/\b(?:password|passphrase|secret|token|api[ _-]?key|private key|otp|verification code)\b/i.test(content)) {
    return { type: 'unsupported_input', reason: 'secret' };
  }
  if (/\b(?:path|directory|folder|file name|filename|destination|install location)\b/i.test(content)) {
    return { type: 'unsupported_input', reason: 'path' };
  }
  if (/\b(?:account|email|e-mail|username|user name|login)\b/i.test(content)) {
    return { type: 'unsupported_input', reason: 'account' };
  }
  if (/\b(?:enter|type|provide|input)\b.*\b(?:value|name|text|answer|response)\b/i.test(content)) {
    return { type: 'unsupported_input', reason: 'text' };
  }
  return null;
}

/**
 * 判断快照是否仍在产生活动输出。
 * @param snapshot - 当前 Screen Snapshot
 * @returns 是否存在任一反向信号
 */
function hasActiveOutput(snapshot: ShellScreenSnapshot): boolean {
  return Object.values(snapshot.activity).some((active: boolean): boolean => active);
}

/**
 * 判断提示区域是否为结构完整且只有一个默认项的 wizard。
 * @param region - 稳定提示区域
 * @returns 是否允许选择当前默认项
 */
function isWizardDefault(region: StablePromptRegion): boolean {
  const lines = region.content.split('\n');
  const header = lines[0] ?? '';
  const options = lines.slice(1);
  if (!/(?:\?|:)\s*$/.test(header) || options.length < 2) return false;
  if (!options.every((line: string): boolean => /^\s*(?:❯|>|●|○|◉)\s+\S/.test(line) || /^\s{2,}\S/.test(line))) return false;
  const selectedRows = options.filter((line: string): boolean => /^\s*(?:❯|>|●|◉)\s+\S/.test(line));
  return selectedRows.length === 1 && region.selectedIndex !== undefined;
}

/**
 * 按固定优先级检测当前提示。
 * @param snapshot - 当前 Screen Snapshot
 * @param region - 已稳定化的提示区域
 * @returns 保守提示决策
 */
export function detectPrompt(snapshot: ShellScreenSnapshot, region: StablePromptRegion): PromptDecision {
  const unsupported = detectUnsupported(region.content);
  if (unsupported) return unsupported;
  if (hasActiveOutput(snapshot)) return { type: 'active_output' };
  if (classifyBooleanPrompt(region.content) === 'explicit_default') {
    return { type: 'auto_default', promptKind: 'boolean_default', confidence: 0.98 };
  }
  if (isWizardDefault(region)) {
    return { type: 'auto_default', promptKind: 'wizard_default', confidence: 0.92 };
  }
  return { type: 'unknown' };
}
