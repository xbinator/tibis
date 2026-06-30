/**
 * @file package.ts
 * @description 通用 zip 包根文件与资源文件解析工具。
 */
import JSZip from 'jszip';

/** zip 文件 magic bytes（PK\x03\x04）。 */
const ZIP_MAGIC = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

/**
 * zip 包资源文件。
 */
export interface ZipPackageResource {
  /** zip 内安全相对路径。 */
  relativePath: string;
  /** 文件二进制内容。 */
  content: ArrayBuffer;
}

/**
 * zip 包读取选项。
 */
export interface ZipPackageReadOptions {
  /** 根层入口文件名，如 SKILL.md 或 widget.json。 */
  rootFileName: string;
  /** 最大非目录条目数量。 */
  maxEntries?: number;
  /** 单个资源文件最大字节数。 */
  maxFileBytes?: number;
}

/**
 * zip 包读取结果。
 */
export interface ZipPackageReadResult {
  /** 根层入口文件文本内容。 */
  rootFileContent: string;
  /** 入口文件之外的资源文件。 */
  resources: ZipPackageResource[];
}

/**
 * 检查 ArrayBuffer 前 4 字节是否为 zip magic bytes。
 * @param buffer - 待检查二进制内容
 * @returns 是否为 zip 格式
 */
export function isZipPackageBuffer(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < ZIP_MAGIC.byteLength) {
    return false;
  }

  const header = new Uint8Array(buffer.slice(0, ZIP_MAGIC.byteLength));

  return header.every((byte: number, index: number): boolean => byte === ZIP_MAGIC[index]);
}

/**
 * 检查并归一化 zip 条目路径。
 * @param entryName - zip 条目名
 * @returns 安全相对路径
 */
export function normalizeZipEntryPath(entryName: string): string {
  const normalized = entryName.replace(/\\/g, '/');
  const segments = normalized.split('/');

  if (!normalized || normalized.startsWith('/') || segments.includes('..')) {
    throw new Error(`zip 条目路径不安全：${entryName}`);
  }

  return normalized;
}

/**
 * 校验 zip 非目录条目数量。
 * @param entries - zip 非目录条目
 * @param maxEntries - 最大数量
 */
function assertEntryCount(entries: JSZip.JSZipObject[], maxEntries: number | undefined): void {
  if (typeof maxEntries === 'number' && entries.length > maxEntries) {
    throw new Error(`压缩包包含 ${entries.length} 个文件，超过上限 ${maxEntries} 个`);
  }
}

/**
 * 读取根层入口文件。
 * @param entries - zip 非目录条目
 * @param rootFileName - 根层入口文件名
 * @returns 入口文件条目
 */
function findRootFileEntry(entries: JSZip.JSZipObject[], rootFileName: string): JSZip.JSZipObject {
  const rootFileEntry = entries.find((entry: JSZip.JSZipObject): boolean => normalizeZipEntryPath(entry.name) === rootFileName);

  if (!rootFileEntry) {
    throw new Error(`zip 中未找到根层级 ${rootFileName}`);
  }

  return rootFileEntry;
}

/**
 * 判断 zip 包资源是否存在。
 * @param resource - 待判断资源
 * @returns 是否为有效资源
 */
function isZipPackageResource(resource: ZipPackageResource | null): resource is ZipPackageResource {
  return resource !== null;
}

/**
 * 读取单个资源条目。
 * @param entry - zip 条目
 * @param rootFileEntry - 根层入口文件条目
 * @param options - 读取选项
 * @returns 资源文件或空值
 */
async function readResourceEntry(
  entry: JSZip.JSZipObject,
  rootFileEntry: JSZip.JSZipObject,
  options: ZipPackageReadOptions
): Promise<ZipPackageResource | null> {
  const relativePath = normalizeZipEntryPath(entry.name);

  if (entry === rootFileEntry) {
    return null;
  }

  const content = await entry.async('arraybuffer');

  if (typeof options.maxFileBytes === 'number' && content.byteLength > options.maxFileBytes) {
    throw new Error(`文件 "${relativePath}" 解压后超过 ${options.maxFileBytes} 字节限制`);
  }

  return {
    relativePath,
    content
  };
}

/**
 * 顺序读取资源条目，避免多个大文件同时解压造成内存峰值过高。
 * @param entries - zip 非目录条目
 * @param rootFileEntry - 根层入口文件条目
 * @param options - 读取选项
 * @returns 资源文件列表
 */
async function readResourceEntries(
  entries: JSZip.JSZipObject[],
  rootFileEntry: JSZip.JSZipObject,
  options: ZipPackageReadOptions
): Promise<ZipPackageResource[]> {
  return entries.reduce<Promise<ZipPackageResource[]>>(
    async (previous: Promise<ZipPackageResource[]>, entry: JSZip.JSZipObject): Promise<ZipPackageResource[]> => {
      const resources = await previous;
      const resource = await readResourceEntry(entry, rootFileEntry, options);

      if (isZipPackageResource(resource)) {
        resources.push(resource);
      }

      return resources;
    },
    Promise.resolve([])
  );
}

/**
 * 读取 zip 包根层入口文件与附带资源。
 * @param buffer - zip 文件二进制内容
 * @param options - 读取选项
 * @returns zip 包读取结果
 */
export async function readZipPackage(buffer: ArrayBuffer, options: ZipPackageReadOptions): Promise<ZipPackageReadResult> {
  if (!isZipPackageBuffer(buffer)) {
    throw new Error('不支持的文件格式，仅支持 ZIP 格式');
  }

  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.values(zip.files).filter((entry: JSZip.JSZipObject): boolean => !entry.dir);

  entries.forEach((entry: JSZip.JSZipObject): void => {
    normalizeZipEntryPath(entry.name);
  });
  assertEntryCount(entries, options.maxEntries);

  const rootFileEntry = findRootFileEntry(entries, options.rootFileName);
  const resources = await readResourceEntries(entries, rootFileEntry, options);

  return {
    rootFileContent: await rootFileEntry.async('string'),
    resources
  };
}
