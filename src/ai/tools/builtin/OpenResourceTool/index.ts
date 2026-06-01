/**
 * @file OpenResourceTool/index.ts
 * @description 内置资源打开工具实现（打开文件/URL 到编辑器标签页）
 */
import type { AIToolConfirmationAdapter, AIToolConfirmationRequest } from '../../confirmation';
import type { ToolWorkspaceOptions } from '../../shared/types';
import type { AIToolExecutor } from 'types/ai';
import { isAbsoluteFilePath, isPathInsideWorkspace } from '@/shared/workspace/pathUtils';
import { createToolCancelledResult, createToolFailureResult, createToolSuccessResult } from '../../results';

/** open_resource 工具名称 */
export const OPEN_RESOURCE_TOOL_NAME = 'open_resource';

/** open_resource 工具输入参数 */
export interface OpenResourceInput {
  /** 文件路径（相对/绝对）或 URL */
  path: string;
}

/** 资源类型 */
export type ResourceType = 'file' | 'webview' | 'external';

/** open_resource 工具返回结果 */
export interface OpenResourceResult {
  /** 规范化后的路径或 URL */
  path: string;
  /** 资源类型 */
  resourceType: ResourceType;
  /** 是否成功打开 */
  opened: boolean;
  /** 文件 ID（仅 file 类型时返回） */
  fileId?: string;
}

/** 创建 open_resource 工具的选项 */
export interface CreateOpenResourceToolOptions extends ToolWorkspaceOptions {
  /** 用户确认适配器，工作区外文件打开需用户确认 */
  confirm?: AIToolConfirmationAdapter;
  /** 通过文件路径打开文件标签页，返回打开的文件记录，未找到时返回 null */
  openFileByPath?: (filePath: string) => Promise<{ id: string } | null>;
  /** 在内置 webview 中打开 URL */
  openInWebview?: (url: string) => void;
  /** 在系统浏览器中打开 URL（mailto/ftp 等） */
  openExternal?: (url: string) => void;
}

/** URL 协议正则 */
const URL_PROTOCOL_RE = /^(https?|mailto|ftp):\/\//i;

/**
 * 判断字符串是否为 URL。
 * @param input - 输入字符串
 * @returns 是否为 URL
 */
function isUrl(input: string): boolean {
  return URL_PROTOCOL_RE.test(input);
}

/**
 * 根据输入字符串解析资源类型。
 * http/https → webview，mailto/ftp → external，其他 → file。
 * @param input - 输入字符串
 * @returns 资源类型
 */
function resolveResourceType(input: string): ResourceType {
  if (!isUrl(input)) {
    return 'file';
  }

  if (/^https?:\/\//i.test(input)) {
    return 'webview';
  }

  return 'external';
}

/**
 * 判断目标路径是否在工作区内。
 * 与 FileReadTool 保持一致的策略：
 * - 相对路径 → 视为工作区内
 * - 绝对路径 → 通过 isPathInsideWorkspace 判断
 * - 无工作区根目录 → 视为工作区外
 * @param filePath - 目标路径
 * @param workspaceRoot - 工作区根目录
 * @returns 是否在工作区内
 */
function isPathInside(filePath: string, workspaceRoot: string | null): boolean {
  if (!workspaceRoot) {
    return false;
  }

  if (!isAbsoluteFilePath(filePath)) {
    return true;
  }

  return isPathInsideWorkspace(filePath, workspaceRoot);
}

/**
 * 请求用户确认打开工作区外文件。
 * @param adapter - 确认适配器
 * @param filePath - 文件路径
 * @returns 是否已确认
 */
async function confirmOpenExternalFile(adapter: AIToolConfirmationAdapter, filePath: string): Promise<boolean> {
  const request: AIToolConfirmationRequest = {
    toolName: OPEN_RESOURCE_TOOL_NAME,
    title: 'AI 想要打开本地文件',
    description: `AI 请求打开本地文件：${filePath}`,
    riskLevel: 'read',
    beforeText: filePath
  };
  const decision = await adapter.confirm(request);

  if (typeof decision === 'boolean') {
    return decision;
  }

  return decision?.approved ?? false;
}

/**
 * 创建内置 open_resource 工具。
 *
 * 支持打开三种资源：
 * - 工作区内文件：静默直接打开
 * - 工作区外文件：请求用户确认后打开（最近文件跳过确认）
 * - http/https URL：在内置 webview 中打开
 * - mailto/ftp URL：通过系统默认程序打开
 *
 * @param options - 工具创建选项
 * @returns open_resource 工具执行器
 */
export function createOpenResourceTool(options: CreateOpenResourceToolOptions = {}): AIToolExecutor<OpenResourceInput, OpenResourceResult> {
  /** 当前会话中已确认过的绝对路径，同一路径仅需确认一次 */
  const sessionApprovedPaths = new Set<string>();

  return {
    definition: {
      name: OPEN_RESOURCE_TOOL_NAME,
      description:
        '根据用户指令打开文件或网址。文件路径支持相对工作区路径或绝对路径（外部路径需用户确认），http/https 网址在内置浏览器中打开，mailto/ftp 链接使用系统默认程序打开。',
      source: 'builtin',
      riskLevel: 'read',
      requiresActiveDocument: false,
      permissionCategory: 'system',
      safeAutoApprove: true,
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径（支持相对工作区路径或绝对路径）或网址（http/https/mailto/ftp）。' }
        },
        required: ['path'],
        additionalProperties: false
      }
    },
    async execute(input: OpenResourceInput) {
      // 提取并校验输入路径
      let path = '';
      if (typeof input.path === 'string') {
        path = input.path.trim();
      }

      if (!path) {
        return createToolFailureResult(OPEN_RESOURCE_TOOL_NAME, 'INVALID_INPUT', '路径或 URL 不能为空');
      }

      const resourceType = resolveResourceType(path);

      // ── URL 处理：在内置 webview 中打开 ──
      if (resourceType === 'webview') {
        if (!options.openInWebview) {
          return createToolFailureResult(OPEN_RESOURCE_TOOL_NAME, 'EXECUTION_FAILED', '当前环境不支持打开网页');
        }

        options.openInWebview(path);

        return createToolSuccessResult<OpenResourceResult>(OPEN_RESOURCE_TOOL_NAME, {
          path,
          resourceType: 'webview',
          opened: true
        });
      }

      // ── 外部协议链接处理：通过系统默认程序打开 ──
      if (resourceType === 'external') {
        if (!options.openExternal) {
          return createToolFailureResult(OPEN_RESOURCE_TOOL_NAME, 'EXECUTION_FAILED', '当前环境不支持打开外部链接');
        }

        options.openExternal(path);

        return createToolSuccessResult<OpenResourceResult>(OPEN_RESOURCE_TOOL_NAME, {
          path,
          resourceType: 'external',
          opened: true
        });
      }

      // ── 文件路径处理 ──
      const workspaceRoot = options.getWorkspaceRoot?.() ?? null;
      const isInsideWorkspace = isPathInside(path, workspaceRoot);

      // 工作区外文件需用户确认
      if (!isInsideWorkspace) {
        if (!options.confirm) {
          return createToolFailureResult(OPEN_RESOURCE_TOOL_NAME, 'PERMISSION_DENIED', '打开工作区外的文件需要用户确认');
        }

        const isRecentFile = options.isFileInRecent?.(path) === true;
        const hasApproved = sessionApprovedPaths.has(path);

        if (!isRecentFile && !hasApproved) {
          const confirmed = await confirmOpenExternalFile(options.confirm, path);

          if (!confirmed) {
            return createToolCancelledResult(OPEN_RESOURCE_TOOL_NAME);
          }

          sessionApprovedPaths.add(path);
        }
      }

      // 打开文件
      if (!options.openFileByPath) {
        return createToolFailureResult(OPEN_RESOURCE_TOOL_NAME, 'EXECUTION_FAILED', '当前环境不支持打开文件');
      }

      try {
        const file = await options.openFileByPath(path);

        if (!file) {
          return createToolFailureResult(OPEN_RESOURCE_TOOL_NAME, 'EXECUTION_FAILED', `未找到文件：${path}`);
        }

        return createToolSuccessResult<OpenResourceResult>(OPEN_RESOURCE_TOOL_NAME, {
          path,
          resourceType: 'file',
          opened: true,
          fileId: file.id
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : '打开文件失败';

        return createToolFailureResult(OPEN_RESOURCE_TOOL_NAME, 'EXECUTION_FAILED', message);
      }
    }
  };
}
