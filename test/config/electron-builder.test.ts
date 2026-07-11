/**
 * @file electron-builder.test.ts
 * @description 验证 Windows 安装向导和便携版的 electron-builder 配置。
 */
import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

/**
 * NSIS 安装器配置。
 */
interface NsisInstallerConfig {
  /** 是否使用一键安装。 */
  oneClick?: boolean;
  /** 是否允许修改安装目录。 */
  allowToChangeInstallationDirectory?: boolean;
  /** 是否固定为所有用户安装。 */
  perMachine?: boolean;
  /** 是否默认选择所有用户安装。 */
  selectPerMachineByDefault?: boolean;
  /** 是否允许安装器请求管理员权限。 */
  allowElevation?: boolean;
  /** 是否创建桌面快捷方式。 */
  createDesktopShortcut?: boolean;
  /** 是否创建开始菜单快捷方式。 */
  createStartMenuShortcut?: boolean;
  /** 快捷方式名称。 */
  shortcutName?: string;
  /** 安装完成后是否允许启动应用。 */
  runAfterFinish?: boolean;
  /** 安装包产物名称模板。 */
  artifactName?: string;
}

/**
 * 便携版配置。
 */
interface PortableInstallerConfig {
  /** 便携版产物名称模板。 */
  artifactName?: string;
}

/**
 * Windows 构建配置。
 */
interface WindowsInstallerConfig {
  /** Windows 构建目标。 */
  target?: string[];
}

/**
 * 测试所需的 electron-builder 配置结构。
 */
interface ElectronBuilderConfig {
  /** NSIS 安装器配置。 */
  nsis?: NsisInstallerConfig;
  /** 便携版配置。 */
  portable?: PortableInstallerConfig;
  /** Windows 构建配置。 */
  win?: WindowsInstallerConfig;
}

/**
 * 读取 electron-builder YAML 配置。
 * @returns 测试所需的构建配置
 */
function readElectronBuilderConfig(): ElectronBuilderConfig {
  const source = readFileSync(new URL('../../electron-builder.yml', import.meta.url), 'utf8');
  return load(source) as ElectronBuilderConfig;
}

describe('electron-builder Windows installer config', (): void => {
  it('uses an assisted installer with configurable scope and directory', (): void => {
    const config = readElectronBuilderConfig();

    expect(config.nsis).toMatchObject({
      oneClick: false,
      allowToChangeInstallationDirectory: true,
      perMachine: false,
      selectPerMachineByDefault: false,
      allowElevation: true,
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      shortcutName: 'Tibis',
      runAfterFinish: true,
      artifactName: `tibis-\${os}-\${arch}-setup.\${ext}`
    });
  });

  it('uses a distinct artifact name for the portable executable', (): void => {
    const config = readElectronBuilderConfig();

    expect(config.portable).toMatchObject({
      artifactName: `tibis-\${os}-\${arch}-portable.\${ext}`
    });
  });

  it('keeps both installer and portable Windows targets enabled', (): void => {
    const config = readElectronBuilderConfig();

    expect(config.win?.target).toEqual(['nsis', 'portable']);
  });
});
