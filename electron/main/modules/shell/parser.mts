/**
 * @file parser.mts
 * @description Shell 命令 tree-sitter WASM 解析器，负责将命令文本解析为 AST。
 */
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { ShellCommandShell } from './types.mjs';
import { Language, Parser } from 'web-tree-sitter';

const nodeRequire = createRequire(import.meta.url);

/**
 * shell 命令解析结果。
 */
export interface ShellCommandParseResult {
  /** 解析是否成功（无语法错误）。 */
  ok: boolean;
  /** shell 类型。 */
  shell: ShellCommandShell;
  /** 解析失败时的错误信息。 */
  error?: string;
  /** 解析成功时的 AST 根节点。 */
  rootNode?: import('web-tree-sitter').Node;
}

/** 初始化状态。 */
let initialized = false;
let bashLanguage: Language | null = null;
let powershellLanguage: Language | null = null;

/**
 * 从 tree-sitter-* 包中读取 WASM 语法文件。
 * @param packageName - npm 包名
 * @param wasmFileName - WASM 文件名
 * @returns WASM 字节
 */
async function loadGrammarWasm(packageName: string, wasmFileName: string): Promise<Uint8Array> {
  const entryPath = nodeRequire.resolve(packageName);
  // bindings/node/index.js → go up 3 levels for package root
  const pkgRoot = path.dirname(path.dirname(path.dirname(entryPath)));
  const wasmPath = path.join(pkgRoot, wasmFileName);
  return readFile(wasmPath);
}

/**
 * 确保 WASM 运行时和语法已加载（惰性初始化）。
 */
async function ensureInitialized(): Promise<void> {
  if (initialized) return;

  await Parser.init();

  const [bashWasm, psWasm] = await Promise.all([
    loadGrammarWasm('tree-sitter-bash', 'tree-sitter-bash.wasm'),
    loadGrammarWasm('tree-sitter-powershell', 'tree-sitter-powershell.wasm')
  ]);

  [bashLanguage, powershellLanguage] = await Promise.all([Language.load(bashWasm), Language.load(psWasm)]);

  initialized = true;
}

/**
 * 解析 Shell 命令文本。
 * @param command - 命令文本
 * @param shell - shell 类型
 * @returns 解析结果
 */
export async function parseShellCommand(command: string, shell: ShellCommandShell): Promise<ShellCommandParseResult> {
  try {
    await ensureInitialized();
  } catch (error) {
    const message = error instanceof Error ? error.message : '解析器初始化失败';
    return { ok: false, shell, error: `Tree-sitter WASM 初始化失败: ${message}` };
  }

  const language = shell === 'bash' ? bashLanguage : powershellLanguage;
  if (!language) {
    return { ok: false, shell, error: `不支持的 shell: ${shell}` };
  }

  const parser = new Parser();
  parser.setLanguage(language);

  const tree = parser.parse(command);
  if (!tree) {
    return { ok: false, shell, error: '无法解析命令' };
  }

  const { rootNode } = tree;
  if (rootNode.hasError) {
    // 收集语法错误节点信息
    const errorNodes = rootNode.descendantsOfType('ERROR');
    const errorMessages = errorNodes
      .slice(0, 3)
      .map((n) => `"${n.text.slice(0, 80)}"`)
      .join(', ');
    return {
      ok: false,
      shell,
      error: `命令包含语法错误${errorMessages ? `: ${errorMessages}` : ''}`,
      rootNode
    };
  }

  return { ok: true, shell, rootNode };
}
