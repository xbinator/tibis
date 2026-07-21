/**
 * @file no-speech-feature.test.ts
 * @description 验证项目已移除语音功能的活跃入口、资源与脚本。
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

/**
 * package.json 中测试关注的清单字段。
 */
interface PackageManifest {
  /** npm scripts 配置。 */
  scripts?: Record<string, string>;
}

/**
 * electron-builder 资源配置项。
 */
interface ElectronBuilderResource {
  /** 资源来源路径。 */
  from?: string;
  /** 资源目标路径。 */
  to?: string;
}

/**
 * electron-builder 配置中测试关注的字段。
 */
interface ElectronBuilderConfig {
  /** 额外打包资源列表。 */
  extraResources?: ElectronBuilderResource[];
}

/** 仓库根目录。 */
const ROOT_DIR = process.cwd();

/** 已删除的语音功能目录或文件。 */
const REMOVED_SPEECH_PATHS = [
  '.github/workflows/build-speech-runtime.yml',
  'docs/speech',
  'electron/main/modules/speech',
  'resources/speech',
  'scripts/speech',
  'src/components/BChat/components/InputToolbar/VoiceInput.vue',
  'src/components/BChat/components/InputToolbar/VoiceWaveform.vue',
  'src/components/BChat/hooks/useVoiceInput.ts',
  'src/components/BChat/hooks/useVoiceRecorder.ts',
  'src/components/BChat/hooks/useVoiceSession.ts',
  'src/views/settings/speech'
];

/** 移除语音功能后仍保留的活跃源码入口。 */
const ACTIVE_SOURCE_PATHS = [
  'README.md',
  'electron-builder.yml',
  'electron/main/modules/index.mts',
  'electron/preload/index.mts',
  'package.json',
  'src/components/BChat/components/InputToolbar.vue',
  'src/components/BChat/hooks/useChatComposer.ts',
  'src/components/BChat/index.vue',
  'src/router/routes/modules/settings.ts',
  'src/views/settings/constants.ts',
  'types/electron-api.d.ts'
];

/** 活跃代码与说明文档中不应再出现的语音功能标识。 */
const SPEECH_FEATURE_PATTERN = /speech|voice|语音|麦克风|microphone|whisper|transcribeAudio|SpeechRuntime/i;

/**
 * 读取仓库内文本文件。
 * @param relativePath - 仓库相对路径
 * @returns 文件内容
 */
function readProjectFile(relativePath: string): string {
  return readFileSync(path.join(ROOT_DIR, relativePath), 'utf8');
}

/**
 * 读取 package.json。
 * @returns package.json 清单
 */
function readPackageManifest(): PackageManifest {
  return JSON.parse(readProjectFile('package.json')) as PackageManifest;
}

/**
 * 读取 electron-builder 配置。
 * @returns electron-builder YAML 配置
 */
function readElectronBuilderConfig(): ElectronBuilderConfig {
  return load(readProjectFile('electron-builder.yml')) as ElectronBuilderConfig;
}

describe('speech feature removal', (): void => {
  it('removes speech-specific files and directories', (): void => {
    const remainingPaths = REMOVED_SPEECH_PATHS.filter((relativePath: string): boolean => existsSync(path.join(ROOT_DIR, relativePath)));

    expect(remainingPaths).toEqual([]);
  });

  it('removes speech scripts and packaged resources', (): void => {
    const manifest = readPackageManifest();
    const scriptNames = Object.keys(manifest.scripts ?? {});
    const speechScriptNames = scriptNames.filter((scriptName: string): boolean => scriptName.startsWith('speech:'));
    const builderConfig = readElectronBuilderConfig();
    const speechResources = (builderConfig.extraResources ?? []).filter(
      (resource: ElectronBuilderResource): boolean => resource.from === 'resources/speech' || resource.to === 'speech'
    );

    expect(speechScriptNames).toEqual([]);
    expect(speechResources).toEqual([]);
  });

  it('removes speech references from active routes, menus, APIs, and chat inputs', (): void => {
    const remainingReferences = ACTIVE_SOURCE_PATHS.filter((relativePath: string): boolean => SPEECH_FEATURE_PATTERN.test(readProjectFile(relativePath)));

    expect(remainingReferences).toEqual([]);
  });
});
