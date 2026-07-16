/**
 * @file long-context-compaction.ts
 * @description 可重复的长会话压缩质量回归夹具，覆盖目标漂移、owner、artifact 生命周期、滚动 checkpoint、长工具输出和模型切换。
 */
import type {
  ChatMessageCompactionPart,
  ChatMessagePart,
  ChatMessageRecord,
  ChatMessageToolPart,
  CompactionBudgetSnapshot,
  CompactionModelSnapshot,
  StructuredContextSummary
} from 'types/chat';

/** 日志与投影不得泄露的长工具内容标记。 */
export const LONG_TOOL_SECRET = 'PRIVATE_TOOL_OUTPUT_MARKER';
/** 必须原文保留在最终投影中的当前长任务。 */
export const LONG_CURRENT_USER_TASK = `继续完成新的上下文压缩目标，并严格保留这段当前任务原文。${'当前任务约束不可摘要。'.repeat(500)}`;

/** 当前模型 B 的脱敏快照，用于覆盖旧失败记录的模型 A 维度。 */
export const QUALITY_MODEL_SNAPSHOT: CompactionModelSnapshot = {
  providerType: 'openai',
  providerId: 'provider-b',
  modelId: 'model-b',
  contextWindow: 32_000,
  maxOutputTokens: 2_000
};

/** 父 checkpoint 保存的预算快照。 */
const PARENT_BUDGET: CompactionBudgetSnapshot = {
  outputReserve: 2_000,
  safetyReserve: 1_000,
  usableInputTokens: 29_000,
  triggerTokens: 23_200,
  targetTokens: 15_950,
  summaryMaxTokens: 3_000,
  rawTailMaxTokens: 6_000
};

/** 长会话质量夹具。 */
export interface LongContextFixture {
  /** executor 捕获的原始历史，不包含空 assistant 承载消息。 */
  messages: ChatMessageRecord[];
  /** 本次自动压缩承载消息。 */
  assistantMessage: ChatMessageRecord;
  /** 当前必须保持原文的用户消息 ID。 */
  currentUserMessageId: string;
  /** 摘要模型应返回的最终结构化摘要。 */
  finalSummary: StructuredContextSummary;
}

/**
 * 创建固定消息记录。
 * @param id - 消息 ID
 * @param role - 消息角色
 * @param parts - 有序消息 Part
 * @param finished - 是否完成
 * @returns 消息记录
 */
function createMessage(id: string, role: 'user' | 'assistant', parts: ChatMessagePart[], finished = true): ChatMessageRecord {
  return {
    id,
    sessionId: 'session-quality',
    role,
    content: parts
      .filter((part): part is Extract<ChatMessagePart, { type: 'text' }> => part.type === 'text')
      .map((part): string => part.text)
      .join('\n'),
    parts,
    createdAt: `2026-07-16T00:00:${String(id.length).padStart(2, '0')}.000Z`,
    loading: !finished,
    finished
  };
}

/**
 * 创建带 artifact identity 的完成工具结果。
 * @param id - Part ID
 * @param toolName - 工具名
 * @param data - 工具结果数据
 * @returns 完成工具 Part
 */
function createToolPart(id: string, toolName: string, data: Record<string, unknown>): ChatMessageToolPart {
  return {
    id,
    type: 'tool',
    toolCallId: `call-${id}`,
    toolName,
    status: 'done',
    input: {},
    result: { toolName, status: 'success', data }
  };
}

/**
 * 创建第一轮滚动 checkpoint。
 * @returns 模型 A 生成的成功 checkpoint
 */
function createParentCheckpoint(): ChatMessageCompactionPart {
  return {
    id: 'checkpoint-parent',
    type: 'compaction',
    status: 'success',
    trigger: 'automatic',
    boundaryPartId: 'part-old-answer',
    sourceFingerprint: 'sha256:parent-fingerprint',
    modelSnapshot: {
      providerType: 'openai',
      providerId: 'provider-a',
      modelId: 'model-a',
      contextWindow: 24_000,
      maxOutputTokens: 2_000
    },
    budgetSnapshot: structuredClone(PARENT_BUDGET),
    summary: {
      schemaVersion: 1,
      activeObjectiveId: 'objective-old',
      objectives: [
        {
          id: 'objective-old',
          description: '完成旧目标',
          status: 'active',
          successCriteria: ['旧目标交付'],
          sourcePartIds: ['part-objective-old']
        }
      ],
      facts: [{ id: 'fact-parent', type: 'constraint', content: '旧目标曾经有效', sourcePartIds: ['part-old-answer'] }],
      artifacts: [],
      completedActions: [],
      pendingActions: [],
      openQuestions: [],
      failures: []
    },
    createdAt: 100,
    completedAt: 200
  };
}

/**
 * 创建质量回归期望的最终结构化摘要。
 * @returns 目标漂移、owner 与 artifact identity 完整的摘要
 */
function createFinalSummary(): StructuredContextSummary {
  return {
    schemaVersion: 1,
    activeObjectiveId: 'objective-new',
    objectives: [
      {
        id: 'objective-old',
        description: '完成旧目标',
        status: 'superseded',
        successCriteria: ['旧目标交付'],
        supersededById: 'objective-new',
        sourcePartIds: ['part-objective-old']
      },
      {
        id: 'objective-new',
        description: '完成新的上下文压缩目标',
        status: 'active',
        successCriteria: ['保持当前任务原文', '稳定关联移动后的 artifact'],
        sourcePartIds: ['part-objective-new']
      }
    ],
    facts: [{ id: 'fact-model-switch', type: 'decision', content: '改用模型 B 压缩', sourcePartIds: ['part-objective-new'] }],
    artifacts: [
      {
        id: 'artifact-a',
        path: 'src/utils/a.ts',
        purpose: '稳定入口模块',
        status: 'modified',
        keyChanges: ['创建', '修改', '从 src/a.ts 移动'],
        shouldReload: false,
        sourcePartIds: ['part-file-create', 'part-file-modify', 'part-file-move']
      },
      {
        id: 'artifact-deleted',
        path: 'src/obsolete.ts',
        purpose: '已废弃模块',
        status: 'deleted',
        keyChanges: ['删除'],
        shouldReload: false,
        sourcePartIds: ['part-file-delete']
      }
    ],
    completedActions: [],
    pendingActions: [
      {
        id: 'action-assistant',
        description: '继续实现质量回归',
        owner: { type: 'assistant', id: 'primary' },
        sourcePartIds: ['part-file-move']
      }
    ],
    openQuestions: [
      {
        id: 'question-user',
        question: '是否保留旧兼容入口？',
        owner: { type: 'user' },
        sourcePartIds: ['part-file-delete']
      }
    ],
    failures: [
      {
        id: 'failure-model-a',
        description: '模型 A 的同源压缩失败',
        resolved: false,
        sourcePartIds: ['part-objective-new']
      }
    ]
  };
}

/**
 * 创建完整固定长会话夹具。
 * @returns 可直接交给 compaction executor 的消息和期望摘要
 */
export function createLongContextFixture(): LongContextFixture {
  const oldUser = createMessage('message-old-user', 'user', [{ id: 'part-objective-old', type: 'text', text: '旧目标：完成原入口。' }]);
  const oldAssistant = createMessage('message-old-assistant', 'assistant', [
    { id: 'part-old-answer', type: 'text', text: '旧目标已有阶段结果。' },
    createParentCheckpoint()
  ]);
  const newUser = createMessage('message-new-objective', 'user', [{ id: 'part-objective-new', type: 'text', text: '旧目标作废，改为新的上下文压缩目标。' }]);
  const toolAssistant = createMessage('message-tools', 'assistant', [
    createToolPart('part-tool-huge', 'read_file', {
      artifactId: 'artifact-a',
      path: 'src/a.ts',
      content: `${LONG_TOOL_SECRET}:${'x'.repeat(120_000)}`
    }),
    createToolPart('part-file-create', 'write_file', { artifactId: 'artifact-a', path: 'src/a.ts', status: 'created' }),
    createToolPart('part-file-modify', 'edit_file', { artifactId: 'artifact-a', path: 'src/a.ts', status: 'modified' }),
    createToolPart('part-file-move', 'move_file', { artifactId: 'artifact-a', previousPath: 'src/a.ts', path: 'src/utils/a.ts' }),
    createToolPart('part-file-delete', 'delete_file', { artifactId: 'artifact-deleted', path: 'src/obsolete.ts', status: 'deleted' }),
    {
      id: 'checkpoint-model-a-failed',
      type: 'compaction',
      status: 'failed',
      trigger: 'automatic',
      sourceFingerprint: 'sha256:model-a-failed-fingerprint',
      modelSnapshot: {
        providerType: 'openai',
        providerId: 'provider-a',
        modelId: 'model-a',
        contextWindow: 24_000
      },
      createdAt: 300,
      completedAt: 400,
      errorCode: 'MODEL_CALL_FAILED'
    }
  ]);
  const currentUser = createMessage('message-current-user', 'user', [{ id: 'part-current-task', type: 'text', text: LONG_CURRENT_USER_TASK }]);
  const assistantMessage = createMessage('message-compaction-carrier', 'assistant', [], false);

  return {
    messages: [oldUser, oldAssistant, newUser, toolAssistant, currentUser],
    assistantMessage,
    currentUserMessageId: currentUser.id,
    finalSummary: createFinalSummary()
  };
}
