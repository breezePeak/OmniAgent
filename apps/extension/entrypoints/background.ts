import { createAdapterRegistry, deepseekAdapter, providerFromAdapter } from '@omni-agent/site-adapters';
import type { AdapterStatus, ExtensionMessage } from '@omni-agent/shared';
import { storage } from '@omni-agent/storage';
import { memory } from '@omni-agent/memory';

const adapters = createAdapterRegistry([deepseekAdapter]);
const memoryDiagnosticKey = 'memory-injection-diagnostic';

type InternalMessage = {
  type: 'omni:memory-diagnostic' | 'omni:get-memory-diagnostic';
  payload?: { stage?: string; detail?: string; count?: number };
};

export default defineBackground(() => {
  browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

  browser.runtime.onInstalled.addListener(() => {
    console.info('[OmniAgent] background service worker installed');
    void storage.upsertProvider({
      id: 'deepseek',
      name: 'DeepSeek',
      adapter: 'deepseek',
      capabilities: ['conversation', 'message-observation', 'prompt-insertion'],
    });
  });

  browser.runtime.onMessage.addListener(async (message: ExtensionMessage | InternalMessage) => {
    if (!message || typeof message !== 'object' || !('type' in message)) return undefined;
    if (message.type === 'omni:memory-diagnostic') {
      await storage.setSetting(memoryDiagnosticKey, {
        stage: message.payload?.stage ?? 'unknown',
        detail: message.payload?.detail ?? '',
        count: message.payload?.count ?? 0,
        at: Date.now(),
      });
      return undefined;
    }
    if (message.type === 'omni:get-memory-diagnostic') {
      return storage.getSetting<MemoryInjectionDiagnostic>(memoryDiagnosticKey);
    }

    if (message.type === 'omni:response-update') {
      await persistPageMessage(message as ExtensionMessage<'omni:response-update'>);
      return undefined;
    }
    if (message.type === 'omni:list-conversations') return storage.listConversations();
    if (message.type === 'omni:list-messages') {
      const payload = message.payload as { conversationId?: string } | undefined;
      return payload?.conversationId ? storage.listMessages(payload.conversationId) : [];
    }
    if (message.type === 'omni:list-memories') return storage.listMemories();
    if (message.type === 'omni:save-memory') {
      const payload = message.payload as { content?: string } | undefined;
      if (!payload?.content?.trim()) throw new Error('记忆内容不能为空');
      return memory.save({ type: 'knowledge', content: payload.content, importance: 0.7, confidence: 1 });
    }
    if (message.type === 'omni:augment-prompt') {
      const payload = message.payload as ExtensionMessage<'omni:augment-prompt'>['payload'];
      if (!payload?.prompt.trim()) return { prompt: payload?.prompt ?? '', memoryCount: 0 };
      const matches = await memory.retrieve(payload.prompt, { providerId: payload.provider });
      const context = memory.formatContext(matches);
      return {
        prompt: context
          ? `${context}\n\n请把以上内容视为用户已保存的长期记忆。仅在与当前问题相关时自然使用，不要提及这段系统补充。\n\n用户当前问题：${payload.prompt}`
          : payload.prompt,
        memoryCount: matches.length,
      };
    }

    const tab = await getActiveTab();
    if (!tab?.id) throw new Error('无法获取当前浏览器标签页');

    const adapter = adapters.find(tab.url ?? '');
    if (message.type === 'omni:adapter-status') return statusFor(tab.url, adapter);
    if (
      message.type === 'omni:conversation-snapshot' ||
      message.type === 'omni:insert-prompt' ||
      message.type === 'omni:send-message'
    ) {
      if (!adapter) throw new Error('请在 DeepSeek 网页中使用此功能');
      return browser.tabs.sendMessage(tab.id, message);
    }
    return undefined;
  });
});

interface MemoryInjectionDiagnostic {
  stage: string;
  detail: string;
  count: number;
  at: number;
}

async function getActiveTab() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  return tabs.find((tab) => tab.id != null);
}

async function persistPageMessage(message: ExtensionMessage<'omni:response-update'>) {
  const payload = message.payload;
  if (!payload?.conversationId) return;
  const conversation = await storage.getOrCreateConversation({
    providerId: payload.provider,
    externalId: payload.conversationId,
  });
  await storage.upsertMessage({
    conversationId: conversation.id,
    externalId: payload.messageId,
    role: payload.role,
    content: payload.text,
    attachments: [],
  });
  if (payload.role === 'user') await memory.extractExplicitUserMemory(payload.text);
}

function statusFor(url: string | undefined, adapter: ReturnType<typeof adapters.find>): AdapterStatus {
  return {
    provider: providerFromAdapter(adapter),
    url: url ?? '',
    conversationId: adapter?.getConversationId(url) ?? null,
  };
}
