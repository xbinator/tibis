/**
 * @file status.ts
 * @description 文件路径状态判断工具。
 */

/**
 * 文件路径状态。
 */
export interface FilePathStatus {
  /** 路径是否存在 */
  exists: boolean;
  /** 路径是否为文件 */
  isFile: boolean;
  /** 路径是否为目录 */
  isDirectory: boolean;
}

/**
 * 文件路径状态读取器。
 */
export interface PathStatusReader {
  /** 获取路径状态 */
  getPathStatus?: (targetPath: string) => Promise<FilePathStatus>;
}

/**
 * 判断目录是否可读取。
 * @param dirPath - 目录路径
 * @param reader - 路径状态读取器
 * @returns 目录存在且为目录时返回 true；状态 API 不存在时按旧行为返回 true
 */
export async function canReadDirectory(dirPath: string, reader: PathStatusReader): Promise<boolean> {
  if (!reader.getPathStatus) {
    return true;
  }

  try {
    const status = await reader.getPathStatus(dirPath);
    return status.exists && status.isDirectory;
  } catch {
    return false;
  }
}
