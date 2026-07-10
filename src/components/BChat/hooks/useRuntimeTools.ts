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
  OPEN_WIDGET_TOOL_NAME,
  OPERATE_WEBPAGE_TOOL_NAME,
  OPEN_RESOURCE_TOOL_NAME,
  READ_CURRENT_WEBPAGE_TOOL_NAME,
  READ_DIRECTORY_TOOL_NAME,
  SKILL_TOOL_NAME,
  WIDGET_TOOL_NAME
} from '@/ai/tools/builtin';
import { createSkillTool } from '@/ai/tools/builtin/SkillTool';
import { createEditWidgetTool, createGetWidgetTool, createOpenWidgetTool, createWidgetTool } from '@/ai/tools/builtin/WidgetTool';
import type { AIToolConfirmationAdapter } from '@/ai/tools/confirmation';
import { editorToolContextRegistry } from '@/ai/tools/context/editor';
import { webviewToolContextRegistry } from '@/ai/tools/context/webview';
import { widgetToolContextRegistry } from '@/ai/tools/context/widget';
import { createWidgetHttpClient, executeWidgetRuntime, type WidgetConsoleLevel, type WidgetLogLevel } from '@/components/BWidget/utils/widgetRuntime';
import { formatWidgetLogArgs } from '@/components/BWidget/utils/widgetRuntime/logger';
import { useOpenDraft } from '@/hooks/useOpenDraft';
import { useOpenFile } from '@/hooks/useOpenFile';
import { useWorkspaceRoot } from '@/hooks/useWorkspaceRoot';
import { logger } from '@/shared/logger';
import { native } from '@/shared/platform';
import { useSkillStore } from '@/stores/ai/skill';
import { useToolSettingsStore } from '@/stores/ai/toolSettings';
import { useWidgetStore } from '@/stores/ai/widget';
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
  const widgetStore = useWidgetStore();
  const toolSettingsStore = useToolSettingsStore();
  const filesStore = useFilesStore();
  const { openDraft } = useOpenDraft();
  const { openFileByPath } = useOpenFile();
  const { workspaceRoot, getWorkspaceRoot } = useWorkspaceRoot();
  /** open_widget 前置执行阶段复用的托管 HTTP 客户端。 */
  const widgetHttpClient = createWidgetHttpClient();
  /**
   * 把 open_widget 预执行阶段的小组件日志写入应用日志。
   * @param level - 日志级别
   * @param args - 原始日志参数
   */
  async function handleWidgetLogger(level: WidgetLogLevel, args: unknown[]): Promise<void> {
    await logger[level](`[widget] ${formatWidgetLogArgs(args)}`);
  }

  /**
   * 把 open_widget 预执行阶段的小组件 console 转发到 DevTools。
   * @param level - console 级别
   * @param args - 原始 console 参数
   */
  function handleWidgetConsole(level: WidgetConsoleLevel, args: unknown[]): void {
    console[level](...args);
  }

  /** open_widget 前置执行阶段复用的运行态宿主能力。 */
  const openWidgetRuntimeHost = {
    http: widgetHttpClient,
    onLogger: handleWidgetLogger,
    onConsole: handleWidgetConsole
  };

  const allBuiltinTools = createBuiltinTools({
    confirm: options.confirm,
    skillStore,
    widgetStore,
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
   * 每次调用时根据运行时状态（编辑器、MCP、Skill、Widget）过滤条件工具。
   * @returns 当前可用工具列表
   */
  function getActiveTools(): AIToolExecutor[] {
    const hasActiveEditor = Boolean(editorToolContextRegistry.getCurrentContext());
    const hasActiveWebview = Boolean(webviewToolContextRegistry.getCurrentContext());
    const hasActiveWidget = widgetToolContextRegistry.getCurrentContext();
    const hasWorkspace = Boolean(workspaceRoot.value);
    const enabledWidgets = widgetStore.initialized ? widgetStore.getEnabledWidgets() : [];
    const hasEnabledWidgets = widgetStore.initialized && enabledWidgets.length > 0;
    const baseBuiltinTools = hasEnabledWidgets
      ? allBuiltinTools.filter((tool: AIToolExecutor): boolean => tool.definition.name !== OPEN_WIDGET_TOOL_NAME)
      : allBuiltinTools;

    // skillStore 在 onMounted 中异步初始化，allBuiltinTools 创建时 skillStore.initialized 为 false，
    // 因此需要在每次获取工具时动态判断是否需要追加 Skill 工具。
    const dynamicTools: AIToolExecutor[] = [];
    if (skillStore.initialized && skillStore.getEnabledSkills().length > 0) {
      const hasSkillTool = allBuiltinTools.some((tool) => tool.definition.name === SKILL_TOOL_NAME);
      if (!hasSkillTool) {
        dynamicTools.push(createSkillTool(skillStore));
      }
    }
    if (hasEnabledWidgets) {
      const hasWidgetTool = baseBuiltinTools.some((tool) => tool.definition.name === WIDGET_TOOL_NAME);
      if (!hasWidgetTool) {
        dynamicTools.push(createWidgetTool(widgetStore));
      }
      dynamicTools.push(
        createOpenWidgetTool(widgetStore, {
          executeWidget: ({ state }) => executeWidgetRuntime(state, openWidgetRuntimeHost)
        })
      );
    }
    if (hasActiveWidget) {
      dynamicTools.push(
        createGetWidgetTool(hasActiveWidget, {
          isCurrent: (): boolean => widgetToolContextRegistry.getCurrentContext() === hasActiveWidget
        }),
        createEditWidgetTool(hasActiveWidget, {
          confirm: options.confirm,
          isCurrent: (): boolean => widgetToolContextRegistry.getCurrentContext() === hasActiveWidget
        })
      );
    }

    return [...baseBuiltinTools, ...dynamicTools].filter((tool) => {
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
