/**
 * @file types.ts
 * @description BSkill 组件类型定义
 */

/**
 * 虚拟文件描述
 *
 * 用于在不访问文件系统的情况下，直接以内存内容构造 BSkill 预览数据。
 * 与 `rootPath` 模式互斥。
 */
export interface VirtualFile {
  /** 文件相对路径，如 "SKILL.md"、"scripts/helper.js" */
  path: string;
  /** 文件文本内容 */
  content: string;
}

/**
 * BSkill 组件 Props
 */
export interface BSkillProps {
  /** 文件系统根目录路径，与 virtualFiles 互斥 */
  rootPath?: string;
  /** 虚拟文件列表（内存内容），与 rootPath 互斥 */
  virtualFiles?: VirtualFile[];
  /** 初始选中文件路径，树加载完成后自动选中 */
  initialFilePath?: string;
}

/**
 * BSkill 组件实例方法
 */
export interface BSkillInstance {
  /** 选中指定文件 */
  selectFile: (filePath: string) => Promise<void>;
  /** 复制当前选中文件内容 */
  copyContent: () => void;
}
