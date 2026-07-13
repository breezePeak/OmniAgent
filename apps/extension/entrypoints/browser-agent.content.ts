import { BrowserPageController } from '@omni-agent/browser-agent';
import type { ExtensionMessage, ExtensionMessageMap } from '@omni-agent/shared';

const controller = new BrowserPageController();

export default defineContentScript({
  matches: ['*://*/*'],
  runAt: 'document_idle',
  main(ctx) {
    const handleMessage = async (message: ExtensionMessage) => {
      if (!message || typeof message !== 'object' || !('type' in message)) return undefined;
      if (message.type === 'omni:browser-snapshot') {
        const payload = message.payload as ExtensionMessageMap['omni:browser-snapshot'] | undefined;
        return controller.snapshot(payload);
      }
      if (message.type === 'omni:browser-click') {
        const payload = message.payload as ExtensionMessageMap['omni:browser-click'] | undefined;
        return controller.click(payload ?? {});
      }
      if (message.type === 'omni:browser-type') {
        const payload = message.payload as ExtensionMessageMap['omni:browser-type'] | undefined;
        if (!payload) throw new Error('browser.type payload is required');
        return controller.type(payload);
      }
      if (message.type === 'omni:browser-scroll') {
        const payload = message.payload as ExtensionMessageMap['omni:browser-scroll'] | undefined;
        return controller.scroll(payload ?? {});
      }
      return undefined;
    };

    browser.runtime.onMessage.addListener(handleMessage);
    ctx.onInvalidated(() => {
      browser.runtime.onMessage.removeListener(handleMessage);
    });
  },
});
