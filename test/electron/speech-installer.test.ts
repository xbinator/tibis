/**
 * @file speech-installer.test.ts
 * @description 验证语音运行时安装器会生成 current 目录和 manifest。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const chmodMock = vi.fn();
const mkdirMock = vi.fn();
const renameMock = vi.fn();
const rmMock = vi.fn();
const writeFileMock = vi.fn();

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('node:fs/promises');

  return {
    ...actual,
    chmod: chmodMock,
    mkdir: mkdirMock,
    rename: renameMock,
    rm: rmMock,
    writeFile: writeFileMock
  };
});

describe('installSpeechRuntime', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
    chmodMock.mockReset();
    mkdirMock.mockReset();
    renameMock.mockReset();
    rmMock.mockReset();
    writeFileMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('writes manifest and stages current assets after successful install', async () => {
    chmodMock.mockResolvedValue(undefined);
    mkdirMock.mockResolvedValue(undefined);
    renameMock.mockResolvedValue(undefined);
    rmMock.mockResolvedValue(undefined);
    writeFileMock.mockResolvedValue(undefined);

    const extractZipAsset = vi.fn(async ({ outputFilePath }: { outputFilePath: string }) => {
      await mkdirMock(outputFilePath, { recursive: true });
    });

    const { installSpeechRuntime } = await import('../../electron/main/modules/speech/installer.mjs');
    await installSpeechRuntime({
      userDataPath: '/tmp/runtime-test',
      platform: 'darwin',
      arch: 'arm64',
      manifest: {
        platform: 'darwin',
        arch: 'arm64',
        version: '2026.05.04',
        modelName: 'ggml-base',
        assets: [
          {
            name: 'whisper',
            url: 'memory://whisper.zip',
            sha256: '',
            archiveType: 'zip',
            targetRelativePath: 'bin/whisper'
          },
          {
            name: 'model',
            url: 'memory://ggml-base.bin',
            sha256: '',
            archiveType: 'file',
            targetRelativePath: 'models/ggml-base.bin'
          }
        ]
      },
      downloadAsset: async (asset) => Buffer.from(asset.name),
      extractZipAsset
    });

    expect(extractZipAsset).toHaveBeenCalledWith({
      asset: expect.objectContaining({ name: 'whisper' }),
      bytes: Buffer.from('whisper'),
      outputFilePath: expect.stringContaining('whisper')
    });
    expect(writeFileMock).toHaveBeenCalledWith(expect.stringContaining('ggml-base.bin'), Buffer.from('model'));
    expect(writeFileMock).toHaveBeenCalledWith(
      expect.stringContaining('manifest.json'),
      JSON.stringify({
        version: '2026.05.04',
        modelName: 'ggml-base',
        platform: 'darwin',
        arch: 'arm64',
        currentDir: 'current'
      })
    );
  });

  it('resolves runtime manifest from manifest url when provided', async () => {
    vi.stubEnv('TIBIS_SPEECH_RUNTIME_MANIFEST_URL', 'https://download.example.com/speech-runtime/manifest.json');

    const { resolveSpeechRuntimeManifest } = await import('../../electron/main/modules/speech/installer.mjs');
    const manifest = await resolveSpeechRuntimeManifest('darwin', 'arm64', {
      downloadUrl: async () =>
        Buffer.from(
          JSON.stringify({
            currentVersion: '2026.05.04',
            platforms: {
              'darwin-arm64': {
                platform: 'darwin',
                arch: 'arm64',
                version: '2026.05.04',
                modelName: 'ggml-base',
                assets: [
                  {
                    name: 'whisper',
                    url: 'https://download.example.com/speech-runtime/2026.05.04/darwin-arm64/whisper',
                    sha256: 'sha-whisper',
                    archiveType: 'file',
                    targetRelativePath: 'bin/whisper'
                  },
                  {
                    name: 'model',
                    url: 'https://download.example.com/speech-runtime/2026.05.04/models/ggml-base.bin',
                    sha256: 'sha-model',
                    archiveType: 'file',
                    targetRelativePath: 'models/ggml-base.bin'
                  }
                ]
              }
            }
          })
        )
    });

    expect(manifest).toEqual({
      platform: 'darwin',
      arch: 'arm64',
      version: '2026.05.04',
      modelName: 'ggml-base',
      assets: [
        {
          name: 'whisper',
          url: 'https://download.example.com/speech-runtime/2026.05.04/darwin-arm64/whisper',
          sha256: 'sha-whisper',
          archiveType: 'file',
          targetRelativePath: 'bin/whisper'
        },
        {
          name: 'model',
          url: 'https://download.example.com/speech-runtime/2026.05.04/models/ggml-base.bin',
          sha256: 'sha-model',
          archiveType: 'file',
          targetRelativePath: 'models/ggml-base.bin'
        }
      ]
    });

  });

  it('resolves runtime manifest from bundled resources when no remote env is configured', async () => {
    const { resolveSpeechRuntimeManifest } = await import('../../electron/main/modules/speech/installer.mjs');
    const manifest = await resolveSpeechRuntimeManifest('darwin', 'arm64');

    expect(manifest).toEqual({
      platform: 'darwin',
      arch: 'arm64',
      version: '2026.05.04',
      modelName: 'ggml-base',
      assets: [
        {
          name: 'whisper',
          url: 'https://github.com/xbinator/tibis/releases/download/speech-runtime-2026.05.04/whisper-darwin-arm64',
          sha256: '47ba9215712384a2b81dacaa06b7047bdd7f424b1eb6ad533f1450a2472c2920',
          archiveType: 'file',
          targetRelativePath: 'bin/whisper'
        },
        {
          name: 'model',
          url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
          sha256: '60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe',
          archiveType: 'file',
          targetRelativePath: 'models/ggml-base.bin'
        }
      ]
    });
  });
});
