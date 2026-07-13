import {
  applyKimiPrompt,
  extractKimiPrompt,
  installPromptInjector,
  isKimiChatPath,
} from '../src/main-world/prompt-injector';

export default defineContentScript({
  matches: [
    '*://kimi.com/*',
    '*://www.kimi.com/*',
    '*://kimi.moonshot.cn/*',
    '*://www.kimi.moonshot.cn/*',
  ],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    installPromptInjector({
      provider: 'kimi',
      isChatRequest: isKimiChatPath,
      extractPrompt: extractKimiPrompt,
      applyPrompt: applyKimiPrompt,
    });
  },
});
