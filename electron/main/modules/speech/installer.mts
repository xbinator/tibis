/**
 * @file installer.mts
 * @description 安装语音运行时，负责下载、解压、校验和原子替换。
 */
import { createHash } from 'node:crypto';
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { get } from 'node:http';
import { get as getHttps } from 'node:https';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SpeechInstallProgress, SpeechRuntimeAsset, SpeechRuntimeManifestDefinition } from './types.mjs';
import { getSpeechRuntimeRoot } from './runtime.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * ZIP 资源解压输入。
 */
export interface SpeechZipExtractInput {
  /** 资源定义。 */
  asset: SpeechRuntimeAsset;
  /** 资源字节。 */
  bytes: Buffer;
  /** 解压后的目标文件路径。 */
  outputFilePath: string;
}

/**
 * 语音运行时安装选项。
 */
export interface InstallSpeechRuntimeOptions {
  /** 测试或调用方注入的 userData 根目录。 */
  userDataPath?: string;
  /** 平台标识。 */
  platform: 'darwin' | 'win32';
  /** 架构标识。 */
  arch: 'arm64' | 'x64';
  /** 当前安装清单。 */
  manifest: SpeechRuntimeManifestDefinition;
  /** 安装进度回调。 */
  onProgress?: (progress: SpeechInstallProgress) => void | Promise<void>;
  /** 可替换的下载实现。 */
  downloadAsset?: (asset: SpeechRuntimeAsset) => Promise<Buffer>;
  /** 可替换的 zip 解压实现。 */
  extractZipAsset?: (input: SpeechZipExtractInput) => Promise<void>;
}

/**
 * 远程 speech runtime 总清单。
 */
interface RemoteSpeechRuntimeIndexManifest {
  /** 当前默认版本。 */
  currentVersion: string;
  /** 平台清单映射。 */
  platforms: Record<string, SpeechRuntimeManifestDefinition>;
}

/**
 * Node 文件系统错误。
 */
interface NodeFileSystemError extends Error {
  /** Node 错误码。 */
  code?: string;
}

/**
 * 运行时清单解析选项。
 */
export interface ResolveSpeechRuntimeManifestOptions {
  /** 可替换的远程下载实现。 */
  downloadUrl?: (url: string) => Promise<Buffer>;
}

/**
 * 判断错误是否为文件不存在。
 * @param error - 待判断错误
 * @returns 是否为缺失文件错误
 */
function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && (error as NodeFileSystemError).code === 'ENOENT';
}

/**
 * 获取内置语音运行时清单的候选路径。
 * @returns 候选 manifest 路径列表
 */
function getBundledSpeechRuntimeManifestPaths(): string[] {
  const sourceManifestPath = resolvePath(__dirname, '../../../../resources/speech/manifest.json');
  const packagedManifestPath = process.resourcesPath ? join(process.resourcesPath, 'speech', 'manifest.json') : null;

  return packagedManifestPath ? [packagedManifestPath, sourceManifestPath] : [sourceManifestPath];
}

/**
 * 计算资源默认文件名。
 * @param platform - 平台标识
 * @returns whisper 文件名
 */
function resolveWhisperBinaryName(platform: 'darwin' | 'win32'): string {
  return platform === 'win32' ? 'whisper.exe' : 'whisper';
}

/**
 * 根据环境变量拼接基础 URL 形式的运行时清单。
 * @param platform - 平台标识
 * @param arch - 架构标识
 * @returns 运行时清单
 */
function resolveSpeechRuntimeManifestFromBaseUrl(platform: 'darwin' | 'win32', arch: 'arm64' | 'x64'): SpeechRuntimeManifestDefinition {
  const baseUrl = process.env.TIBIS_SPEECH_RUNTIME_BASE_URL?.trim();
  const version = process.env.TIBIS_SPEECH_RUNTIME_VERSION?.trim() || 'latest';
  const modelName = process.env.TIBIS_SPEECH_MODEL_NAME?.trim() || 'ggml-base';
  if (!baseUrl) {
    throw new Error('Missing TIBIS_SPEECH_RUNTIME_BASE_URL');
  }

  const platformDir = `${platform}-${arch}`;
  const whisperFileName = resolveWhisperBinaryName(platform);

  return {
    platform,
    arch,
    version,
    modelName,
    assets: [
      {
        name: 'whisper',
        url: `${baseUrl}/${platformDir}/${whisperFileName}`,
        sha256: process.env.TIBIS_SPEECH_WHISPER_SHA256?.trim() ?? '',
        archiveType: 'file',
        targetRelativePath: `bin/${whisperFileName}`
      },
      {
        name: 'model',
        url: `${baseUrl}/models/${modelName}.bin`,
        sha256: process.env.TIBIS_SPEECH_MODEL_SHA256?.trim() ?? '',
        archiveType: 'file',
        targetRelativePath: `models/${modelName}.bin`
      }
    ]
  };
}

/**
 * 下载远程 URL 内容。
 * @param url - 远程资源 URL
 * @returns 下载后的字节
 */
export async function downloadSpeechRuntimeUrl(url: string): Promise<Buffer> {
  const request = url.startsWith('https://') ? getHttps : get;

  return new Promise<Buffer>((resolve, reject) => {
    request(url, (response) => {
      if (!response.statusCode || response.statusCode >= 400) {
        reject(new Error(`Failed to download speech asset: ${url}`));
        return;
      }

      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * 从总清单选择当前平台的运行时清单。
 * @param indexManifest - 总清单
 * @param platform - 平台标识
 * @param arch - 架构标识
 * @returns 运行时清单
 */
function selectSpeechRuntimeManifestFromIndex(
  indexManifest: RemoteSpeechRuntimeIndexManifest,
  platform: 'darwin' | 'win32',
  arch: 'arm64' | 'x64'
): SpeechRuntimeManifestDefinition {
  const platformKey = `${platform}-${arch}`;
  const manifest = indexManifest.platforms[platformKey];
  if (!manifest) {
    throw new Error(`Speech runtime platform is not supported: ${platformKey}`);
  }

  return {
    ...manifest,
    version: manifest.version || indexManifest.currentVersion
  };
}

/**
 * 根据 manifest URL 解析运行时清单。
 * @param manifestUrl - manifest 地址
 * @param platform - 平台标识
 * @param arch - 架构标识
 * @returns 运行时清单
 */
async function resolveSpeechRuntimeManifestFromIndex(
  manifestUrl: string,
  platform: 'darwin' | 'win32',
  arch: 'arm64' | 'x64',
  downloadUrl: (url: string) => Promise<Buffer>
): Promise<SpeechRuntimeManifestDefinition> {
  const bytes = await downloadUrl(manifestUrl);
  const indexManifest = JSON.parse(bytes.toString('utf-8')) as RemoteSpeechRuntimeIndexManifest;
  return selectSpeechRuntimeManifestFromIndex(indexManifest, platform, arch);
}

/**
 * 从应用内置资源读取语音运行时总清单。
 * @returns 总清单，不存在时返回 null
 */
async function readBundledSpeechRuntimeIndexManifest(): Promise<RemoteSpeechRuntimeIndexManifest | null> {
  for (const manifestPath of getBundledSpeechRuntimeManifestPaths()) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const content = await readFile(manifestPath, 'utf-8');
      return JSON.parse(content) as RemoteSpeechRuntimeIndexManifest;
    } catch (error) {
      if (isMissingFileError(error)) {
        continue;
      }

      throw error;
    }
  }

  return null;
}

/**
 * 从应用内置资源解析语音运行时清单。
 * @param platform - 平台标识
 * @param arch - 架构标识
 * @returns 运行时清单，不存在内置清单时返回 null
 */
async function resolveSpeechRuntimeManifestFromBundledResource(
  platform: 'darwin' | 'win32',
  arch: 'arm64' | 'x64'
): Promise<SpeechRuntimeManifestDefinition | null> {
  const indexManifest = await readBundledSpeechRuntimeIndexManifest();
  if (!indexManifest) {
    return null;
  }

  return selectSpeechRuntimeManifestFromIndex(indexManifest, platform, arch);
}

/**
 * 根据配置解析运行时清单。
 * 优先使用 manifest URL，base URL 作为开发兜底。
 * @param platform - 平台标识
 * @param arch - 架构标识
 * @returns 运行时清单
 */
export async function resolveSpeechRuntimeManifest(
  platform: 'darwin' | 'win32',
  arch: 'arm64' | 'x64',
  options: ResolveSpeechRuntimeManifestOptions = {}
): Promise<SpeechRuntimeManifestDefinition> {
  const manifestUrl = process.env.TIBIS_SPEECH_RUNTIME_MANIFEST_URL?.trim();
  const downloadUrl = options.downloadUrl ?? downloadSpeechRuntimeUrl;
  if (manifestUrl) {
    return resolveSpeechRuntimeManifestFromIndex(manifestUrl, platform, arch, downloadUrl);
  }

  const bundledManifest = await resolveSpeechRuntimeManifestFromBundledResource(platform, arch);
  if (bundledManifest) {
    return bundledManifest;
  }

  return resolveSpeechRuntimeManifestFromBaseUrl(platform, arch);
}

/**
 * 下载远程资源。
 * @param asset - 资源定义
 * @returns 下载后的字节
 */
export async function downloadSpeechRuntimeAsset(asset: SpeechRuntimeAsset): Promise<Buffer> {
  return downloadSpeechRuntimeUrl(asset.url);
}

/**
 * 校验资源摘要。
 * @param asset - 资源定义
 * @param bytes - 资源字节
 */
function assertSpeechRuntimeAssetChecksum(asset: SpeechRuntimeAsset, bytes: Buffer): void {
  if (!asset.sha256) {
    return;
  }

  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== asset.sha256) {
    throw new Error(`Checksum mismatch for speech asset: ${asset.name}`);
  }
}

/**
 * 安装语音运行时。
 * @param options - 安装选项
 */
export async function installSpeechRuntime(options: InstallSpeechRuntimeOptions): Promise<void> {
  const runtimeRoot = getSpeechRuntimeRoot({ userDataPath: options.userDataPath });
  const tempDir = join(runtimeRoot, 'temp', `${Date.now()}`);
  const stagedDir = join(runtimeRoot, `runtime-${options.manifest.version}`);
  const currentDir = join(runtimeRoot, 'current');

  // 清理上次安装可能残留的临时目录，避免同名冲突
  await rm(tempDir, { recursive: true, force: true });
  await mkdir(tempDir, { recursive: true });

  const downloadAsset = options.downloadAsset ?? downloadSpeechRuntimeAsset;

  const extractZipAsset =
    options.extractZipAsset ??
    (async () => {
      throw new Error('extractZipAsset must be implemented');
    });

  // 语音运行时安装必须按资源顺序执行，便于稳定推送进度并保证 staged 目录内容完整。
  for (const [index, asset] of options.manifest.assets.entries()) {
    // eslint-disable-next-line no-await-in-loop
    await options.onProgress?.({
      phase: 'downloading',
      current: index + 1,
      total: options.manifest.assets.length,
      message: `Downloading ${asset.name}`
    });

    // eslint-disable-next-line no-await-in-loop
    const bytes = await downloadAsset(asset);
    assertSpeechRuntimeAssetChecksum(asset, bytes);
    const outputFilePath = join(tempDir, asset.targetRelativePath);
    // eslint-disable-next-line no-await-in-loop
    await mkdir(join(outputFilePath, '..'), { recursive: true });

    if (asset.archiveType === 'zip') {
      // eslint-disable-next-line no-await-in-loop
      await options.onProgress?.({
        phase: 'extracting',
        current: index + 1,
        total: options.manifest.assets.length,
        message: `Extracting ${asset.name}`
      });
      // eslint-disable-next-line no-await-in-loop
      await extractZipAsset({ asset, bytes, outputFilePath });
    } else {
      // eslint-disable-next-line no-await-in-loop
      await writeFile(outputFilePath, bytes);
    }

    if (asset.name === 'whisper' && options.platform !== 'win32') {
      // eslint-disable-next-line no-await-in-loop
      await chmod(outputFilePath, 0o755);
    }

    // eslint-disable-next-line no-await-in-loop
    await options.onProgress?.({
      phase: 'verifying',
      current: index + 1,
      total: options.manifest.assets.length,
      message: `Verified ${asset.name}`
    });
  }

  await rm(stagedDir, { recursive: true, force: true });
  await rename(tempDir, stagedDir);
  await rm(currentDir, { recursive: true, force: true });
  await rename(stagedDir, currentDir);

  await writeFile(
    join(runtimeRoot, 'manifest.json'),
    JSON.stringify({
      version: options.manifest.version,
      modelName: options.manifest.modelName,
      platform: options.manifest.platform,
      arch: options.manifest.arch,
      currentDir: 'current'
    })
  );

  await options.onProgress?.({
    phase: 'completed',
    current: options.manifest.assets.length,
    total: options.manifest.assets.length,
    message: 'Speech runtime installed'
  });
}
