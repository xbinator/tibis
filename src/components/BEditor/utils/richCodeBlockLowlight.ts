/**
 * @file richCodeBlockLowlight.ts
 * @description 富文本代码块 Lowlight 高亮配置工具。
 */
import type { createLowlight } from 'lowlight';

/**
 * 富文本编辑器使用的 Lowlight 实例类型。
 */
type RichCodeBlockLowlight = ReturnType<typeof createLowlight>;

/**
 * 富文本代码块语言选择器中存在、但 Lowlight 默认未直接注册的别名。
 */
const RICH_CODE_BLOCK_LANGUAGE_ALIASES: Readonly<Record<string, readonly string[]>> = {
  javascript: ['react'],
  xml: ['vue']
};

/**
 * 注册富文本代码块语言别名，避免首次进入时未识别语言而退回自动高亮。
 * @param lowlight - 富文本代码块使用的 Lowlight 实例
 */
export function registerRichCodeBlockLowlightAliases(lowlight: RichCodeBlockLowlight): void {
  lowlight.registerAlias(RICH_CODE_BLOCK_LANGUAGE_ALIASES);
}
