/**
 * @file types.ts
 * @description 小组件文件发现与管理类型定义。
 */
import type { WidgetData } from '@/components/BWidget/types';

/**
 * 小组件文件定义。
 */
export interface WidgetDefinition {
  /** 小组件稳定标识，来自小组件目录名 */
  id: string;
  /** 小组件展示名称 */
  name: string;
  /** 小组件能力说明 */
  description: string;
  /** 小组件完整数据 */
  data: WidgetData;
  /** 完整 widget.json 源文本的稳定内容版本 */
  contentHash?: string;
  /** 小组件 JSON 文件绝对路径 */
  filePath: string;
  /** 小组件目录绝对路径 */
  dirPath: string;
  /** 解析时间戳 */
  parsedAt: number;
  /** 解析失败时的错误信息 */
  parseError?: string;
}

/**
 * 小组件目录索引。
 */
export interface WidgetIndex {
  /** 小组件目录稳定 ID。 */
  id: string;
  /** 小组件目录绝对路径。 */
  dirPath: string;
  /** widget.json 文件绝对路径。 */
  filePath: string;
}

/**
 * 小组件目录索引与懒加载内容缓存。
 */
export interface WidgetEntry extends WidgetIndex {
  /** 是否启用。 */
  enabled: boolean;
  /** 防止迟到请求覆盖新状态的修订序号。 */
  revision: number;
  /** 完整 widget.json 原文，undefined 表示尚未成功加载。 */
  sourceContent?: string;
  /** widget.json 解析结果。 */
  definition?: WidgetDefinition;
  /** 最近一次入口文件读取错误。 */
  loadError?: string;
}

/**
 * 小组件扫描配置。
 */
export interface WidgetScanConfig {
  /** 用户主目录路径 */
  homeDir: string;
}
