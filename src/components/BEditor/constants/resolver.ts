/**
 * @file resolver.ts
 * @description 根据扩展名解析 BEditor 内部实现类型及 Monaco 语言标识。
 */

/**
 * BEditor 内部实现类型。
 */
export type EditorKind = 'markdown' | 'monaco';

const MARKDOWN_EXTENSIONS = new Set(['', 'md', 'markdown']);

/**
 * 扩展名 → Monaco 语言标识映射表。
 */
const EXT_TO_LANGUAGE: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  json: 'json',
  jsonc: 'json',
  html: 'html',
  htm: 'html',
  css: 'css',
  less: 'less',
  scss: 'scss',
  vue: 'html',
  xml: 'xml',
  svg: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  md: 'markdown',
  markdown: 'markdown',
  python: 'python',
  py: 'python',
  java: 'java',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  go: 'go',
  rs: 'rust',
  ruby: 'ruby',
  rb: 'ruby',
  php: 'php',
  swift: 'swift',
  kotlin: 'kotlin',
  kt: 'kotlin',
  kts: 'kotlin',
  scala: 'scala',
  r: 'r',
  sql: 'sql',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  dockerfile: 'dockerfile',
  toml: 'ini',
  ini: 'ini',
  cfg: 'ini',
  conf: 'ini',
  lua: 'lua',
  perl: 'perl',
  pl: 'perl',
  diff: 'diff',
  patch: 'diff',
  graphql: 'graphql',
  gql: 'graphql',
  proto: 'protobuf'
};

/**
 * 根据文件扩展名解析当前应使用的编辑器实现。
 * @param ext - 文件扩展名
 * @returns 编辑器实现类型
 */
export function resolveEditorKind(ext: string | null | undefined): EditorKind {
  const normalizedExt = String(ext ?? '')
    .trim()
    .toLowerCase();

  if (MARKDOWN_EXTENSIONS.has(normalizedExt)) {
    return 'markdown';
  }

  return 'monaco';
}

/**
 * 根据文件扩展名解析 Monaco 语言标识。
 * @param ext - 文件扩展名
 * @returns Monaco 语言标识；未匹配时回退为 plaintext
 */
export function resolveMonacoLanguage(ext: string | null | undefined): string {
  const normalizedExt = String(ext ?? '')
    .trim()
    .toLowerCase();

  return EXT_TO_LANGUAGE[normalizedExt] ?? 'plaintext';
}
