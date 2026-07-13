import { DomSiteAdapter } from './dom-adapter.js';

/**
 * Kimi (Moonshot) adapter.
 * Selectors intentionally cover both kimi.com and kimi.moonshot.cn layouts.
 */
export const kimiAdapter = new DomSiteAdapter({
  id: 'kimi',
  hosts: [
    'kimi.com',
    'www.kimi.com',
    'kimi.moonshot.cn',
    'www.kimi.moonshot.cn',
  ],
  inputSelectors: [
    'div.chat-input textarea',
    'div[class*="chat-input"] textarea',
    'textarea[placeholder*="输入"]',
    'textarea[placeholder*="给 Kimi"]',
    'textarea[placeholder*="Ask"]',
    'textarea',
    '[contenteditable="true"][role="textbox"]',
    '[contenteditable="true"]',
  ],
  submitSelectors: [
    'button.send-button',
    'button[class*="send"]',
    'div.chat-input button[type="submit"]',
    'button[type="submit"]',
    'button[aria-label*="发送"]',
    'button[aria-label*="Send"]',
    'button[aria-label*="submit"]',
  ],
  messageSelectors: [
    '[data-testid*="message"]',
    '[class*="chat-message"]',
    '[class*="message-item"]',
    '[data-message-author-role]',
    'div[class*="segment"]',
  ],
  responseSelectors: [
    '[data-message-author-role="assistant"]',
    '[class*="assistant"]',
    '[class*="markdown"]',
    '.markdown',
    'article',
  ],
  getConversationId(url) {
    const candidates = [
      url.pathname.match(/\/chat\/([^/?#]+)/),
      url.pathname.match(/\/c\/([^/?#]+)/),
      url.pathname.match(/\/s\/([^/?#]+)/),
    ];
    for (const match of candidates) {
      if (!match?.[1] || match[1] === 'new') continue;
      try {
        return decodeURIComponent(match[1]);
      } catch {
        return match[1];
      }
    }
    return url.searchParams.get('chat_id') || url.searchParams.get('id');
  },
});
