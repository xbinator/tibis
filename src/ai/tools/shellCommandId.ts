/**
 * @file shellCommandId.ts
 * @description 为跨 Runtime Shell 工具调用生成不会互相碰撞的内部命令 ID。
 */

/**
 * 将 Runtime ID 与 toolCallId 编码为稳定的内部 Shell commandId。
 * 长度前缀避免两个字段自身包含分隔符时产生碰撞。
 * @param runtimeId - ChatRuntime 唯一标识
 * @param toolCallId - Runtime 内工具调用标识
 * @returns 跨 Runtime 唯一的 Shell commandId
 */
export function createShellCommandId(runtimeId: string, toolCallId: string): string {
  return `${runtimeId.length}:${runtimeId}:${toolCallId}`;
}
