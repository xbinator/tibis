/**
 * @file chat-runtime.d.ts
 * @description Shared chat runtime command and event types.
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
  ChatPendingInteraction,
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
  | 'chat:runtime:tool-cancelled'
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

/** Cloneable renderer capability identity retained by the main-process runtime. */
export interface ChatRuntimeCapabilityDescriptor {
  /** Renderer tool names exposed when the runtime started. */
  rendererToolNames: string[];
  /** Document id captured when document-scoped tools were registered. */
  documentId?: string;
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
  /** Runtime id allocated by renderer before the command starts. */
  runtimeId: string;
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
  /** Current enabled Skill content versions used to invalidate stale history. */
  skillContentHashes?: Record<string, string>;
  /** Tavily runtime config executable in main process. */
  tavily?: AITavilyRuntimeConfig;
  /** MCP runtime config executable in main process. */
  mcp?: AIMCPRequestConfig;
  /** Optional file/image attachments stored in the normal chat message shape. */
  files?: ChatMessageRecord['files'];
  /** Renderer-side context snapshot captured at send time. */
  snapshot?: ChatRuntimeClientSnapshot;
  /** Renderer capability identity used to rebuild routing after renderer reload. */
  capabilities?: ChatRuntimeCapabilityDescriptor;
}

/** Continue command input for resuming a paused assistant turn. */
export interface ChatRuntimeContinueInput {
  /** Runtime id allocated by renderer before the command starts. */
  runtimeId: string;
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
  /** Current enabled Skill content versions used to invalidate stale history. */
  skillContentHashes?: Record<string, string>;
  /** Tavily runtime config executable in main process. */
  tavily?: AITavilyRuntimeConfig;
  /** MCP runtime config executable in main process. */
  mcp?: AIMCPRequestConfig;
  /** Renderer-updated message snapshot to continue from. */
  messages: ChatRuntimeMessageSnapshot[];
  /** Renderer capability identity used to rebuild routing after renderer reload. */
  capabilities?: ChatRuntimeCapabilityDescriptor;
}

/** Manual context compaction command input. */
export interface ChatRuntimeCompactInput {
  /** Runtime id allocated by renderer before the command starts. */
  runtimeId: string;
  /** Existing session id. */
  sessionId: string;
  /** Renderer chat panel id. */
  clientId: string;
  /** Agent id for this operation. */
  agentId: string;
  /** Current model context window used for budgeting. */
  contextWindow?: number;
  /** Current system prompt context. */
  system?: string;
  /** Current workspace root used by main-process file tools. */
  workspaceRoot?: string;
  /** Transport tool schemas included in context budgeting. */
  tools?: AITransportTool[];
  /** Current enabled Skill content versions. */
  skillContentHashes?: Record<string, string>;
  /** Renderer capability identity captured at compaction start. */
  capabilities?: ChatRuntimeCapabilityDescriptor;
}

/** Submit-user-choice command input for resuming an awaiting assistant turn from persisted runtime messages. */
export interface ChatRuntimeSubmitUserChoiceInput {
  /** Runtime id allocated by renderer before the command starts. */
  runtimeId: string;
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
  /** Current enabled Skill content versions used to invalidate stale history. */
  skillContentHashes?: Record<string, string>;
  /** Tavily runtime config executable in main process. */
  tavily?: AITavilyRuntimeConfig;
  /** MCP runtime config executable in main process. */
  mcp?: AIMCPRequestConfig;
  /** User choice answer submitted by renderer UI. */
  answer: AIUserChoiceAnswerData;
  /** Renderer capability identity used to rebuild routing after renderer reload. */
  capabilities?: ChatRuntimeCapabilityDescriptor;
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

/** Renderer local tool result submission input. */
export interface ChatRuntimeSubmitToolResultInput {
  /** Runtime id waiting for this result. */
  runtimeId: string;
  /** Tool call id. */
  toolCallId: string;
  /** Tool execution result. */
  result: AIToolExecutionResult;
}

/** Renderer message part submission input. */
export interface ChatRuntimeSubmitMessagePartInput {
  /** Runtime id owning the active assistant message. */
  runtimeId: string;
  /** Active assistant message id. */
  messageId: string;
  /** Next message part snapshot. */
  part: ChatMessagePart;
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

/** Runtime state returned after starting a command. */
export interface ChatRuntimeStartResult {
  /** Runtime id created by main process. */
  runtimeId: string;
  /** Session id owned by the runtime. */
  sessionId: string;
  /** Whether the command completed synchronously without leaving an active runtime. */
  completed?: boolean;
}

/** Read-only context usage estimate input for an idle session. */
export interface ChatRuntimeEstimateContextInput {
  /** Session whose persisted messages should be projected. */
  sessionId: string;
  /** Maximum context window for the currently selected model. */
  contextWindow: number;
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

/** Current model-input context usage snapshot. */
export interface ChatRuntimeContextUsageSnapshot {
  /** Estimated tokens in the current model request projection. */
  usedTokens: number;
  /** Maximum context window captured for the selected model. */
  contextWindow: number;
}

/** Context usage event emitted after the runtime projects model input. */
export interface ChatRuntimeContextUsageEvent extends ChatRuntimeEventBase {
  /** Context usage snapshot for the addressed session. */
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

/** Runtime renderer tool cancellation sent to renderer. */
export interface ChatRuntimeToolCancelledEvent extends ChatRuntimeEventBase {
  /** Tool call id to abort locally. */
  toolCallId: string;
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

/** Recoverable renderer request retained while the main-process runtime waits. */
export type ChatRuntimeRecoveryPendingRequest =
  | { type: 'tool'; event: ChatRuntimeToolRequestEvent }
  | { type: 'confirmation'; event: ChatRuntimeConfirmationRequestEvent }
  | { type: 'bridge'; event: ChatRuntimeBridgeRequestEvent };

/** Cloneable active-runtime projection used to rebuild renderer actor state. */
export interface ChatRuntimeRecoverySnapshot extends ChatRuntimeEventBase {
  /** Current runtime execution phase. */
  phase: 'streaming' | 'compacting';
  /** Main-process runtime creation timestamp. */
  createdAt: number;
  /** Renderer capability identity captured at runtime start. */
  capabilities?: ChatRuntimeCapabilityDescriptor;
  /** Renderer requests that were emitted but not answered. */
  pendingRequests: ChatRuntimeRecoveryPendingRequest[];
}

/** Runtime error event. */
export interface ChatRuntimeErrorEvent extends ChatRuntimeEventBase {
  /** Normalized AI or runtime error. */
  error: AIServiceError;
}

/** Runtime 完成原因。 */
export type ChatRuntimeCompletionReason = 'completed' | 'awaiting_user_input';

/** Runtime complete event. */
export type ChatRuntimeCompleteEvent = ChatRuntimeEventBase &
  (
    | {
        /** Runtime 正常完成。 */
        reason: Extract<ChatRuntimeCompletionReason, 'completed'>;
        /** 正常完成不携带待处理交互。 */
        interaction?: never;
        /** Optional usage reported by provider. */
        usage?: AIUsage;
      }
    | {
        /** Runtime 已释放资源并暂停等待用户输入。 */
        reason: Extract<ChatRuntimeCompletionReason, 'awaiting_user_input'>;
        /** 等待中的持久化交互。 */
        interaction: ChatPendingInteraction;
        /** Optional usage reported by provider. */
        usage?: AIUsage;
      }
  );

/** Runtime event payload map. */
export interface ChatRuntimeEventMap {
  'chat:runtime:message-created': ChatRuntimeMessageEvent;
  'chat:runtime:message-updated': ChatRuntimeMessageEvent;
  'chat:runtime:message-deleted': ChatRuntimeMessageDeletedEvent;
  'chat:runtime:context-usage-updated': ChatRuntimeContextUsageEvent;
  'chat:runtime:tool-request': ChatRuntimeToolRequestEvent;
  'chat:runtime:tool-cancelled': ChatRuntimeToolCancelledEvent;
  'chat:runtime:confirmation-requested': ChatRuntimeConfirmationRequestEvent;
  'chat:runtime:bridge-requested': ChatRuntimeBridgeRequestEvent;
  'chat:runtime:error': ChatRuntimeErrorEvent;
  'chat:runtime:complete': ChatRuntimeCompleteEvent;
}
