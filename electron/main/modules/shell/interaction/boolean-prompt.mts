/**
 * @file boolean-prompt.mts
 * @description 精确解析 Shell 布尔提示的默认语义，避免宽松子串匹配。
 */

/** 布尔提示分类。 */
export type BooleanPromptKind = 'explicit_default' | 'ambiguous';

/**
 * 分类位于行尾的布尔提示 token。
 * @param content - 单行 prompt region
 * @returns 明确默认、无默认歧义或非布尔提示
 */
export function classifyBooleanPrompt(content: string): BooleanPromptKind | null {
  const match = content.match(/(\[[^\]\n]+\]|\([^)\n]+\)|[^\s:]+)\s*(:?)\s*$/);
  if (!match?.[1]) return null;
  const token = match[1].replace(/^[[(]|[\])]$/g, '').trim();
  const prefix = content.slice(0, match.index);
  const hasQuestionMarker = /[?:]\s*$/.test(prefix) || match[2] === ':';
  if (!hasQuestionMarker) return null;
  if (token === 'Y/n' || token === 'y/N') return 'explicit_default';
  if (token === 'Y/N' || token === 'y/n') return 'ambiguous';
  return null;
}
