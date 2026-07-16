/**
 * @file factory.mts
 * @description ChatRuntime 活跃 runtime 状态创建工厂。
 */
import type { ActiveChatRuntime } from '../types.mjs';
import type { ChatRuntimeContinueInput, ChatRuntimeSendInput, ChatRuntimeSubmitUserChoiceInput } from 'types/chat-runtime';

/**
 * 创建普通发送 runtime 状态。
 * @param input - 发送输入
 * @param runtimeId - runtime id
 * @param sessionId - 会话 ID
 * @returns runtime 状态
 */
export function createSendRuntime(input: ChatRuntimeSendInput, runtimeId: string, sessionId: string): ActiveChatRuntime {
  return {
    runtimeId,
    sessionId,
    clientId: input.clientId,
    agentId: input.agentId,
    parentRuntimeId: input.parentRuntimeId,
    capabilities: input.capabilities,
    contextWindow: input.contextWindow,
    system: input.system,
    workspaceRoot: input.workspaceRoot,
    tools: input.tools,
    skillContentHashes: input.skillContentHashes,
    tavily: input.tavily,
    mcp: input.mcp,
    status: 'running',
    phase: 'streaming',
    abortController: new AbortController(),
    createdAt: Date.now()
  };
}

/**
 * 创建续轮 runtime 状态。
 * @param input - 续轮输入
 * @param runtimeId - runtime id
 * @returns runtime 状态
 */
export function createContinuationRuntime(input: ChatRuntimeContinueInput, runtimeId: string): ActiveChatRuntime {
  return {
    runtimeId,
    sessionId: input.sessionId,
    clientId: input.clientId,
    agentId: input.agentId,
    parentRuntimeId: input.parentRuntimeId,
    capabilities: input.capabilities,
    contextWindow: input.contextWindow,
    system: input.system,
    workspaceRoot: input.workspaceRoot,
    tools: input.tools,
    skillContentHashes: input.skillContentHashes,
    tavily: input.tavily,
    mcp: input.mcp,
    status: 'running',
    phase: 'streaming',
    abortController: new AbortController(),
    createdAt: Date.now()
  };
}

/**
 * 根据用户选择输入创建续轮 runtime 状态。
 * @param input - 用户选择提交输入
 * @param runtimeId - runtime id
 * @returns runtime 状态
 */
export function createUserChoiceRuntime(input: ChatRuntimeSubmitUserChoiceInput, runtimeId: string): ActiveChatRuntime {
  return {
    runtimeId,
    sessionId: input.sessionId,
    clientId: input.clientId,
    agentId: input.agentId,
    parentRuntimeId: input.parentRuntimeId,
    capabilities: input.capabilities,
    contextWindow: input.contextWindow,
    system: input.system,
    workspaceRoot: input.workspaceRoot,
    tools: input.tools,
    skillContentHashes: input.skillContentHashes,
    tavily: input.tavily,
    mcp: input.mcp,
    status: 'running',
    phase: 'streaming',
    abortController: new AbortController(),
    createdAt: Date.now()
  };
}
