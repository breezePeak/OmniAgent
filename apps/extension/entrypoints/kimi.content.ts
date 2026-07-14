import { BrowserPageController } from '@omni-agent/browser-agent';
import { createAdapterRegistry, kimiAdapter, providerFromAdapter } from '@omni-agent/site-adapters';
import type { AdapterStatus, ExtensionMessage, ExtensionMessageMap } from '@omni-agent/shared';
import { installMainWorldBridge } from '../src/content/main-world-bridge';

const adapters = createAdapterRegistry([kimiAdapter]);
const pageController = new BrowserPageController();

export default defineContentScript({
  matches: [
    '*://kimi.com/*',
    '*://www.kimi.com/*',
    '*://kimi.moonshot.cn/*',
    '*://www.kimi.moonshot.cn/*',
  ],
  runAt: 'document_start',
  main(ctx) {
    const disposeBridge = installMainWorldBridge('kimi');
    const adapter = adapters.find(window.location.href);
    const pageSessionId = globalThis.crypto?.randomUUID?.() ?? `page-${Date.now().toString(36)}`;
    const status = (): AdapterStatus => ({
      provider: providerFromAdapter(adapter),
      url: window.location.href,
      conversationId: adapter?.getConversationId() ?? null,
    });

    const handleMessage = async (message: ExtensionMessage) => {
      if (message.type === 'omni:adapter-status') return status();
      if (message.type === 'omni:conversation-snapshot' && adapter) return adapter.getLatestTurn();
      if (message.type === 'omni:browser-snapshot') {
        const payload = message.payload as ExtensionMessageMap['omni:browser-snapshot'] | undefined;
        return pageController.snapshot(payload);
      }
      if (message.type === 'omni:browser-click') {
        const payload = message.payload as ExtensionMessageMap['omni:browser-click'] | undefined;
        return pageController.click(payload ?? {});
      }
      if (message.type === 'omni:browser-type') {
        const payload = message.payload as ExtensionMessageMap['omni:browser-type'] | undefined;
        if (!payload) throw new Error('browser.type payload is required');
        return pageController.type(payload);
      }
      if (message.type === 'omni:browser-scroll') {
        const payload = message.payload as ExtensionMessageMap['omni:browser-scroll'] | undefined;
        return pageController.scroll(payload ?? {});
      }
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

    const sendUpdate = (payload: ExtensionMessageMap['omni:response-update']) => {
      void browser.runtime.sendMessage<ExtensionMessage<'omni:response-update'>>({
        type: 'omni:response-update',
        payload,
      });
    };
    const stopMessages = adapter?.observeMessages(({ id, role, text }) => {
      if (role !== 'user') return;
      sendUpdate({ provider: providerFromAdapter(adapter) ?? 'kimi', role, text, messageId: id, conversationId: adapter.getConversationId(), pageSessionId, state: 'settled' });
    });
    const stopResponses = adapter?.observeResponse(({ id, text, conversationId }) => {
      sendUpdate({ provider: providerFromAdapter(adapter) ?? 'kimi', role: 'assistant', text, messageId: id, conversationId, pageSessionId, state: 'settled' });
    });

    ctx.onInvalidated(() => {
      browser.runtime.onMessage.removeListener(handleMessage);
      stopMessages?.();
      stopResponses?.();
      disposeBridge();
    });

    if (adapter) console.info(`[OmniAgent] ${adapter.id} adapter active`);
  },
});
