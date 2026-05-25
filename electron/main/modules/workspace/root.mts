/**
 * @file root.mts
 * @description Tibis 工作区根目录提供器，负责解析、创建和规范化默认工作区目录。
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * Tibis 工作区根目录信息。
 */
export interface TibisWorkspaceRoot {
  /** 绝对根目录路径，作为安全边界。 */
  rootPath: string;
  /** 本次请求是否创建了目录。 */
  created: boolean;
}

/**
 * 解析当前平台的默认工作区根目录路径。
 * macOS/Linux: ~/.tibis
 * Windows: %USERPROFILE%\.tibis
 * @returns 默认工作区根目录的绝对路径
 */
export function resolveDefaultWorkspaceRoot(): string {
  return path.join(os.homedir(), '.tibis');
}

/**
 * 确保 Tibis 工作区根目录存在，不存在时自动创建。
 * @returns 工作区根目录元数据
 * @throws 目录创建或规范化失败时抛出错误
 */
export async function ensureTibisWorkspaceRoot(): Promise<TibisWorkspaceRoot> {
  const rawPath = resolveDefaultWorkspaceRoot();

  let created = false;
  try {
    await fs.access(rawPath);
  } catch {
    // 目录不存在，递归创建
    await fs.mkdir(rawPath, { recursive: true });
    created = true;
  }

  // 规范化路径（解析符号链接、去除尾部分隔符）
  const rootPath = await fs.realpath(rawPath);

  return { rootPath, created };
}
