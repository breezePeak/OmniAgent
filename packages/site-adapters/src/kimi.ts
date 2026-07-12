import { DomSiteAdapter } from './dom-adapter.js';

/**
 * Placeholder for the next verified provider. It is intentionally not registered
 * by the content script until its selectors are validated against a live Kimi page.
 */
export const kimiAdapter = new DomSiteAdapter({
  id: 'kimi',
  hosts: ['kimi.com', 'www.kimi.com', 'kimi.moonshot.cn'],
  inputSelectors: ['textarea[placeholder]', 'textarea', '[contenteditable="true"][role="textbox"]'],
  submitSelectors: ['button[type="submit"]', 'button[aria-label*="发送"]', 'button[aria-label*="Send"]'],
  messageSelectors: ['[data-message-author-role]'],
  responseSelectors: ['[data-message-author-role="assistant"]', '.markdown'],
});
