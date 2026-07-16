import { isInternalProtocolMessage } from '@omni-agent/agent-protocol';
import type { MemorySaveBatchItem } from '@omni-agent/tools';

export interface ChatMemorySource {
  id: string;
  content: string;
}

export type ChatMemoryEvidenceValidation =
  | { ok: true; sourceMessageId: string; sourceQuote: string }
  | { ok: false; reason: string };

/**
 * Final service-side gate for model-extracted chat memory. Source validation is
 * authoritative; prompt wording is only guidance and is never trusted alone.
 */
export function validateChatMemoryEvidence(
  item: MemorySaveBatchItem,
  messages: ChatMemorySource[],
): ChatMemoryEvidenceValidation {
  if (!isDurableMemoryContent(item.content)) return { ok: false, reason: 'Content is not durable long-term memory' };
  if (item.content.length > 50_000) return { ok: false, reason: 'Content exceeds the per-item length limit' };
  if (!messages.length) return { ok: false, reason: 'Conversation source messages are unavailable' };
  for (const sourceMessageId of item.sourceMessageIds) {
    const message = messages.find((candidate) => candidate.id === sourceMessageId);
    if (!message) continue;
    const normalizedMessage = normalizeEvidenceText(message.content);
    const sourceQuote = item.sourceQuotes.find((quote) => {
      const normalizedQuote = normalizeEvidenceText(quote);
      return normalizedQuote.length > 0 && normalizedMessage.includes(normalizedQuote);
    });
    if (sourceQuote) return { ok: true, sourceMessageId, sourceQuote: sourceQuote.trim() };
  }
  return { ok: false, reason: 'No source quote matched the referenced conversation messages' };
}

export function normalizeEvidenceText(value: string): string {
  return value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

/** Rejects control-plane material before it can reach MemoryService. */
export function isDurableMemoryContent(content: string): boolean {
  const normalized = content.trim();
  if (!normalized || isInternalProtocolMessage(normalized)) return false;
  if (/<\/?omniagent-(?:action|tool-result|memory-context|memory-sources)>/iu.test(normalized)) return false;
  if (/^[\[{]\s*"(?:name|type|toolName|sourceMessageId)"\s*:/u.test(normalized)) return false;
  if (/^(?:已思考|思考过程|推理过程|分析过程|工具结果|执行结果|记忆处理完成|记忆保存失败|请(?:回复|确认)|待确认|等待用户确认)(?:\s|：|:|，|,|。|！|!|$)/u.test(normalized)) return false;
  if (/^(?:好的|收到|明白)[，,。！!\s]*(?:我会|将|已|现在)?(?:保存|记住|提交|处理|继续)/u.test(normalized)) return false;
  if (/(?:请根据这个工具结果继续回答用户|只输出一个\s*<omniagent-action>|Awaiting user confirmation)/iu.test(normalized)) return false;
  return !isMemoryControlPlaneText(normalized);
}

function isMemoryControlPlaneText(text: string): boolean {
  return /(?:记忆中心|长期记忆|候选记忆|待处理记忆|待确认).{0,64}(?:条|保存|确认|显示|看到|状态|页面|按钮)/u.test(text)
    || /(?:我在)?(?:记忆中心|页面).{0,64}(?:看到|显示).{0,20}(?:\d+|[一二三四五六七八九十]+).{0,4}条/u.test(text)
    || /(?:第[一二三四五六七八九十\d]+批).{0,80}(?:已提交|待确认|请确认)/u.test(text);
}
