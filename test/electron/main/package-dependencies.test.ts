/**
 * @file package-dependencies.test.ts
 * @description Electron 主进程运行时依赖打包归属测试。
 */
import { readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * package.json 依赖字段。
 */
type DependencyMap = Record<string, string>;

/**
 * package.json 清单中测试需要读取的字段。
 */
interface PackageManifest {
  /** 生产环境依赖，会被 electron-builder 打进安装包。 */
  dependencies?: DependencyMap;
  /** 开发环境依赖，不保证存在于安装后的 Electron 应用。 */
  devDependencies?: DependencyMap;
}

/**
 * 主进程运行时裸包导入记录。
 */
interface RuntimeImportRecord {
  /** 导入所在文件路径。 */
  filePath: string;
  /** 原始模块 specifier。 */
  specifier: string;
  /** 对应 npm 包名。 */
  packageName: string;
}

/** Node.js 与 Electron 运行时天然可解析的模块名。 */
const RUNTIME_BUILTIN_MODULES = new Set<string>([...builtinModules, ...builtinModules.map((moduleName) => `node:${moduleName}`), 'electron']);

/** Electron 主进程源码根目录。 */
const ELECTRON_MAIN_DIR = path.resolve(process.cwd(), 'electron/main');

/**
 * 读取项目 package.json。
 * @returns package.json 清单
 */
function readPackageManifest(): PackageManifest {
  const manifestText = readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8');

  return JSON.parse(manifestText) as PackageManifest;
}

/**
 * 递归读取目录下所有指定后缀的文件。
 * @param directoryPath - 待读取目录
 * @param extension - 文件后缀
 * @returns 文件绝对路径列表
 */
function readFilesByExtension(directoryPath: string, extension: string): string[] {
  const directoryEntries = ts.sys.readDirectory(directoryPath, [extension], undefined, undefined);

  return directoryEntries.map((filePath) => path.resolve(filePath));
}

/**
 * 判断模块 specifier 是否为运行时需要解析的第三方包。
 * @param specifier - 模块 specifier
 * @returns 是否为第三方运行时依赖
 */
function isRuntimePackageSpecifier(specifier: string): boolean {
  if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('types/')) {
    return false;
  }

  return !RUNTIME_BUILTIN_MODULES.has(specifier);
}

/**
 * 从模块 specifier 中提取 npm 包名。
 * @param specifier - 模块 specifier
 * @returns npm 包名
 */
function getPackageName(specifier: string): string {
  if (specifier.startsWith('@')) {
    const [scope, packageName] = specifier.split('/');

    return `${scope}/${packageName}`;
  }

  return specifier.split('/')[0];
}

/**
 * 从源码文件中收集运行时第三方包导入。
 * @param filePath - 源码文件路径
 * @returns 运行时第三方包导入列表
 */
function collectRuntimePackageImports(filePath: string): RuntimeImportRecord[] {
  const sourceText = readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
  const records: RuntimeImportRecord[] = [];

  sourceFile.forEachChild((node) => {
    if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text;

      if (isRuntimePackageSpecifier(specifier)) {
        records.push({ filePath, specifier, packageName: getPackageName(specifier) });
      }
    }

    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text;

      if (isRuntimePackageSpecifier(specifier)) {
        records.push({ filePath, specifier, packageName: getPackageName(specifier) });
      }
    }
  });

  return records;
}

/**
 * 格式化缺失生产依赖的导入信息。
 * @param record - 导入记录
 * @returns 易读的错误描述
 */
function formatMissingRuntimeDependency(record: RuntimeImportRecord): string {
  const relativePath = path.relative(process.cwd(), record.filePath);

  return `${record.packageName} imported as "${record.specifier}" in ${relativePath}`;
}

describe('electron package dependencies', (): void => {
  it('keeps runtime main-process imports in production dependencies', (): void => {
    const manifest = readPackageManifest();
    const dependencies = new Set<string>(Object.keys(manifest.dependencies ?? {}));
    const devDependencies = new Set<string>(Object.keys(manifest.devDependencies ?? {}));
    const sourceFiles = readFilesByExtension(ELECTRON_MAIN_DIR, '.mts');
    const runtimeImports = sourceFiles.flatMap(collectRuntimePackageImports);
    const missingProductionDependencies = runtimeImports.filter((record) => !dependencies.has(record.packageName) && devDependencies.has(record.packageName));

    expect(missingProductionDependencies.map(formatMissingRuntimeDependency)).toEqual([]);
  });
});
