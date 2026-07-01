/**
 * @file chat-runtime.d.ts
 * @description Shared chat runtime command, event, and context usage types.
 */
import type {
  AIMCPRequestConfig,
  AIServiceError,
  AITavilyRuntimeConfig,
  AIToolExecutionError,
  AIToolExecutionResult,
  AIToolGrantScope,
  AIToolRiskLevel,
  AITransportTool,
  AIUsage
} from './ai';
import type {
  AIUserChoiceAnswerData,
  ChatMessagePartBase,
  ChatMessageConfirmationCustomInputConfig,
  ChatMessageFilePartInput,
  ChatMessagePart,
  ChatMessageRecord,
  ChatMessageTextPart,
  ChatMessageWidgetResultPart
} from './chat';

/** Runtime event channel names emitted from main process to renderer. */
export type ChatRuntimeEventName =
  | 'chat:runtime:message-created'
  | 'chat:runtime:message-updated'
  | 'chat:runtime:message-deleted'
  | 'chat:runtime:context-usage-updated'
  | 'chat:runtime:tool-request'
  | 'chat:runtime:confirmation-requested'
  | 'chat:runtime:bridge-requested'
  | 'chat:runtime:error'
  | 'chat:runtime:complete';

/** Runtime command result wrapper. */
export interface ChatRuntimeHandlerResult<T = void> {
  /** Whether the command succeeded. */
  ok: boolean;
  /** Command data when successful. */
  data?: T;
  /** Error message when unsuccessful. */
  error?: string;
  /** Stable error code for UI handling. */
  code?: string;
}

/** Renderer context snapshot sent with runtime commands. */
export interface ChatRuntimeClientSnapshot {
  /** Active document snapshot available to main process. */
  document?: {
    /** Document id. */
    id: string;
    /** Visible title. */
    title: string;
    /** Disk path when saved. */
    path: string | null;
    /** Virtual locator for unsaved documents. */
    locator?: string;
    /** Current document content. */
    content: string;
    /** Current selection snapshot. */
    selection?: {
      /** Selection start offset. */
      from: number;
      /** Selection end offset. */
      to: number;
      /** Selected text. */
      text: string;
    } | null;
  };
}

/** Renderer message snapshot accepted by runtime continuation commands. */
export type ChatRuntimeMessageSnapshot = Omit<ChatMessageRecord, 'sessionId'> & {
  /** Session id may be absent in renderer-only BChat messages. */
  sessionId?: string;
};

/** Renderer-created user input parts accepted by runtime send commands. */
export type ChatRuntimeUserInputPart = ChatMessageTextPart | ChatMessageFilePartInput | ChatMessageWidgetResultPart;

/** Send command input. */
export interface ChatRuntimeSendInput {
  /** Existing session id; omitted for draft sessions. */
  sessionId?: string;
  /** Renderer chat panel id. */
  clientId: string;
  /** Agent id for this turn. */
  agentId: string;
  /** Parent runtime id for future multi-agent flows. */
  parentRuntimeId?: string;
  /** User message text. */
  content: string;
  /** Ordered user input parts parsed by renderer before file snapshots are materialized. */
  parts?: ChatRuntimeUserInputPart[];
  /** Renderer-created user message id, used to avoid duplicate local/runtime messages. */
  userMessageId?: string;
  /** Renderer-created user message timestamp. */
  userMessageCreatedAt?: string;
  /** Current model context window for usage estimation. */
  contextWindow?: number;
  /** System prompt context owned by renderer state until main process owns memory. */
  system?: string;
  /** Current workspace root used by main-process file tools. */
  workspaceRoot?: string;
  /** Transport tool schemas executable by main process AI runtime. */
  tools?: AITransportTool[];
  /** Tavily runtime config executable in main process. */
  tavily?: AITavilyRuntimeConfig;
  /** MCP runtime config executable in main process. */
  mcp?: AIMCPRequestConfig;
  /** Optional file/image attachments stored in the normal chat message shape. */
  files?: ChatMessageRecord['files'];
  /** Renderer-side context snapshot captured at send time. */
  snapshot?: ChatRuntimeClientSnapshot;
}

/** Continue command input for resuming a paused assistant turn. */
export interface ChatRuntimeContinueInput {
  /** Existing session id. */
  sessionId: string;
  /** Renderer chat panel id. */
  clientId: string;
  /** Agent id for this turn. */
  agentId: string;
  /** Parent runtime id for future multi-agent flows. */
  parentRuntimeId?: string;
  /** Current model context window for usage estimation. */
  contextWindow?: number;
  /** System prompt context owned by renderer state until main process owns memory. */
  system?: string;
  /** Current workspace root used by main-process file tools. */
  workspaceRoot?: string;
  /** Transport tool schemas executable by main process AI runtime. */
  tools?: AITransportTool[];
  /** Tavily runtime config executable in main process. */
  tavily?: AITavilyRuntimeConfig;
  /** MCP runtime config executable in main process. */
  mcp?: AIMCPRequestConfig;
  /** Renderer-updated message snapshot to continue from. */
  messages: ChatRuntimeMessageSnapshot[];
}

/** Submit-user-choice command input for resuming an awaiting assistant turn from persisted runtime messages. */
export interface ChatRuntimeSubmitUserChoiceInput {
  /** Existing session id. */
  sessionId: string;
  /** Renderer chat panel id. */
  clientId: string;
  /** Agent id for this turn. */
  agentId: string;
  /** Parent runtime id for future multi-agent flows. */
  parentRuntimeId?: string;
  /** Current model context window for usage estimation. */
  contextWindow?: number;
  /** System prompt context owned by renderer state until main process owns memory. */
  system?: string;
  /** Current workspace root used by main-process file tools. */
  workspaceRoot?: string;
  /** Transport tool schemas executable by main process AI runtime. */
  tools?: AITransportTool[];
  /** Tavily runtime config executable in main process. */
  tavily?: AITavilyRuntimeConfig;
  /** MCP runtime config executable in main process. */
  mcp?: AIMCPRequestConfig;
  /** User choice answer submitted by renderer UI. */
  answer: AIUserChoiceAnswerData;
}

/** Runtime confirmation decision submitted by renderer UI. */
export type ChatRuntimeConfirmationDecision =
  | { approved: false }
  | {
      /** Whether the operation is approved. */
      approved: true;
      /** Optional permission grant scope. */
      grantScope?: AIToolGrantScope;
    };

/** Runtime confirmation request shown by renderer UI. */
export interface ChatRuntimeConfirmationRequest {
  /** Related tool call id. */
  toolCallId?: string;
  /** Tool name. */
  toolName: string;
  /** Confirmation title. */
  title: string;
  /** Confirmation description. */
  description: string;
  /** Operation risk level. */
  riskLevel: AIToolRiskLevel;
  /** Text before the operation. */
  beforeText?: string;
  /** Text after the operation. */
  afterText?: string;
  /** Whether renderer may offer remembered approvals. */
  allowRemember?: boolean;
  /** Available remembered approval scopes. */
  rememberScopes?: AIToolGrantScope[];
  /** Custom input config associated with the confirmation UI. */
  customInput?: ChatMessageConfirmationCustomInputConfig;
}

/** Submit-confirmation command input. */
export interface ChatRuntimeSubmitConfirmationInput {
  /** Runtime id waiting for this confirmation. */
  runtimeId: string;
  /** Confirmation request id. */
  confirmationId: string;
  /** Renderer confirmation decision. */
  decision: ChatRuntimeConfirmationDecision;
}

/** Runtime renderer bridge result. */
export type ChatRuntimeBridgeResult =
  | {
      /** Bridge request succeeded. */
      status: 'success';
      /** JSON-cloneable bridge payload. */
      data: unknown;
    }
  | {
      /** Bridge request failed. */
      status: 'failure';
      /** Failure details. */
      error: AIToolExecutionError;
    };

/** Submit-bridge-response command input. */
export interface ChatRuntimeBridgeResponseInput {
  /** Runtime id waiting for this bridge response. */
  runtimeId: string;
  /** Bridge request id. */
  requestId: string;
  /** Bridge result. */
  result: ChatRuntimeBridgeResult;
}

/** Abort command input. */
export interface ChatRuntimeAbortInput {
  /** Runtime id to abort. */
  runtimeId: string;
}

/** Compact command input. */
export interface ChatRuntimeCompactInput {
  /** Runtime id. */
  runtimeId: string;
  /** Session id. */
  sessionId: string;
  /** Renderer client id. */
  clientId: string;
  /** Agent id. */
  agentId: string;
  /** Parent runtime id for future multi-agent flows. */
  parentRuntimeId?: string;
  /** Why compaction started. */
  reason: 'manual' | 'auto';
  /** Current context window for tail preservation budget. */
  contextWindow?: number;
  /** Message snapshot to compact until main runtime fully owns chat history. */
  messages?: ChatMessageRecord[];
  /** Assistant message to receive automatic compaction status parts. */
  targetMessage?: ChatMessageRecord;
}

/** Renderer local tool result submission input. */
export interface ChatRuntimeSubmitToolResultInput {
  /** Runtime id waiting for this result. */
  runtimeId: string;
  /** Tool call id. */
  toolCallId: string;
  /** Tool execution result. */
  result: AIToolExecutionResult;
}

/** Auto-name command input. */
export interface ChatRuntimeAutoNameInput {
  /** Session id to rename. */
  sessionId: string;
  /** First user message content. */
  userMessage: string;
  /** First assistant response content. */
  aiResponse: string;
}

/** Auto-name command result. */
export type ChatRuntimeAutoNameResult =
  | {
      /** Naming succeeded and title has been persisted. */
      status: 'success';
      /** Persisted title. */
      title: string;
    }
  | {
      /** Naming was skipped before model invocation or persistence. */
      status: 'skipped';
      /** Stable skip reason. */
      reason: 'no_model_config' | 'empty_title';
    }
  | {
      /** Naming failed after attempting work. */
      status: 'failed';
      /** Error description. */
      errorMessage: string;
    };

/** Compact command result. */
export type ChatRuntimeCompactResult =
  | {
      /** Compaction completed. */
      status: 'success';
      /** Compression boundary message id. */
      messageId: string;
      /** Compression record id. */
      recordId: string;
    }
  | {
      /** Compaction was skipped before creating a pending message. */
      status: 'skipped';
      /** Stable skip reason. */
      reason: 'no_messages' | 'already_compact' | 'not_enough_content' | 'no_compressible_messages';
      /** Compression status message id, when a user-facing notice was created. */
      messageId?: string;
    }
  | {
      /** Compaction failed and the boundary message was marked failed. */
      status: 'failed';
      /** Compression boundary message id. */
      messageId: string;
      /** Error message. */
      errorMessage: string;
    }
  | {
      /** Compaction was cancelled and the boundary message was marked cancelled. */
      status: 'cancelled';
      /** Compression boundary message id. */
      messageId: string;
    };

/** Runtime state returned after starting a command. */
export interface ChatRuntimeStartResult {
  /** Runtime id created by main process. */
  runtimeId: string;
  /** Session id owned by the runtime. */
  sessionId: string;
  /** Whether the command completed synchronously without leaving an active runtime. */
  completed?: boolean;
}

/** Context usage visual state. */
export type ChatRuntimeContextUsageStatus = 'safe' | 'warning' | 'danger';

/** Context usage snapshot emitted by main process. */
export interface ChatRuntimeContextUsageSnapshot {
  /** Runtime id that produced the snapshot. */
  runtimeId: string;
  /** Session id being evaluated. */
  sessionId: string;
  /** Agent id used for the evaluation. */
  agentId: string;
  /** Complete model context window. */
  contextWindow: number;
  /** Tokens reserved for model output. */
  reservedOutputTokens: number;
  /** Tokens reserved as compaction safety buffer. */
  compactionBufferTokens: number;
  /** Computed usable input budget. */
  usableInputTokens: number;
  /** Estimated serialized input tokens. */
  estimatedInputTokens: number;
  /** Provider-reported tokens from the last turn when available. */
  providerUsageTokens?: number;
  /** Rounded usage percent. */
  usagePercent: number;
  /** Remaining input budget. */
  remainingInputTokens: number;
  /** Visual status for UI. */
  status: ChatRuntimeContextUsageStatus;
  /** Whether the estimate should trigger send-before compaction. */
  shouldCompactBeforeSend: boolean;
}

/** Common event envelope fields. */
export interface ChatRuntimeEventBase {
  /** Runtime id. */
  runtimeId: string;
  /** Session id. */
  sessionId: string;
  /** Renderer client id. */
  clientId: string;
  /** Agent id. */
  agentId: string;
  /** Parent runtime id for future multi-agent flows. */
  parentRuntimeId?: string;
}

/** Message event emitted when a message is created or updated. */
export interface ChatRuntimeMessageEvent extends ChatRuntimeEventBase {
  /** Message payload. */
  message: ChatMessageRecord;
}

/** Message event emitted when a runtime-owned message is deleted. */
export interface ChatRuntimeMessageDeletedEvent extends ChatRuntimeEventBase {
  /** Deleted message id. */
  messageId: string;
}

/** Context usage event. */
export interface ChatRuntimeContextUsageEvent extends ChatRuntimeEventBase {
  /** Usage snapshot. */
  snapshot: ChatRuntimeContextUsageSnapshot;
}

/** Runtime tool execution request sent to renderer. */
export interface ChatRuntimeToolRequestEvent extends ChatRuntimeEventBase {
  /** Tool call id. */
  toolCallId: string;
  /** Tool name. */
  toolName: string;
  /** Tool input. */
  input: unknown;
}

/** Runtime confirmation request sent to renderer. */
export interface ChatRuntimeConfirmationRequestEvent extends ChatRuntimeEventBase {
  /** Confirmation request id. */
  confirmationId: string;
  /** Related tool call id. */
  toolCallId?: string;
  /** Confirmation request shown by UI. */
  request: ChatRuntimeConfirmationRequest;
}

/** Runtime renderer bridge request sent to renderer. */
export interface ChatRuntimeBridgeRequestEvent extends ChatRuntimeEventBase {
  /** Bridge request id. */
  requestId: string;
  /** Related tool call id. */
  toolCallId?: string;
  /** Bridge request kind. */
  kind: string;
  /** JSON-cloneable bridge request payload. */
  payload?: unknown;
}

/** Runtime error event. */
export interface ChatRuntimeErrorEvent extends ChatRuntimeEventBase {
  /** Normalized AI or runtime error. */
  error: AIServiceError;
}

/** Runtime complete event. */
export interface ChatRuntimeCompleteEvent extends ChatRuntimeEventBase {
  /** Optional usage reported by provider. */
  usage?: AIUsage;
}

/** Runtime event payload map. */
export interface ChatRuntimeEventMap {
  'chat:runtime:message-created': ChatRuntimeMessageEvent;
  'chat:runtime:message-updated': ChatRuntimeMessageEvent;
  'chat:runtime:message-deleted': ChatRuntimeMessageDeletedEvent;
  'chat:runtime:context-usage-updated': ChatRuntimeContextUsageEvent;
  'chat:runtime:tool-request': ChatRuntimeToolRequestEvent;
  'chat:runtime:confirmation-requested': ChatRuntimeConfirmationRequestEvent;
  'chat:runtime:bridge-requested': ChatRuntimeBridgeRequestEvent;
  'chat:runtime:error': ChatRuntimeErrorEvent;
  'chat:runtime:complete': ChatRuntimeCompleteEvent;
}

/** Compaction part inserted into assistant messages by runtime phases. */
export interface ChatMessageCompactionPart extends ChatMessagePartBase {
  /** Part discriminator. */
  type: 'compaction';
  /** Whether runtime created this automatically. */
  auto: boolean;
  /** Why compaction started. */
  reason: 'manual' | 'auto' | 'overflow';
  /** Current compaction status. */
  status: 'pending' | 'success' | 'failed' | 'cancelled' | 'skipped';
  /** First tail message preserved verbatim. */
  tailStartMessageId?: string;
  /** Compression record id. */
  recordId?: string;
  /** Compression record text injected into later model context. */
  recordText?: string;
  /** Message id covered by this compaction boundary. */
  coveredUntilMessageId?: string;
  /** Source message ids covered by this compaction boundary. */
  sourceMessageIds?: string[];
  /** Failure message when status is failed. */
  errorMessage?: string;
}

/** Runtime-specific message metadata. */
export interface ChatMessageRuntimeMeta {
  /** Compaction metadata stored on summary messages. */
  compaction?: {
    /** Anchor summary text. */
    anchorSummary?: string;
    /** Previous summary message id. */
    previousSummaryMessageId?: string;
    /** Message ids hidden from later compaction select passes. */
    hiddenMessageIds?: string[];
    /** Serialized recent model messages for event/debug payloads. */
    recentModelMessagesJson?: string;
  };
  /** Last context usage snapshot associated with this message. */
  contextUsage?: ChatRuntimeContextUsageSnapshot;
}

/** Utility alias used in type-level tests and future message helpers. */
export type ChatRuntimeMessagePart = ChatMessagePart | ChatMessageCompactionPart;
