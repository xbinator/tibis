/**
 * @file editorFileWatch.ts
 * @description 管理编辑器全局文件监听路径映射和文件丢失事件分发。
 */

import { defineStore } from 'pinia';
import { native } from '@/shared/platform';
import type { FileChangeEvent } from '@/shared/platform/native/types';
import { storeEvents } from '@/stores/helpers/events';

/**
 * 编辑器全局文件监听状态。
 */
export interface EditorFileWatchState {
  /** 文件路径到引用该路径的编辑器文件 ID 集合 */
  pathToFileIds: Map<string, Set<string>>;
  /** 文件路径到控制器注册 ID 与业务文件 ID 的映射 */
  pathToRegistrations: Map<string, Map<string, string>>;
  /** 控制器注册 ID 到当前监听路径的映射 */
  registrationToPath: Map<string, string>;
  /** 控制器注册 ID 到业务文件 ID 的映射 */
  registrationToFileId: Map<string, string>;
  /** native 文件事件取消订阅函数 */
  unsubscribe: (() => void) | null;
}

/**
 * 全局文件监听 Store，负责把 native 文件事件路由到对应标签状态。
 */
export const useEditorFileWatchStore = defineStore('editorFileWatch', {
  state: (): EditorFileWatchState => ({
    pathToFileIds: new Map<string, Set<string>>(),
    pathToRegistrations: new Map<string, Map<string, string>>(),
    registrationToPath: new Map<string, string>(),
    registrationToFileId: new Map<string, string>(),
    unsubscribe: null
  }),

  actions: {
    /**
     * 确保 native 文件事件只订阅一次。
     */
    ensureSubscribed(): void {
      if (this.unsubscribe) return;

      this.unsubscribe = native.onFileChanged((event: FileChangeEvent) => {
        this.handleFileChanged(event);
      });
    },

    /**
     * 注册指定编辑器文件对应的磁盘路径。
     * @param fileId - 编辑器文件 ID
     * @param filePath - 需要监听的磁盘路径
     * @param registrationId - 控制器实例级注册 ID
     */
    async register(fileId: string, filePath: string, registrationId: string = fileId): Promise<void> {
      this.ensureSubscribed();

      const previousPath = this.registrationToPath.get(registrationId);
      if (previousPath && previousPath !== filePath) {
        await this.updatePath(fileId, filePath, registrationId);
        return;
      }

      let registrations = this.pathToRegistrations.get(filePath);
      if (!registrations) {
        await native.watchFile(filePath);
        registrations = new Map<string, string>();
        this.pathToRegistrations.set(filePath, registrations);
      }

      registrations.set(registrationId, fileId);
      const fileIds = this.pathToFileIds.get(filePath) ?? new Set<string>();
      fileIds.add(fileId);
      this.pathToFileIds.set(filePath, fileIds);
      this.registrationToPath.set(registrationId, filePath);
      this.registrationToFileId.set(registrationId, fileId);
    },

    /**
     * 取消指定编辑器文件的路径引用；仅最后一个引用离开时才停止 native watcher。
     * @param fileId - 编辑器文件 ID
     * @param registrationId - 控制器实例级注册 ID
     */
    async unregister(fileId: string, registrationId: string = fileId): Promise<void> {
      const previousPath = this.registrationToPath.get(registrationId);
      if (!previousPath) return;

      const registrations = this.pathToRegistrations.get(previousPath);
      registrations?.delete(registrationId);
      const fileIds = this.pathToFileIds.get(previousPath);
      const hasSameFile = registrations ? [...registrations.values()].some((registeredFileId: string): boolean => registeredFileId === fileId) : false;
      if (!hasSameFile) fileIds?.delete(fileId);
      this.registrationToPath.delete(registrationId);
      this.registrationToFileId.delete(registrationId);

      if (!registrations || registrations.size === 0) {
        this.pathToRegistrations.delete(previousPath);
        this.pathToFileIds.delete(previousPath);
        await native.unwatchFile(previousPath);
      }
    },

    /**
     * 更新编辑器文件监听路径，先确保新路径监听成功再释放旧路径。
     * @param fileId - 编辑器文件 ID
     * @param nextPath - 新的磁盘路径
     * @param registrationId - 控制器实例级注册 ID
     */
    async updatePath(fileId: string, nextPath: string, registrationId: string = fileId): Promise<void> {
      this.ensureSubscribed();

      const previousPath = this.registrationToPath.get(registrationId);
      if (previousPath === nextPath) return;

      let nextRegistrations = this.pathToRegistrations.get(nextPath);
      if (!nextRegistrations) {
        await native.watchFile(nextPath);
        nextRegistrations = new Map<string, string>();
        this.pathToRegistrations.set(nextPath, nextRegistrations);
      }

      if (previousPath) {
        const previousRegistrations = this.pathToRegistrations.get(previousPath);
        previousRegistrations?.delete(registrationId);
        const previousFileIds = this.pathToFileIds.get(previousPath);
        const hasSameFile = previousRegistrations
          ? [...previousRegistrations.values()].some((registeredFileId: string): boolean => registeredFileId === fileId)
          : false;
        if (!hasSameFile) previousFileIds?.delete(fileId);

        if (!previousRegistrations || previousRegistrations.size === 0) {
          this.pathToRegistrations.delete(previousPath);
          this.pathToFileIds.delete(previousPath);

          try {
            await native.unwatchFile(previousPath);
          } catch (error: unknown) {
            console.error('Failed to unwatch previous file path:', error);
          }
        }
      }

      nextRegistrations.set(registrationId, fileId);
      const nextFileIds = this.pathToFileIds.get(nextPath) ?? new Set<string>();
      nextFileIds.add(fileId);
      this.pathToFileIds.set(nextPath, nextFileIds);
      this.registrationToPath.set(registrationId, nextPath);
      this.registrationToFileId.set(registrationId, fileId);
    },

    /**
     * 处理 native 文件事件；change 与 add 由活动控制器协调，unlink 只负责标记丢失。
     * @param event - native 文件变化事件
     */
    handleFileChanged(event: FileChangeEvent): void {
      if (event.type === 'change') {
        return;
      }

      if (event.type === 'unlink') {
        this.markPathMissing(event.filePath);
      }

      // add 必须在控制器完成磁盘重新加载与冲突协调后才能清除 missing。
    },

    /**
     * 把同一路径下的所有标签标记为文件已丢失。
     * @param filePath - 已从原路径消失的文件路径
     */
    markPathMissing(filePath: string): void {
      const fileIds = this.pathToFileIds.get(filePath);
      if (!fileIds) return;

      fileIds.forEach((fileId: string) => {
        storeEvents.emitFileMissing(fileId);
      });
    },

    /**
     * 清除同一路径下所有标签的文件丢失标记（文件重新出现时调用）。
     * @param filePath - 重新出现的文件路径
     */
    clearPathMissing(filePath: string): void {
      const fileIds = this.pathToFileIds.get(filePath);
      if (!fileIds) return;

      fileIds.forEach((fileId: string) => {
        storeEvents.emitFileRecovered(fileId);
      });
    },

    /**
     * 释放全局 watcher 订阅和 native 监听资源。
     */
    async dispose(): Promise<void> {
      if (this.unsubscribe) {
        this.unsubscribe();
        this.unsubscribe = null;
      }

      this.pathToFileIds.clear();
      this.pathToRegistrations.clear();
      this.registrationToPath.clear();
      this.registrationToFileId.clear();
      await native.unwatchAll();
    }
  }
});
