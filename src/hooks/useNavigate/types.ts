/**
 * @file types.ts
 * @description 定义统一导航 hook 的公开能力与内部模块协作类型。
 */
import type { OpenDraftInput, OpenDraftResult } from '@/ai/tools/shared/types';
import type { StoredDocumentRecord } from '@/shared/storage';

/**
 * 文件选区范围。
 */
export interface FileSelectionRange {
  /** 起始行号（1-based），0 表示无行号 */
  startLine: number;
  /** 结束行号（1-based），0 表示无行号 */
  endLine: number;
}

/**
 * 打开引用文件参数。
 */
export interface OpenFileOptions {
  /** 文件绝对路径；已保存文件优先使用。 */
  filePath?: string | null;
  /** 文件 ID；未保存草稿或已知文件记录时使用。 */
  fileId?: string | null;
  /** 展示用文件名。 */
  fileName?: string;
  /** 打开后可选定位到的源码行范围。 */
  range?: FileSelectionRange;
}

/**
 * 文件打开目标路由。
 */
export interface FileRouteLocation {
  /** 目标路由名称。 */
  name: string;
  /** 路由参数。 */
  params: {
    /** 文件 ID。 */
    id: string;
  };
}

/**
 * 最近文档记录打开、新建与路径恢复能力。
 */
export interface DocumentNavigationActions {
  /** 打开最近文档记录。 */
  openDocument: (file: StoredDocumentRecord) => Promise<StoredDocumentRecord | null>;
  /** 通过文件 ID 打开最近文档。 */
  openFileById: (id: string) => Promise<StoredDocumentRecord | null>;
  /** 通过磁盘路径打开文档。 */
  openFileByPath: (path: string) => Promise<StoredDocumentRecord | null>;
  /** 通过原生文件选择器打开文档。 */
  openNativeFile: () => Promise<StoredDocumentRecord | null>;
  /** 创建新的 Markdown 文档。 */
  createNewFile: () => Promise<StoredDocumentRecord>;
  /** 打开已安装的 Widget 文档会话。 */
  openWidgetFile: (widgetId: string) => Promise<void>;
}

/**
 * 引用文件打开与选区定位能力。
 */
export interface FileReferenceNavigationActions {
  /** 根据路径或文件 ID 打开引用文件，并在需要时设置选区意图。 */
  openFile: (options: OpenFileOptions) => Promise<void>;
}

/**
 * 草稿创建与打开能力。
 */
export interface DraftNavigationActions {
  /** 创建并打开未保存草稿。 */
  openDraft: (input: OpenDraftInput) => Promise<OpenDraftResult>;
}

/**
 * 链接导航能力。
 */
export interface LinkNavigationActions {
  /** 统一处理 Markdown/富文本链接点击事件。 */
  onLink: (event: MouseEvent) => void;
  /** 使用应用内 WebView 打开 URL。 */
  openWebview: (url: URL) => void;
  /** 使用系统默认程序打开 URL。 */
  openExternal: (url: URL) => void;
}

/**
 * Skill 页面导航能力。
 */
export interface SkillNavigationActions {
  /** 打开指定 Skill 的独立详情页。 */
  openSkill: (skillName: string) => void;
}

/**
 * 统一导航 hook 对外能力。
 */
export type NavigateActions = LinkNavigationActions &
  DocumentNavigationActions &
  FileReferenceNavigationActions &
  DraftNavigationActions &
  SkillNavigationActions;
