import type { AdapterStatus, ExtensionMessage, ExtensionMessageMap } from '@omni-agent/shared';
import type { SiteAdapter } from '@omni-agent/site-adapters';

const pageCommandTypes = [
  'omni:adapter-status',
  'omni:conversation-snapshot',
  'omni:insert-prompt',
  'omni:send-message',
  'omni:render-tool-status',
] as const;

export type AdapterPageCommandType = typeof pageCommandTypes[number];

export type AdapterCommandResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export function isAdapterPageCommand(
  message: ExtensionMessage,
): message is ExtensionMessage<AdapterPageCommandType> {
  return pageCommandTypes.includes(message.type as AdapterPageCommandType);
}

export async function handleAdapterPageCommand(
  message: ExtensionMessage<AdapterPageCommandType>,
  adapter: SiteAdapter | null,
  status: () => AdapterStatus,
): Promise<AdapterCommandResult<unknown>> {
  return captureAdapterCommand(async () => {
    if (!adapter) throw new Error('当前页面没有可用的站点适配器');

    if (message.type === 'omni:adapter-status') return status();
    if (message.type === 'omni:conversation-snapshot') return adapter.getLatestTurn();
    if (message.type === 'omni:render-tool-status') {
      const payload = message.payload as ExtensionMessageMap['omni:render-tool-status'] | undefined;
      if (!payload?.messageId || !payload.text?.trim()) throw new Error('工具状态内容不完整');
      return adapter.renderToolStatus(payload.messageId, payload.text);
    }

    const payload = message.payload as ExtensionMessageMap['omni:insert-prompt'] | ExtensionMessageMap['omni:send-message'] | undefined;
    if (!payload?.message?.trim()) throw new Error('发送内容不能为空');
    if (message.type === 'omni:insert-prompt') await adapter.insertPrompt(payload.message);
    else await adapter.sendMessage(payload.message);
    return status();
  }, adapter);
}

export async function captureAdapterCommand<T>(
  operation: () => Promise<T> | T,
  adapter: Pick<SiteAdapter, 'id'> | null = null,
): Promise<AdapterCommandResult<T>> {
  try {
    return { ok: true, value: await operation() };
  } catch (error) {
    return { ok: false, error: describeAdapterCommandError(error, adapter?.id) };
  }
}

export function unwrapAdapterCommandResult<T>(response: unknown): T {
  if (!response || typeof response !== 'object' || !('ok' in response)) {
    throw new Error('页面适配器未返回执行结果，请刷新当前网页后重试');
  }
  const result = response as { ok?: unknown; value?: unknown; error?: unknown };
  if (result.ok !== true) {
    throw new Error(typeof result.error === 'string' && result.error.trim()
      ? result.error
      : '页面适配器执行失败，请刷新当前网页后重试');
  }
  return result.value as T;
}

function describeAdapterCommandError(error: unknown, adapterId?: string): string {
  const detail = error instanceof Error ? error.message : String(error);
  if (!adapterId) return detail || '页面操作失败';
  const provider = adapterId === 'kimi' ? 'Kimi' : adapterId === 'deepseek' ? 'DeepSeek' : '当前页面';
  if (/message input is not empty/iu.test(detail)) {
    return `${provider} 输入框中已有未发送内容，请先发送或清空现有草稿后重试`;
  }
  if (/message input was not found/iu.test(detail)) {
    return `${provider} 未找到消息输入框，请确认页面已登录并刷新后重试`;
  }
  if (/submit button was not found/iu.test(detail)) {
    return `${provider} 未找到可用的发送按钮，请刷新页面后重试`;
  }
  if (/message input rejected the inserted prompt/iu.test(detail)) {
    return `${provider} 页面没有接受写入内容，请保留当前草稿并刷新后重试`;
  }
  return `${provider} 操作失败：${detail || '未知错误'}`;
}
