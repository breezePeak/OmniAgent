export type ProviderId = 'deepseek' | 'kimi';

export interface PromptInjectorOptions {
  provider: ProviderId;
  isChatRequest: (pathname: string, url: string) => boolean;
  extractPrompt: (body: Record<string, unknown>) => string | null;
  applyPrompt: (body: Record<string, unknown>, prompt: string) => Record<string, unknown> | null;
  alreadyAugmented?: (prompt: string) => boolean;
  timeoutMs?: number;
}

const MAIN_WORLD_SOURCE = 'omniagent-main-world';
const CONTENT_SOURCE = 'omniagent-content';
const BRIDGE_REQUEST = 'OMNIAGENT_BRIDGE_REQUEST';
const BRIDGE_INIT = 'OMNIAGENT_BRIDGE_INIT';
const BRIDGE_READY = 'OMNIAGENT_BRIDGE_READY';

type PendingAugmentation = {
  resolve: (prompt: string) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export function installPromptInjector(options: PromptInjectorOptions): void {
  const timeoutMs = options.timeoutMs ?? 2_000;
  const alreadyAugmented = options.alreadyAugmented
    ?? ((prompt: string) => prompt.includes('<omniagent-memory>') || prompt.includes('<omniagent-skill>'));

  let contentPort: MessagePort | null = null;
  const pending = new Map<string, PendingAugmentation>();
  let bridgeTimer: ReturnType<typeof setInterval> | null = null;
  let bridgeAttempts = 0;

  document.documentElement.setAttribute('data-omniagent-main-world', 'ready');
  document.documentElement.setAttribute('data-omniagent-provider', options.provider);

  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return;
    if (event.data?.source !== CONTENT_SOURCE || event.data?.type !== BRIDGE_INIT || contentPort) return;
    const [port] = event.ports;
    if (!port) return;
    contentPort = port;
    contentPort.onmessage = (portEvent) => handleContentMessage(portEvent.data);
    contentPort.start();
    contentPort.postMessage({ source: MAIN_WORLD_SOURCE, type: BRIDGE_READY });
  });

  bridgeTimer = setInterval(() => {
    if (contentPort || bridgeAttempts >= 100) {
      clearBridgeTimer();
      return;
    }
    bridgeAttempts += 1;
    window.postMessage({ source: MAIN_WORLD_SOURCE, type: BRIDGE_REQUEST }, window.location.origin);
  }, 50);

  const originalFetch = window.fetch;
  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = requestUrl(input);
    if (!matchesChat(url) || typeof init?.body !== 'string') return originalFetch.call(this, input, init);
    const augmentedBody = await augmentBody(init.body);
    return originalFetch.call(this, input, augmentedBody ? { ...init, body: augmentedBody } : init);
  };

  const requestUrls = new WeakMap<XMLHttpRequest, string>();
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (
    method: string,
    url: string | URL,
    async: boolean = true,
    username?: string | null,
    password?: string | null,
  ) {
    requestUrls.set(this, typeof url === 'string' ? url : url.href);
    return originalOpen.call(this, method, url, async, username ?? null, password ?? null);
  };

  XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null): void {
    const url = requestUrls.get(this);
    if (!url || !matchesChat(url) || typeof body !== 'string') {
      originalSend.call(this, body);
      return;
    }
    void augmentBody(body).then((augmentedBody) => {
      originalSend.call(this, augmentedBody ?? body);
    }).catch(() => {
      originalSend.call(this, body);
    });
  };

  function clearBridgeTimer(): void {
    if (!bridgeTimer) return;
    clearInterval(bridgeTimer);
    bridgeTimer = null;
  }

  function handleContentMessage(data: { source?: string; type?: string; id?: string; prompt?: string }): void {
    if (data?.source === CONTENT_SOURCE && data.type === BRIDGE_READY) {
      clearBridgeTimer();
      reportDiagnostic('bridge-ready', `${options.provider} 主世界脚本已连接扩展`);
      return;
    }
    if (data?.source !== CONTENT_SOURCE || data.type !== 'OMNIAGENT_AUGMENT_PROMPT_RESULT' || !data.id) return;
    const request = pending.get(data.id);
    if (!request) return;
    pending.delete(data.id);
    clearTimeout(request.timeout);
    request.resolve(typeof data.prompt === 'string' ? data.prompt : '');
  }

  function matchesChat(url: string): boolean {
    try {
      const parsed = new URL(url, window.location.origin);
      return options.isChatRequest(parsed.pathname, parsed.href);
    } catch {
      return false;
    }
  }

  async function augmentBody(body: string): Promise<string | null> {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(body) as Record<string, unknown>;
    } catch {
      return null;
    }
    const originalPrompt = options.extractPrompt(parsed);
    if (!originalPrompt || alreadyAugmented(originalPrompt)) return null;

    reportDiagnostic('request-observed', `已捕获 ${options.provider} 对话请求`);
    const prompt = await requestAugmentedPrompt(originalPrompt);
    if (!prompt || prompt === originalPrompt) {
      reportDiagnostic('request-unchanged', '没有匹配到相关记忆/技能或检索未返回');
      return null;
    }
    const next = options.applyPrompt(parsed, prompt);
    if (!next) return null;
    reportDiagnostic('request-augmented', '已将长期记忆/技能写入请求');
    return JSON.stringify(next);
  }

  function requestAugmentedPrompt(prompt: string): Promise<string> {
    if (!contentPort) return Promise.resolve(prompt);
    const id = crypto.randomUUID();
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        resolve(prompt);
      }, timeoutMs);
      pending.set(id, { resolve, timeout });
      contentPort?.postMessage({
        source: MAIN_WORLD_SOURCE,
        type: 'OMNIAGENT_AUGMENT_PROMPT',
        id,
        prompt,
        provider: options.provider,
      });
    });
  }

  function reportDiagnostic(stage: string, detail: string): void {
    contentPort?.postMessage({ source: MAIN_WORLD_SOURCE, type: 'OMNIAGENT_DIAGNOSTIC', stage, detail });
  }
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

export function extractDeepSeekPrompt(body: Record<string, unknown>): string | null {
  return typeof body.prompt === 'string' ? body.prompt : null;
}

export function applyDeepSeekPrompt(body: Record<string, unknown>, prompt: string): Record<string, unknown> {
  return { ...body, prompt };
}

export function extractKimiPrompt(body: Record<string, unknown>): string | null {
  if (typeof body.prompt === 'string') return body.prompt;
  if (typeof body.query === 'string') return body.query;
  if (typeof body.input === 'string') return body.input;
  if (typeof body.content === 'string') return body.content;
  if (typeof body.message === 'string') return body.message;

  const messages = body.messages;
  if (Array.isArray(messages)) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const item = messages[index] as Record<string, unknown> | undefined;
      if (!item || (item.role !== 'user' && item.role !== 'human')) continue;
      if (typeof item.content === 'string') return item.content;
      if (Array.isArray(item.content)) {
        const text = item.content
          .map((part) => {
            if (typeof part === 'string') return part;
            if (part && typeof part === 'object' && typeof (part as { text?: string }).text === 'string') {
              return (part as { text: string }).text;
            }
            return '';
          })
          .filter(Boolean)
          .join('\n');
        if (text) return text;
      }
    }
  }
  return null;
}

export function applyKimiPrompt(body: Record<string, unknown>, prompt: string): Record<string, unknown> | null {
  if (typeof body.prompt === 'string') return { ...body, prompt };
  if (typeof body.query === 'string') return { ...body, query: prompt };
  if (typeof body.input === 'string') return { ...body, input: prompt };
  if (typeof body.content === 'string') return { ...body, content: prompt };
  if (typeof body.message === 'string') return { ...body, message: prompt };

  if (Array.isArray(body.messages)) {
    const messages = body.messages.map((item) => {
      if (!item || typeof item !== 'object') return item;
      return { ...(item as Record<string, unknown>) };
    });
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const item = messages[index] as Record<string, unknown> | undefined;
      if (!item || (item.role !== 'user' && item.role !== 'human')) continue;
      if (typeof item.content === 'string') {
        item.content = prompt;
        return { ...body, messages };
      }
      if (Array.isArray(item.content)) {
        item.content = [{ type: 'text', text: prompt }];
        return { ...body, messages };
      }
    }
  }
  return null;
}

export function isDeepSeekChatPath(pathname: string): boolean {
  return pathname === '/api/v0/chat/completion' || pathname === '/api/v0/chat/regenerate';
}

export function isKimiChatPath(pathname: string, url: string): boolean {
  const lower = `${pathname} ${url}`.toLowerCase();
  return (
    lower.includes('/chat') ||
    lower.includes('/completion') ||
    lower.includes('/conversation') ||
    lower.includes('/stream') ||
    lower.includes('/api/chat') ||
    lower.includes('/v1/chat')
  ) && !lower.includes('/static') && !lower.includes('.js') && !lower.includes('.css');
}
