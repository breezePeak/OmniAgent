import type { ExtensionMessage, SupportedProvider } from '@omni-agent/shared';

const MAIN_WORLD_SOURCE = 'omniagent-main-world';
const CONTENT_SOURCE = 'omniagent-content';
const BRIDGE_REQUEST = 'OMNIAGENT_BRIDGE_REQUEST';
const BRIDGE_INIT = 'OMNIAGENT_BRIDGE_INIT';

type MainWorldRequest = {
  source?: string;
  type?: string;
  id?: string;
  prompt?: string;
  provider?: SupportedProvider;
  stage?: string;
  detail?: string;
  count?: number;
};

export function installMainWorldBridge(defaultProvider: SupportedProvider): () => void {
  let mainWorldPort: MessagePort | null = null;

  const onWindowMessage = (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return;
    if (event.data?.source !== MAIN_WORLD_SOURCE || event.data?.type !== BRIDGE_REQUEST || mainWorldPort) return;
    connectMainWorldPort();
  };

  window.addEventListener('message', onWindowMessage);

  window.setTimeout(() => {
    if (document.documentElement.getAttribute('data-omniagent-main-world') !== 'ready') return;
    void browser.runtime.sendMessage({
      type: 'omni:memory-diagnostic',
      payload: {
        stage: 'main-world-loaded',
        detail: `${defaultProvider} 主世界脚本已执行，正在等待桥接`,
        count: 0,
      },
    } as unknown as ExtensionMessage);
  }, 200);

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
      const provider = data.provider === 'kimi' || data.provider === 'deepseek' ? data.provider : defaultProvider;
      const result = await browser.runtime.sendMessage<ExtensionMessage<'omni:augment-prompt'>>({
        type: 'omni:augment-prompt',
        payload: { provider, prompt },
      }) as { prompt?: string; memoryCount?: number; skillCount?: number } | undefined;
      mainWorldPort?.postMessage({
        source: CONTENT_SOURCE,
        type: 'OMNIAGENT_AUGMENT_PROMPT_RESULT',
        id: data.id,
        prompt: result?.prompt ?? prompt,
        memoryCount: result?.memoryCount ?? 0,
        skillCount: result?.skillCount ?? 0,
      });
      await browser.runtime.sendMessage({
        type: 'omni:memory-diagnostic',
        payload: {
          stage: 'memory-retrieved',
          detail: `${provider} 扩展已完成记忆/技能检索`,
          count: (result?.memoryCount ?? 0) + (result?.skillCount ?? 0),
        },
      } as unknown as ExtensionMessage);
    } catch (error) {
      console.warn('[OmniAgent] memory augmentation unavailable', error);
      mainWorldPort?.postMessage({
        source: CONTENT_SOURCE,
        type: 'OMNIAGENT_AUGMENT_PROMPT_RESULT',
        id: data.id,
        prompt: data.prompt ?? '',
        memoryCount: 0,
        skillCount: 0,
      });
      await browser.runtime.sendMessage({
        type: 'omni:memory-diagnostic',
        payload: {
          stage: 'augmentation-error',
          detail: error instanceof Error ? error.message : String(error),
          count: 0,
        },
      } as unknown as ExtensionMessage);
    }
  }

  return () => {
    window.removeEventListener('message', onWindowMessage);
    mainWorldPort?.close();
    mainWorldPort = null;
  };
}
