/**
 * @file title.ts
 * @description 统一生成文件展示标题。
 */

/**
 * 文件标题解析参数。
 */
export interface FileTitleParts {
  /** 文件名主体。 */
  name: string;
  /** 文件扩展名。 */
  ext: string;
}

/**
 * 生成统一文件标题，优先展示"文件名.扩展名"。
 * @param parts - 文件名与扩展名
 * @returns 文件展示标题
 */
export function resolveFileTitle(parts: FileTitleParts): string {
  const normalizedName = parts.name.trim();
  const normalizedExt = parts.ext.trim();

  if (normalizedName && normalizedExt) {
    const expectedSuffix = `.${normalizedExt}`;

    if (normalizedName.endsWith(expectedSuffix)) return normalizedName;

    return `${normalizedName}${expectedSuffix}`;
  }

  if (normalizedName) {
    return normalizedName;
  }

  return normalizedExt ? `Untitled.${normalizedExt}` : 'Untitled';
}
