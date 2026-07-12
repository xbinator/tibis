/**
 * @file install-lock.mts
 * @description Electron 主进程中的跨窗口目录安装互斥锁。
 */
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';

/** 等待获取目录安装锁的渲染进程请求。 */
interface DirectoryInstallLockWaiter {
  /** 渲染进程 WebContents 标识。 */
  ownerId: number;
  /** 授予锁。 */
  resolve: (token: string) => void;
  /** 取消等待。 */
  reject: (error: Error) => void;
}

/** 单个目标路径的锁状态。 */
interface DirectoryInstallLockState {
  /** 当前持有者。 */
  active: { ownerId: number; token: string };
  /** 等待队列。 */
  queue: DirectoryInstallLockWaiter[];
}

/**
 * 规范化目录安装锁键，Windows 路径忽略分隔符与大小写差异。
 * @param targetPath - 安装目标路径
 * @param platform - 运行平台
 * @returns 可用于互斥的稳定路径键
 */
export function normalizeDirectoryInstallLockKey(targetPath: string, platform: NodeJS.Platform = process.platform): string {
  if (platform === 'win32') {
    return path.win32.resolve(targetPath.replace(/\//gu, '\\')).toLocaleLowerCase('en-US');
  }

  return path.resolve(targetPath);
}

/** Electron 主进程共享的目录安装锁管理器。 */
export class DirectoryInstallLockManager {
  /** 路径规范化所用平台。 */
  private readonly platform: NodeJS.Platform;

  /**
   * 创建目录安装锁管理器。
   * @param platform - 路径规范化所用平台，默认当前运行平台
   */
  constructor(platform: NodeJS.Platform = process.platform) {
    this.platform = platform;
  }

  /** 按规范化目标路径保存的锁状态。 */
  private readonly locks = new Map<string, DirectoryInstallLockState>();

  /** 按令牌反查目标锁键。 */
  private readonly lockKeyByToken = new Map<string, string>();

  /**
   * 获取目标目录安装锁；已有持有者时按请求顺序等待。
   * @param targetPath - 安装目标路径
   * @param ownerId - 渲染进程 WebContents 标识
   * @returns 锁令牌
   */
  async acquire(targetPath: string, ownerId: number): Promise<string> {
    const lockKey = normalizeDirectoryInstallLockKey(targetPath, this.platform);
    const existing = this.locks.get(lockKey);

    if (!existing) {
      return this.grant(lockKey, ownerId, []);
    }

    return new Promise<string>((resolve: (token: string) => void, reject: (error: Error) => void): void => {
      existing.queue.push({ ownerId, resolve, reject });
    });
  }

  /**
   * 释放锁并授予队列中的下一位等待者。
   * @param token - 获取锁时返回的令牌
   * @param ownerId - 释放锁的渲染进程标识
   */
  release(token: string, ownerId: number): void {
    const lockKey = this.lockKeyByToken.get(token);
    const state = lockKey ? this.locks.get(lockKey) : undefined;

    if (!lockKey || !state || state.active.token !== token || state.active.ownerId !== ownerId) {
      throw new Error('目录安装锁令牌无效');
    }

    this.lockKeyByToken.delete(token);
    const next = state.queue.shift();
    if (!next) {
      this.locks.delete(lockKey);
      return;
    }

    const nextToken = randomUUID();
    state.active = { ownerId: next.ownerId, token: nextToken };
    this.lockKeyByToken.set(nextToken, lockKey);
    next.resolve(nextToken);
  }

  /**
   * 渲染进程销毁时取消其等待请求并释放其持有的全部锁。
   * @param ownerId - 已销毁的 WebContents 标识
   */
  releaseOwner(ownerId: number): void {
    for (const state of this.locks.values()) {
      const retainedWaiters = state.queue.filter((waiter: DirectoryInstallLockWaiter): boolean => {
        if (waiter.ownerId !== ownerId) {
          return true;
        }

        waiter.reject(new Error('渲染进程已销毁，目录安装锁请求已取消'));
        return false;
      });
      state.queue.splice(0, state.queue.length, ...retainedWaiters);
    }

    const ownedTokens = Array.from(this.lockKeyByToken.entries())
      .filter(([, lockKey]: [string, string]): boolean => this.locks.get(lockKey)?.active.ownerId === ownerId)
      .map(([token]: [string, string]): string => token);

    for (const token of ownedTokens) {
      this.release(token, ownerId);
    }
  }

  /**
   * 创建并登记一个立即生效的锁令牌。
   * @param lockKey - 规范化目标路径
   * @param ownerId - 渲染进程标识
   * @param queue - 初始等待队列
   * @returns 新锁令牌
   */
  private grant(lockKey: string, ownerId: number, queue: DirectoryInstallLockWaiter[]): string {
    const token = randomUUID();
    this.locks.set(lockKey, { active: { ownerId, token }, queue });
    this.lockKeyByToken.set(token, lockKey);
    return token;
  }
}
