/**
 * @file memory.ts
 * @description 记忆系统 Pinia Store，管理 MEMORY.md 的读写、缓存和 system prompt 注入
 */
import { defineStore } from 'pinia';
import { buildSystemPromptContext } from '@/ai/memory/injector';
import { parseMemoryDoc, serializeMemoryDoc, createEmptyMemoryDoc } from '@/ai/memory/parser';
import type { MemoryDoc } from '@/ai/memory/types';
import { MEMORY_FILE_NAME } from '@/ai/memory/types';
import { native } from '@/shared/platform';
import { getElectronAPI } from '@/shared/platform/electron-api';

/** 记忆文件目录 */
const MEMORY_DIR = '.tibis';

/** 记忆 Store 状态 */
interface MemoryState {
  /** 记忆文档 */
  doc: MemoryDoc;
  /** 记忆文件原始 Markdown 内容 */
  rawContent: string;
  /** 是否已加载 */
  loaded: boolean;
  /** 记忆功能是否启用 */
  enabled: boolean;
}

/**
 * 获取记忆文件的完整路径
 * @returns 记忆文件路径
 */
async function getMemoryFilePath(): Promise<string> {
  const homeDir = await native.getHomeDir();
  return `${homeDir}/${MEMORY_DIR}/${MEMORY_FILE_NAME}`;
}

/**
 * 获取记忆文件所在目录路径
 * @returns 目录路径
 */
async function getMemoryDirPath(): Promise<string> {
  const homeDir = await native.getHomeDir();
  return `${homeDir}/${MEMORY_DIR}`;
}

/**
 * 记忆系统 Store
 */
export const useMemoryStore = defineStore('memory', {
  state: (): MemoryState => ({
    doc: createEmptyMemoryDoc(),
    rawContent: '',
    loaded: false,
    enabled: localStorage.getItem('memory_enabled') !== 'false'
  }),

  getters: {
    /** 记忆是否为空 */
    isEmpty: (state): boolean => state.doc.sections.every((s) => s.items.length === 0),

    /** 非空分区列表 */
    nonEmptySections: (state) => state.doc.sections.filter((s) => s.items.length > 0),

    /** 所有记忆条目总数 */
    totalItemCount: (state): number => state.doc.sections.reduce((sum, s) => sum + s.items.length, 0)
  },

  actions: {
    /**
     * 从磁盘加载记忆文件
     * 文件不存在时创建空文档，不触发主进程 ENOENT 错误
     */
    async loadMemory(): Promise<void> {
      try {
        const filePath = await getMemoryFilePath();
        const status = await native.getPathStatus(filePath);
        if (!status.exists) {
          this.doc = createEmptyMemoryDoc();
          this.rawContent = '';
          this.loaded = true;
          return;
        }
        const result = await native.readFile(filePath);
        this.rawContent = result.content;
        this.doc = parseMemoryDoc(result.content);
        this.loaded = true;
      } catch {
        this.doc = createEmptyMemoryDoc();
        this.rawContent = '';
        this.loaded = true;
      }
    },

    /**
     * 将记忆文档持久化到磁盘
     */
    async saveMemory(): Promise<void> {
      try {
        const dirPath = await getMemoryDirPath();
        await getElectronAPI().ensureDir(dirPath);
        const filePath = await getMemoryFilePath();
        const content = serializeMemoryDoc(this.doc);
        this.rawContent = content;
        await native.writeFile(filePath, content);
      } catch (error) {
        console.error('[memory] Failed to save memory file:', error);
      }
    },

    /**
     * 构建要注入到 System Prompt 的记忆上下文
     * @returns 注入字符串，无记忆或未启用时返回空字符串
     */
    buildSystemPromptContext(): string {
      if (!this.enabled) return '';
      return buildSystemPromptContext(this.doc);
    },

    /**
     * 更新指定分区的指定条目内容
     * @param category - 分区名称
     * @param index - 条目索引
     * @param content - 新内容
     */
    async updateItem(category: string, index: number, content: string): Promise<void> {
      const section = this.doc.sections.find((s) => s.category === category);
      if (!section || index < 0 || index >= section.items.length) return;

      section.items[index] = { content };
      await this.saveMemory();
    },

    /**
     * 删除指定分区的指定条目
     * @param category - 分区名称
     * @param index - 条目索引
     */
    async deleteItem(category: string, index: number): Promise<void> {
      const section = this.doc.sections.find((s) => s.category === category);
      if (!section || index < 0 || index >= section.items.length) return;

      section.items.splice(index, 1);
      await this.saveMemory();
    },

    /**
     * 清空所有记忆
     */
    async clearAll(): Promise<void> {
      this.doc = createEmptyMemoryDoc();
      this.rawContent = '';
      await this.saveMemory();
    },

    /**
     * 设置记忆功能启用状态
     * @param enabled - 是否启用
     */
    setEnabled(enabled: boolean): void {
      this.enabled = enabled;
      localStorage.setItem('memory_enabled', String(enabled));
    }
  }
});
