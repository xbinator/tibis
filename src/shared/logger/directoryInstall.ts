/**
 * @file directoryInstall.ts
 * @description Skill 与 Widget 共用的目录安装阶段日志适配器。
 */
import { formatDirectoryInstallError, type DirectoryInstallEvent, type DirectoryInstallRecoveryFailure } from '@/utils/file/directory';
import { logger } from './index';

/** 支持目录安装日志的资源类型。 */
export type DirectoryInstallResourceType = 'skill' | 'widget';

/** 目录安装日志控制器。 */
export interface DirectoryInstallLogger {
  /** 记录安装开始。 */
  start: () => Promise<void>;
  /** 接收通用安装器阶段事件。 */
  onEvent: (event: DirectoryInstallEvent) => Promise<void>;
  /** 记录安装成功。 */
  success: () => Promise<void>;
  /** 记录安装最终失败。 */
  failure: (error: unknown) => Promise<void>;
}

/**
 * 创建带资源类型、资源标识和当前阶段的安装日志控制器。
 * @param resourceType - Skill 或 Widget
 * @param resourceId - 资源标识
 * @returns 安装日志控制器
 */
export function createDirectoryInstallLogger(resourceType: DirectoryInstallResourceType, resourceId: string): DirectoryInstallLogger {
  const prefix = `[${resourceType}-install]`;
  let currentStage = 'prepare';

  /** 记录安装开始。 */
  async function start(): Promise<void> {
    await logger.info(`${prefix} start resource=${resourceId}`);
  }

  /**
   * 将通用目录安装事件映射为持久化日志。
   * @param event - 目录安装事件
   */
  async function onEvent(event: DirectoryInstallEvent): Promise<void> {
    if (event.type === 'stage') {
      currentStage = event.stage;
      await logger.info(`${prefix} stage resource=${resourceId} stage=${event.stage}`);
      return;
    }

    if (event.type === 'rename-retry') {
      await logger.warn(
        `${prefix} rename-retry resource=${resourceId} stage=${event.stage} attempt=${event.attempt} error=${formatDirectoryInstallError(event.error)}`
      );
      return;
    }

    if (event.type === 'cleanup-failed') {
      await logger.warn(`${prefix} cleanup-failed resource=${resourceId} target=${event.target} error=${formatDirectoryInstallError(event.error)}`);
      return;
    }

    if (event.type === 'rollback-failed') {
      await logger.error(`${prefix} rollback-failed resource=${resourceId} error=${formatDirectoryInstallError(event.error)}`);
      return;
    }

    await logger.warn(`${prefix} rollback-completed resource=${resourceId}`);
  }

  /** 记录安装成功。 */
  async function success(): Promise<void> {
    await logger.info(`${prefix} success resource=${resourceId}`);
  }

  /**
   * 记录安装最终失败。
   * @param error - 原始错误
   */
  async function failure(error: unknown): Promise<void> {
    await logger.error(`${prefix} failed resource=${resourceId} stage=${currentStage} error=${formatDirectoryInstallError(error)}`);
  }

  return { start, onEvent, success, failure };
}

/**
 * 记录目录安装事务恢复失败，不改变扫描流程结果。
 * @param resourceType - Skill 或 Widget
 * @param failure - 恢复失败信息
 * @returns 日志写入完成信号
 */
export async function logDirectoryInstallRecoveryFailure(resourceType: DirectoryInstallResourceType, failure: DirectoryInstallRecoveryFailure): Promise<void> {
  await logger.error(`[${resourceType}-install] recovery-failed transaction=${failure.transactionPath} error=${formatDirectoryInstallError(failure.error)}`);
}
