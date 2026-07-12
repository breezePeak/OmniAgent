const MAIN_WORLD_SOURCE = 'omniagent-main-world';
const CONTENT_SOURCE = 'omniagent-content';
const BRIDGE_REQUEST = 'OMNIAGENT_BRIDGE_REQUEST';
const BRIDGE_INIT = 'OMNIAGENT_BRIDGE_INIT';
const BRIDGE_READY = 'OMNIAGENT_BRIDGE_READY';
const COMPLETION_PATHS = new Set(['/api/v0/chat/completion', '/api/v0/chat/regenerate']);
const AUGMENT_TIMEOUT_MS = 2_000;

type PendingAugmentation = {
  resolve: (prompt: string) => void;
  timeout: ReturnType<typeof setTimeout>;
};

let contentPort: MessagePort | null = null;
const pending = new Map<string, PendingAugmentation>();
let bridgeTimer: ReturnType<typeof setInterval> | null = null;
let bridgeReady = false;
let bridgeAttempts = 0;

export default defineContentScript({
  matches: ['*://chat.deepseek.com/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    document.documentElement.setAttribute('data-omniagent-main-world', 'ready');
    installBridge();
    installFetchHook();
    installXhrHook();
  },
});

function installBridge(): void {
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
}

function clearBridgeTimer(): void {
  if (!bridgeTimer) return;
  clearInterval(bridgeTimer);
  bridgeTimer = null;
}

function handleContentMessage(data: { source?: string; type?: string; id?: string; prompt?: string }): void {
  if (data?.source === CONTENT_SOURCE && data.type === BRIDGE_READY) {
    bridgeReady = true;
    clearBridgeTimer();
    reportDiagnostic('bridge-ready', '主世界脚本已连接扩展');
    return;
  }
  if (data?.source !== CONTENT_SOURCE || data.type !== 'OMNIAGENT_AUGMENT_PROMPT_RESULT' || !data.id) return;
  const request = pending.get(data.id);
  if (!request) return;
  pending.delete(data.id);
  clearTimeout(request.timeout);
  request.resolve(typeof data.prompt === 'string' ? data.prompt : '');
}

function installFetchHook(): void {
  const originalFetch = window.fetch;
  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = requestUrl(input);
    if (!isChatRequest(url) || typeof init?.body !== 'string') return originalFetch.call(this, input, init);

    const augmentedBody = await augmentBody(init.body);
    return originalFetch.call(this, input, augmentedBody ? { ...init, body: augmentedBody } : init);
  };
}

function installXhrHook(): void {
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
    if (!url || !isChatRequest(url) || typeof body !== 'string') {
      originalSend.call(this, body);
      return;
    }

    void augmentBody(body).then((augmentedBody) => {
      originalSend.call(this, augmentedBody ?? body);
    }).catch(() => {
      originalSend.call(this, body);
    });
  };
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function isChatRequest(url: string): boolean {
  try {
    return COMPLETION_PATHS.has(new URL(url, window.location.origin).pathname);
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
  if (typeof parsed.prompt !== 'string' || parsed.prompt.includes('<omniagent-memory>')) return null;

  reportDiagnostic('request-observed', '已捕获 DeepSeek 对话请求');
  const prompt = await requestAugmentedPrompt(parsed.prompt);
  if (!prompt || prompt === parsed.prompt) {
    reportDiagnostic('request-unchanged', '没有匹配到相关记忆或检索未返回');
    return null;
  }
  parsed.prompt = prompt;
  reportDiagnostic('request-augmented', '已将长期记忆写入请求');
  return JSON.stringify(parsed);
}

function requestAugmentedPrompt(prompt: string): Promise<string> {
  if (!contentPort) return Promise.resolve(prompt);
  const id = crypto.randomUUID();
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      resolve(prompt);
    }, AUGMENT_TIMEOUT_MS);
    pending.set(id, { resolve, timeout });
    contentPort?.postMessage({ source: MAIN_WORLD_SOURCE, type: 'OMNIAGENT_AUGMENT_PROMPT', id, prompt });
  });
}

function reportDiagnostic(stage: string, detail: string): void {
  contentPort?.postMessage({ source: MAIN_WORLD_SOURCE, type: 'OMNIAGENT_DIAGNOSTIC', stage, detail });
}
