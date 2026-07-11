/**
 * @file useChatActorSystem.ts
 * @description 应用级 Chat Actor system 的 Vue provide/inject 接入。
 */
import type { InjectionKey } from 'vue';
import { inject, onScopeDispose, provide } from 'vue';
import { createChatActorSystem, type ChatActorSystem } from '@/ai/chat/actorSystem';
import { useChatRuntimeEvents } from '@/hooks/useChatRuntimeEvents';
import { useChatRuntimeRecovery } from '@/hooks/useChatRuntimeRecovery';

/** Chat Actor system 注入键。 */
const CHAT_ACTOR_SYSTEM_KEY: InjectionKey<ChatActorSystem> = Symbol('chat-actor-system');
/** renderer 进程内唯一 Chat Actor system。 */
let applicationChatActorSystem: ChatActorSystem | undefined;

/**
 * 获取 renderer 进程内唯一 Chat Actor system。
 * @returns 已启动的 Chat Actor system
 */
function getApplicationChatActorSystem(): ChatActorSystem {
  if (!applicationChatActorSystem) {
    applicationChatActorSystem = createChatActorSystem();
    applicationChatActorSystem.start();
  }

  return applicationChatActorSystem;
}

/**
 * 在应用根级创建并提供 Chat Actor system。
 * @returns 应用级 Chat Actor system
 */
export function useProvideChatActorSystem(): ChatActorSystem {
  const actorSystem = getApplicationChatActorSystem();
  provide(CHAT_ACTOR_SYSTEM_KEY, actorSystem);
  useChatRuntimeEvents(actorSystem);
  useChatRuntimeRecovery(actorSystem);

  onScopeDispose((): void => {
    actorSystem.stop();
    if (applicationChatActorSystem === actorSystem) {
      applicationChatActorSystem = undefined;
    }
  });

  return actorSystem;
}

/**
 * 读取应用级 Chat Actor system。
 * @returns Chat Actor system
 */
export function useChatActorSystem(): ChatActorSystem {
  const providedActorSystem = inject(CHAT_ACTOR_SYSTEM_KEY, undefined);
  if (providedActorSystem) {
    return providedActorSystem;
  }

  // 组件隔离挂载时创建作用域内系统，避免测试或独立预览之间共享会话状态。
  const localActorSystem = createChatActorSystem();
  localActorSystem.start();
  useChatRuntimeEvents(localActorSystem);
  onScopeDispose((): void => localActorSystem.stop());
  return localActorSystem;
}
