/**
 * @file icons.ts
 * @description 文件扩展名到 Iconify 图标名的映射，用于展示带颜色的文件类型图标
 */

/**
 * 文件扩展名到 vscode-icons 图标名的映射
 * vscode-icons 图标集自带颜色，视觉效果接近 VS Code 文件浏览器
 */
const EXT_ICON_MAP: Record<string, string> = {
  // Web 前端
  vue: 'vscode-icons:file-type-vue',
  js: 'vscode-icons:file-type-js-official',
  jsx: 'vscode-icons:file-type-reactjs',
  ts: 'vscode-icons:file-type-typescript-official',
  tsx: 'vscode-icons:file-type-reactts',
  css: 'vscode-icons:file-type-css',
  scss: 'vscode-icons:file-type-scss',
  less: 'vscode-icons:file-type-less',
  html: 'vscode-icons:file-type-html',
  svelte: 'vscode-icons:file-type-svelte',

  // 数据 / 配置
  json: 'vscode-icons:file-type-json',
  yaml: 'vscode-icons:file-type-yaml',
  yml: 'vscode-icons:file-type-yaml',
  toml: 'vscode-icons:file-type-toml',
  xml: 'vscode-icons:file-type-xml',
  env: 'vscode-icons:file-type-dotenv',

  // 文档
  md: 'vscode-icons:file-type-markdown',
  markdown: 'vscode-icons:file-type-markdown',
  pdf: 'vscode-icons:file-type-pdf2',
  doc: 'vscode-icons:file-type-word',
  docx: 'vscode-icons:file-type-word',
  xls: 'vscode-icons:file-type-excel',
  xlsx: 'vscode-icons:file-type-excel',
  ppt: 'vscode-icons:file-type-powerpoint',
  pptx: 'vscode-icons:file-type-powerpoint',
  txt: 'vscode-icons:file-type-text',

  // Tibis 内置格式本质为 JSON 结构，按 JSON 图标展示。
  tibis: 'vscode-icons:file-type-json',

  // 后端 / 脚本
  py: 'vscode-icons:file-type-python',
  rb: 'vscode-icons:file-type-ruby',
  go: 'vscode-icons:file-type-go-gopher',
  rs: 'vscode-icons:file-type-rust',
  java: 'vscode-icons:file-type-java',
  kt: 'vscode-icons:file-type-kotlin',
  swift: 'vscode-icons:file-type-swift',
  c: 'vscode-icons:file-type-c',
  cpp: 'vscode-icons:file-type-cpp',
  h: 'vscode-icons:file-type-cheader',
  hpp: 'vscode-icons:file-type-cpp',
  cs: 'vscode-icons:file-type-csharp',
  php: 'vscode-icons:file-type-php',
  sh: 'vscode-icons:file-type-shell',
  bash: 'vscode-icons:file-type-shell',
  zsh: 'vscode-icons:file-type-shell',
  sql: 'vscode-icons:file-type-sql',
  graphql: 'vscode-icons:file-type-graphql',
  gql: 'vscode-icons:file-type-graphql',
  prisma: 'vscode-icons:file-type-prisma',

  // 图片
  png: 'vscode-icons:file-type-image',
  jpg: 'vscode-icons:file-type-image',
  jpeg: 'vscode-icons:file-type-image',
  gif: 'vscode-icons:file-type-image',
  svg: 'vscode-icons:file-type-svg',
  ico: 'vscode-icons:file-type-image',
  webp: 'vscode-icons:file-type-image',

  // 锁 / 包管理
  lock: 'vscode-icons:file-type-lock',
  packagejson: 'vscode-icons:file-type-npm',

  // Docker
  dockerfile: 'vscode-icons:file-type-docker'
};

/** 未知文件类型的默认图标 */
const DEFAULT_ICON = 'vscode-icons:default-file';

/**
 * 根据文件扩展名获取对应的 Iconify 图标名
 * @param ext - 文件扩展名（不含点号），如 'ts'、'vue'
 * @returns Iconify 图标名
 */
export function getFileIcon(ext: string): string {
  return EXT_ICON_MAP[ext.toLowerCase()] ?? DEFAULT_ICON;
}

/**
 * 根据完整文件名获取对应的 Iconify 图标名。
 * @param fileName - 完整文件名，如 `package.json`、`README.md`
 * @returns Iconify 图标名
 */
export function getFileIconByName(fileName: string): string {
  const normalizedFileName = fileName.toLowerCase();
  if (normalizedFileName === 'package.json') {
    return getFileIcon('packagejson');
  }

  return getFileIcon(normalizedFileName.split('.').at(-1) ?? '');
}
