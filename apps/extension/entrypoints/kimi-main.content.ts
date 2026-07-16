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
      rewriteProtobufPrompt: true,
      // File parsing and durable writes complete before Kimi sends the prompt.
      // Large PDFs/DOCX files can legitimately take longer than ten seconds.
      timeoutMs: 120_000,
    });
  },
});
