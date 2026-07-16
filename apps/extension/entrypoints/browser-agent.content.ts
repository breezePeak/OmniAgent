import { BrowserPageController } from '@omni-agent/browser-agent';
import type { ExtensionMessage } from '@omni-agent/shared';
import { handleBrowserPageCommand, isBrowserPageCommand } from '../src/content/browser-command';

const controller = new BrowserPageController();

export default defineContentScript({
  matches: ['*://*/*'],
  excludeMatches: [
    '*://chat.deepseek.com/*',
    '*://kimi.com/*',
    '*://www.kimi.com/*',
    '*://kimi.moonshot.cn/*',
    '*://www.kimi.moonshot.cn/*',
  ],
  runAt: 'document_idle',
  main(ctx) {
    // Returning Promise<undefined> from an unrelated async listener can win
    // Chrome's response race and hide the real provider listener response.
    const handleMessage = (message: ExtensionMessage) => {
      if (!message || typeof message !== 'object' || !('type' in message)) return undefined;
      if (message.target !== 'page') return undefined;
      if (isBrowserPageCommand(message)) return handleBrowserPageCommand(message, controller);
      return undefined;
    };

    browser.runtime.onMessage.addListener(handleMessage);
    ctx.onInvalidated(() => {
      browser.runtime.onMessage.removeListener(handleMessage);
    });
  },
});
