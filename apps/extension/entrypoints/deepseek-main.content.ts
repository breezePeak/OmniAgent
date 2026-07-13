import {
  applyDeepSeekPrompt,
  extractDeepSeekPrompt,
  installPromptInjector,
  isDeepSeekChatPath,
} from '../src/main-world/prompt-injector';

export default defineContentScript({
  matches: ['*://chat.deepseek.com/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    installPromptInjector({
      provider: 'deepseek',
      isChatRequest: (pathname) => isDeepSeekChatPath(pathname),
      extractPrompt: extractDeepSeekPrompt,
      applyPrompt: applyDeepSeekPrompt,
    });
  },
});
