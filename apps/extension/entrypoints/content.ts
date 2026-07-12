import { createAdapterRegistry, deepseekAdapter, providerFromAdapter } from '@omni-agent/site-adapters';
import type { AdapterStatus, ExtensionMessage, ExtensionMessageMap } from '@omni-agent/shared';

// Kimi remains outside the active registry until its real-page selectors are verified.
const adapters = createAdapterRegistry([deepseekAdapter]);

const MAIN_WORLD_SOURCE = 'omniagent-main-world';
const CONTENT_SOURCE = 'omniagent-content';
const BRIDGE_REQUEST = 'OMNIAGENT_BRIDGE_REQUEST';
const BRIDGE_INIT = 'OMNIAGENT_BRIDGE_INIT';
const BRIDGE_READY = 'OMNIAGENT_BRIDGE_READY';

type MainWorldRequest = {
  source?: string;
  type?: string;
  id?: string;
  prompt?: string;
  stage?: string;
  detail?: string;
  count?: number;
};

let mainWorldPort: MessagePort | null = null;

export default defineContentScript({
  matches: ['*://chat.deepseek.com/*'],
  runAt: 'document_start',
  main(ctx) {
    installMainWorldBridge();
    window.setTimeout(() => {
      if (document.documentElement.getAttribute('data-omniagent-main-world') !== 'ready') return;
      void browser.runtime.sendMessage({
        type: 'omni:memory-diagnostic',
        payload: { stage: 'main-world-loaded', detail: '主世界脚本已执行，正在等待桥接', count: 0 },
      } as unknown as ExtensionMessage);
    }, 200);
    const adapter = adapters.find(window.location.href);
    const status = (): AdapterStatus => ({
      provider: providerFromAdapter(adapter),
      url: window.location.href,
      conversationId: adapter?.getConversationId() ?? null,
    });

    const handleMessage = async (message: ExtensionMessage) => {
      if (message.type === 'omni:adapter-status') return status();
      if (message.type === 'omni:conversation-snapshot' && adapter) return adapter.getLatestTurn();
      if (message.type === 'omni:insert-prompt' && adapter) {
        const payload = message.payload as ExtensionMessageMap['omni:insert-prompt'] | undefined;
        if (payload?.message) return adapter.insertPrompt(payload.message).then(() => status());
      }
      if (message.type === 'omni:send-message' && adapter) {
        const payload = message.payload as ExtensionMessageMap['omni:send-message'] | undefined;
        if (payload?.message) return adapter.sendMessage(payload.message).then(() => status());
      }
      return undefined;
    };
    browser.runtime.onMessage.addListener(handleMessage);

    const stopObserving = adapter?.observeMessages(({ id, role, text }) => {
      void browser.runtime.sendMessage<ExtensionMessage<'omni:response-update'>>({
        type: 'omni:response-update',
        payload: {
          provider: providerFromAdapter(adapter) ?? 'deepseek',
          role,
          text,
          messageId: id,
          conversationId: adapter.getConversationId(),
        },
      });
    });

    ctx.onInvalidated(() => {
      browser.runtime.onMessage.removeListener(handleMessage);
      stopObserving?.();
      mainWorldPort?.close();
      mainWorldPort = null;
    });

    if (adapter) console.info(`[OmniAgent] ${adapter.id} adapter active`);
  },
});

function installMainWorldBridge(): void {
  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return;
    if (event.data?.source !== MAIN_WORLD_SOURCE || event.data?.type !== BRIDGE_REQUEST || mainWorldPort) return;
    connectMainWorldPort();
  });
}

function connectMainWorldPort(): void {
  if (mainWorldPort) return;
  const channel = new MessageChannel();
  mainWorldPort = channel.port1;
  mainWorldPort.onmessage = (event) => void handleMainWorldMessage(event.data);
  mainWorldPort.start();
  window.postMessage(
    { source: CONTENT_SOURCE, type: BRIDGE_INIT },
    window.location.origin,
    [channel.port2],
  );
}

async function handleMainWorldMessage(data: MainWorldRequest): Promise<void> {
  if (data?.source === MAIN_WORLD_SOURCE && data.type === 'OMNIAGENT_DIAGNOSTIC') {
    await browser.runtime.sendMessage({
      type: 'omni:memory-diagnostic',
      payload: { stage: data.stage, detail: data.detail, count: data.count },
    } as unknown as ExtensionMessage);
    return;
  }
  if (data?.source !== MAIN_WORLD_SOURCE || data.type !== 'OMNIAGENT_AUGMENT_PROMPT' || !data.id) return;
  try {
    const prompt = typeof data.prompt === 'string' ? data.prompt : '';
    const result = await browser.runtime.sendMessage<ExtensionMessage<'omni:augment-prompt'>>({
      type: 'omni:augment-prompt',
      payload: { provider: 'deepseek', prompt },
    }) as { prompt?: string; memoryCount?: number } | undefined;
    mainWorldPort?.postMessage({
      source: CONTENT_SOURCE,
      type: 'OMNIAGENT_AUGMENT_PROMPT_RESULT',
      id: data.id,
      prompt: result?.prompt ?? prompt,
      memoryCount: result?.memoryCount ?? 0,
    });
    await browser.runtime.sendMessage({
      type: 'omni:memory-diagnostic',
      payload: { stage: 'memory-retrieved', detail: '扩展已完成记忆检索', count: result?.memoryCount ?? 0 },
    } as unknown as ExtensionMessage);
  } catch (error) {
    console.warn('[OmniAgent] memory augmentation unavailable', error);
    mainWorldPort?.postMessage({
      source: CONTENT_SOURCE,
      type: 'OMNIAGENT_AUGMENT_PROMPT_RESULT',
      id: data.id,
      prompt: data.prompt ?? '',
      memoryCount: 0,
    });
    await browser.runtime.sendMessage({
      type: 'omni:memory-diagnostic',
      payload: { stage: 'augmentation-error', detail: error instanceof Error ? error.message : String(error), count: 0 },
    } as unknown as ExtensionMessage);
  }
}
