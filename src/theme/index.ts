/**
 * @file index.ts
 * @description 主题模块统一导出。
 */

export type { ThemeTokens } from './tokens';
export { light, dark } from './tokens';
export { toCssVars, toAntdToken, toMonacoColors } from './derive';
export { applyCssVars, validateTokens } from './apply';
