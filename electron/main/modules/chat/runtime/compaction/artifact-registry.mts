/**
 * @file artifact-registry.mts
 * @description 从 checkpoint 与文件工具结果重建 artifact 稳定身份映射。
 */
import * as path from 'node:path';
import type { ArtifactState, ChatMessageRecord } from 'types/chat';
import { nanoid } from 'nanoid';

/** artifact 观察操作。 */
export type ArtifactOperation = 'read' | 'created' | 'modified' | 'deleted' | 'moved';

/**
 * artifact 路径观察。
 */
export interface ArtifactObservation {
  /** 上游已经提供的稳定文档或 artifact ID。 */
  artifactId?: string;
  /** 当前路径。 */
  path: string;
  /** 移动前路径。 */
  previousPath?: string;
  /** 观察到的操作。 */
  operation: ArtifactOperation;
}

/**
 * artifact 移动输入。
 */
export interface ArtifactMoveInput {
  /** 上游已经提供的稳定文档或 artifact ID。 */
  artifactId?: string;
  /** 移动前路径。 */
  previousPath: string;
  /** 移动后路径。 */
  path: string;
}

/**
 * artifact registry 创建参数。
 */
export interface ArtifactRegistryOptions {
  /** 自定义 ID 工厂。 */
  createId?: () => string;
  /** 最新成功 checkpoint 中的 artifact 状态。 */
  checkpointArtifacts?: ArtifactState[];
  /** checkpoint boundary 后的原始消息。 */
  messages?: ChatMessageRecord[];
}

/**
 * Runtime 内存 artifact registry。
 */
export interface ArtifactRegistry {
  /**
   * 记录一次文件观察。
   * @param input - 文件路径与操作
   * @returns 稳定 artifact ID
   */
  observe(input: ArtifactObservation): string;
  /**
   * 记录一次有显式证据的路径移动。
   * @param input - 新旧路径
   * @returns 稳定 artifact ID
   */
  move(input: ArtifactMoveInput): string;
  /**
   * 解析路径当前对应的 artifact ID。
   * @param filePath - 文件路径
   * @returns artifact ID
   */
  resolve(filePath: string): string | undefined;
}

/**
 * 内部 artifact 记录。
 */
interface ArtifactRecord {
  /** artifact ID。 */
  id: string;
  /** 最近一次已知路径。 */
  path?: string;
  /** 最近一次操作。 */
  operation: ArtifactOperation;
}

/**
 * 判断值是否为记录对象。
 * @param value - 待判断值
 * @returns 是否为记录对象
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 规范化 artifact 路径但保留虚拟 URL scheme。
 * @param filePath - 原始路径
 * @returns 映射键
 */
function normalizeArtifactPath(filePath: string): string {
  const trimmedPath = filePath.trim();
  if (trimmedPath.includes('://')) return trimmedPath;

  return path.posix.normalize(trimmedPath.replace(/\\/gu, '/'));
}

/**
 * 从成功工具结果读取 artifact 观察。
 * @param message - 历史聊天消息
 * @returns 文件工具观察列表
 */
function readToolObservations(message: ChatMessageRecord): ArtifactObservation[] {
  return message.parts.flatMap((part): ArtifactObservation[] => {
    if (part.type !== 'tool' || part.status !== 'done' || part.result?.status !== 'success' || !isRecord(part.result.data)) return [];

    const { data } = part.result;
    const filePath = typeof data.path === 'string' ? data.path : '';
    if (!filePath) return [];

    const artifactId = typeof data.artifactId === 'string' ? data.artifactId : undefined;
    const previousPath = typeof data.previousPath === 'string' ? data.previousPath : undefined;
    if (previousPath) return [{ artifactId, path: filePath, previousPath, operation: 'moved' }];
    if (data.deleted === true || part.toolName === 'delete_file') return [{ artifactId, path: filePath, operation: 'deleted' }];
    if (part.toolName === 'create_document' || (part.toolName === 'write_file' && data.created === true)) {
      return [{ artifactId, path: filePath, operation: 'created' }];
    }
    if (part.toolName === 'write_file' || part.toolName === 'edit_file') return [{ artifactId, path: filePath, operation: 'modified' }];
    if (part.toolName === 'read_file') return [{ artifactId, path: filePath, operation: 'read' }];

    return [];
  });
}

/**
 * 创建并从历史证据恢复 artifact registry。
 * @param options - ID 工厂、checkpoint 和 tail 消息
 * @returns Runtime artifact registry
 */
export function createArtifactRegistry(options: ArtifactRegistryOptions = {}): ArtifactRegistry {
  const createId = options.createId ?? nanoid;
  const pathToId = new Map<string, string>();
  const records = new Map<string, ArtifactRecord>();

  /**
   * 更新 artifact 当前路径和状态。
   * @param artifactId - 稳定 artifact ID
   * @param filePath - 当前路径
   * @param operation - 当前操作
   */
  function setArtifactPath(artifactId: string, filePath: string, operation: ArtifactOperation): void {
    const normalizedPath = normalizeArtifactPath(filePath);
    const previousRecord = records.get(artifactId);
    if (previousRecord?.path && previousRecord.path !== normalizedPath && pathToId.get(previousRecord.path) === artifactId) {
      pathToId.delete(previousRecord.path);
    }

    records.set(artifactId, { id: artifactId, path: normalizedPath, operation });
    if (operation === 'deleted') {
      if (pathToId.get(normalizedPath) === artifactId) pathToId.delete(normalizedPath);
      return;
    }
    pathToId.set(normalizedPath, artifactId);
  }

  /**
   * 记录显式移动证据。
   * @param input - 新旧路径与可选稳定 ID
   * @returns 稳定 artifact ID
   */
  function move(input: ArtifactMoveInput): string {
    const previousPath = normalizeArtifactPath(input.previousPath);
    const nextPath = normalizeArtifactPath(input.path);
    const artifactId = input.artifactId ?? pathToId.get(previousPath) ?? createId();
    if (pathToId.get(previousPath) === artifactId) pathToId.delete(previousPath);
    setArtifactPath(artifactId, nextPath, 'moved');
    return artifactId;
  }

  /**
   * 记录普通文件观察。
   * @param input - 路径、操作与可选稳定 ID
   * @returns 稳定 artifact ID
   */
  function observe(input: ArtifactObservation): string {
    if (input.operation === 'moved' && input.previousPath) {
      return move({ artifactId: input.artifactId, previousPath: input.previousPath, path: input.path });
    }

    const normalizedPath = normalizeArtifactPath(input.path);
    const artifactId = input.artifactId ?? (input.operation === 'created' ? undefined : pathToId.get(normalizedPath)) ?? createId();
    setArtifactPath(artifactId, normalizedPath, input.operation);
    return artifactId;
  }

  /**
   * 解析当前路径映射。
   * @param filePath - 文件路径
   * @returns artifact ID
   */
  function resolve(filePath: string): string | undefined {
    return pathToId.get(normalizeArtifactPath(filePath));
  }

  for (const artifact of options.checkpointArtifacts ?? []) {
    if (!artifact.path) continue;
    observe({ artifactId: artifact.id, path: artifact.path, operation: artifact.status });
  }
  for (const message of options.messages ?? []) {
    for (const observation of readToolObservations(message)) observe(observation);
  }

  return { move, observe, resolve };
}
