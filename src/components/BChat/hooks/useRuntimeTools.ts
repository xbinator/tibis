/**
 * @file useRuntimeTools.ts
 * @description ChatRuntime 内置工具创建和动态过滤 hook。
 */
import type { Message } from '../utils/types';
import type { AIToolExecutor } from 'types/ai';
import type { Ref } from 'vue';
import {
  createBuiltinTools,
  isBuiltinToolName,
  OPERATE_WEBPAGE_TOOL_NAME,
  OPEN_RESOURCE_TOOL_NAME,
  READ_CURRENT_WEBPAGE_TOOL_NAME,
  READ_DIRECTORY_TOOL_NAME,
  SKILL_TOOL_NAME
} from '@/ai/tools/builtin';
import { createSkillTool } from '@/ai/tools/builtin/SkillTool';
import type { AIToolConfirmationAdapter } from '@/ai/tools/confirmation';
import { editorToolContextRegistry } from '@/ai/tools/context/editor';
import { webviewToolContextRegistry } from '@/ai/tools/context/webview';
import { useOpenDraft } from '@/hooks/useOpenDraft';
import { useOpenFile } from '@/hooks/useOpenFile';
import { useWorkspaceRoot } from '@/hooks/useWorkspaceRoot';
import { native } from '@/shared/platform';
import { useSkillStore } from '@/stores/ai/skill';
import { useToolSettingsStore } from '@/stores/ai/toolSettings';
import { useFilesStore } from '@/stores/workspace/files';
import { userChoice } from '../utils/messageHelper';

/**
 * Runtime 工具 hook 配置。
 */
interface UseRuntimeToolsOptions {
  /** 当前消息列表。 */
  messages: Ref<Message[]>;
  /** 工具确认适配器。 */
  confirm: AIToolConfirmationAdapter;
  /** 获取当前活跃会话 ID。 */
  getSessionId: () => string | undefined;
  /** 在内置 WebView 中打开 URL。 */
  openWebview: (url: URL) => void;
}

/**
 * Runtime 工具 hook 返回值。
 */
interface UseRuntimeToolsReturn {
  /** 当前工作区根目录。 */
  workspaceRoot: ReturnType<typeof useWorkspaceRoot>['workspaceRoot'];
  /** 获取当前工作区根目录。 */
  getWorkspaceRoot: ReturnType<typeof useWorkspaceRoot>['getWorkspaceRoot'];
  /** 动态获取当前可用工具列表。 */
  getActiveTools: () => AIToolExecutor[];
  /** 创建并打开未保存草稿。 */
  openDraft: ReturnType<typeof useOpenDraft>['openDraft'];
  /** 通过文件路径打开文件标签页。 */
  openFileByPath: ReturnType<typeof useOpenFile>['openFileByPath'];
}

/**
 * 管理 ChatRuntime 内置工具创建和运行时可用性过滤。
 * @param options - Runtime 工具 hook 配置
 * @returns Runtime 工具能力
 */
export function useRuntimeTools(options: UseRuntimeToolsOptions): UseRuntimeToolsReturn {
  const skillStore = useSkillStore();
  const toolSettingsStore = useToolSettingsStore();
  const filesStore = useFilesStore();
  const { openDraft } = useOpenDraft();
  const { openFileByPath } = useOpenFile();
  const { workspaceRoot, getWorkspaceRoot } = useWorkspaceRoot();

  const allBuiltinTools = createBuiltinTools({
    confirm: options.confirm,
    skillStore,
    mcpStore: toolSettingsStore,
    getWorkspaceRoot,
    isFileInRecent: (filePath: string) => {
      return Boolean(filesStore.recentFiles?.some((file) => file.path === filePath));
    },
    /**
     * 通过文件绝对路径查找文件 ID。
     * 封装 filesStore.getFileByPath。
     */
    findFileByPath: async (filePath: string) => {
      const file = await filesStore.getFileByPath(filePath);
      return file ? { id: file.id } : null;
    },
    /**
     * 通过文件 ID 获取编辑器上下文。
     * 封装 editorToolContextRegistry.getContext。
     */
    getEditorContext: (documentId: string) => {
      return editorToolContextRegistry.getContext(documentId);
    },
    getWebviewContext: () => webviewToolContextRegistry.getCurrentContext(),
    openDraft,
    /**
     * 通过文件路径打开文件标签页。
     * 封装 useOpenFile().openFileByPath，返回 { id } 或 null。
     */
    openFileByPath,
    /**
     * 在内置 webview 中打开 URL。
     * 通过 Vue Router 导航到 webview-web 页面。
     */
    openInWebview: (url: string) => {
      options.openWebview(new URL(url));
    },
    /**
     * 在系统浏览器中打开 URL。
     * 通过 Electron shell.openExternal 实现。
     */
    openExternal: (url: string) => {
      native.openExternal(url);
    },
    getPendingQuestion: () => {
      const pendingQuestion = userChoice.findPending(options.messages.value);
      if (!pendingQuestion) return null;

      return {
        questionId: pendingQuestion.questionId,
        toolCallId: pendingQuestion.toolCallId
      };
    },
    getSessionId: options.getSessionId
  });

  /**
   * 动态获取当前可用的工具列表。
   * 每次调用时根据运行时状态（编辑器、MCP、Skill）过滤条件工具。
   * @returns 当前可用工具列表
   */
  function getActiveTools(): AIToolExecutor[] {
    const hasActiveEditor = Boolean(editorToolContextRegistry.getCurrentContext());
    const hasActiveWebview = Boolean(webviewToolContextRegistry.getCurrentContext());
    const hasWorkspace = Boolean(workspaceRoot.value);

    // skillStore 在 onMounted 中异步初始化，allBuiltinTools 创建时 skillStore.initialized 为 false，
    // 因此需要在每次获取工具时动态判断是否需要追加 Skill 工具。
    const dynamicTools: AIToolExecutor[] = [];
    if (skillStore.initialized && skillStore.getEnabledSkills().length > 0) {
      const hasSkillTool = allBuiltinTools.some((tool) => tool.definition.name === SKILL_TOOL_NAME);
      if (!hasSkillTool) {
        dynamicTools.push(createSkillTool(skillStore));
      }
    }

    return [...allBuiltinTools, ...dynamicTools].filter((tool) => {
      if (!isBuiltinToolName(tool.definition.name)) return false;
      if (tool.definition.name === 'read_current_document' && !hasActiveEditor) return false;
      if (tool.definition.name === READ_CURRENT_WEBPAGE_TOOL_NAME && !hasActiveWebview) return false;
      if (tool.definition.name === OPERATE_WEBPAGE_TOOL_NAME && !hasActiveWebview) return false;
      if (tool.definition.name === OPEN_RESOURCE_TOOL_NAME && hasActiveWebview) return false;
      if (tool.definition.name === READ_DIRECTORY_TOOL_NAME && !hasWorkspace) return false;
      return true;
    });
  }

  return {
    workspaceRoot,
    getWorkspaceRoot,
    getActiveTools,
    openDraft,
    openFileByPath
  };
}
