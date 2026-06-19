/**
 * @file paths.mts
 * @description ChatRuntime 主进程工具路径解析。
 */
import * as path from 'node:path';
import type { RuntimeReadTarget, RuntimeWriteTarget } from './types.mjs';
import type { AIToolExecutionResult } from 'types/ai';
import { WRITE_FILE_TOOL_NAME } from './constants.mjs';
import { createMainToolFailureResult } from './results.mjs';

/**
 * 判断文件路径是否为绝对路径。
 * @param filePath - 文件路径
 * @returns 是否为绝对路径
 */
export function isAbsoluteRuntimeFilePath(filePath: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(filePath) || filePath.startsWith('/') || filePath.startsWith('\\\\');
}

/**
 * 判断相对路径是否会逃逸工作区。
 * @param resolvedPath - 已解析路径
 * @param workspaceRoot - 工作区根目录
 * @returns 是否逃逸工作区
 */
function isRuntimePathEscapedWorkspace(resolvedPath: string, workspaceRoot: string): boolean {
  const relativePath = path.relative(workspaceRoot, resolvedPath);
  return relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath);
}

/**
 * 判断文件路径是否位于工作区内。
 * @param filePath - 文件路径
 * @param workspaceRoot - 工作区根目录
 * @returns 是否位于工作区内
 */
export function isRuntimePathInsideWorkspace(filePath: string, workspaceRoot: string | undefined): boolean {
  if (!workspaceRoot) return false;

  const resolvedRoot = path.resolve(workspaceRoot);
  const resolvedPath = isAbsoluteRuntimeFilePath(filePath) ? path.resolve(filePath) : path.resolve(resolvedRoot, filePath);
  return !isRuntimePathEscapedWorkspace(resolvedPath, resolvedRoot);
}

/**
 * 判断路径是否为未保存虚拟路径。
 * @param filePath - 文件路径
 * @returns 是否为未保存路径
 */
export function isRuntimeUnsavedPath(filePath: string): boolean {
  return filePath.startsWith('unsaved://');
}

/**
 * 解析只读文件目标路径。
 * @param filePath - 原始文件路径
 * @param workspaceRoot - 工作区根目录
 * @param toolName - 触发解析的工具名
 * @returns 读取目标或失败结果
 */
export function resolveRuntimeReadTarget(filePath: string, workspaceRoot: string | undefined, toolName: string): RuntimeReadTarget | AIToolExecutionResult {
  if (isRuntimeUnsavedPath(filePath)) {
    return createMainToolFailureResult(toolName, 'EDITOR_UNAVAILABLE', '未保存文件需要由当前编辑器提供内容');
  }

  if (!workspaceRoot) {
    if (!isAbsoluteRuntimeFilePath(filePath)) {
      return createMainToolFailureResult(toolName, 'INVALID_INPUT', '未配置工作区时不能读取相对路径');
    }

    return { filePath, outsideWorkspace: false };
  }

  const resolvedRoot = path.resolve(workspaceRoot);
  if (isAbsoluteRuntimeFilePath(filePath)) {
    return {
      filePath,
      outsideWorkspace: !isRuntimePathInsideWorkspace(filePath, resolvedRoot)
    };
  }

  const resolvedPath = path.resolve(resolvedRoot, filePath);
  if (isRuntimePathEscapedWorkspace(resolvedPath, resolvedRoot)) {
    return createMainToolFailureResult(toolName, 'PERMISSION_DENIED', '相对路径超出了当前工作区范围');
  }

  return { filePath: resolvedPath, outsideWorkspace: false };
}

/**
 * 解析 write_file 目标路径。
 * @param filePath - 原始文件路径
 * @param workspaceRoot - 工作区根目录
 * @returns 写入目标或失败结果
 */
export function resolveRuntimeWriteTarget(filePath: string, workspaceRoot: string | undefined): RuntimeWriteTarget | AIToolExecutionResult {
  if (isRuntimeUnsavedPath(filePath)) {
    return { type: 'unsaved', filePath };
  }

  if (!workspaceRoot) {
    if (!isAbsoluteRuntimeFilePath(filePath)) {
      return { type: 'draft', originalPath: filePath };
    }

    return { type: 'file', filePath, outsideWorkspace: false };
  }

  const resolvedRoot = path.resolve(workspaceRoot);
  if (isAbsoluteRuntimeFilePath(filePath)) {
    return {
      type: 'file',
      filePath,
      outsideWorkspace: !isRuntimePathInsideWorkspace(filePath, resolvedRoot)
    };
  }

  const resolvedPath = path.resolve(resolvedRoot, filePath);
  if (isRuntimePathEscapedWorkspace(resolvedPath, resolvedRoot)) {
    return createMainToolFailureResult(WRITE_FILE_TOOL_NAME, 'PERMISSION_DENIED', '相对路径超出了当前工作区范围');
  }

  return { type: 'file', filePath: resolvedPath, outsideWorkspace: false };
}
