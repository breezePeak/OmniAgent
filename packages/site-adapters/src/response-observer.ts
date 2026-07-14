import type { ModelResponse, ObservedMessage } from './index.js';

type Timer = ReturnType<typeof setTimeout>;

export interface ResponseObserverOptions {
  /** Time without an assistant DOM update before the response is considered complete. */
  settleDelayMs?: number;
  getConversationId(): string | null;
  now?(): number;
}

/**
 * Converts streaming DOM mutations into one settled model reply per message id.
 * The observer is deliberately provider-neutral: adapters only supply messages.
 */
export class ResponseObserver {
  private readonly settleDelayMs: number;
  private readonly now: () => number;
  private readonly pending = new Map<string, { text: string; timer: Timer }>();

  constructor(
    private readonly callback: (response: ModelResponse) => void,
    private readonly options: ResponseObserverOptions,
  ) {
    this.settleDelayMs = Math.max(0, options.settleDelayMs ?? 900);
    this.now = options.now ?? (() => Date.now());
  }

  observe(message: ObservedMessage): void {
    if (message.role !== 'assistant' || !message.text.trim()) return;
    const existing = this.pending.get(message.id);
    if (existing) clearTimeout(existing.timer);
    const text = message.text.trim();
    const timer = setTimeout(() => {
      const pending = this.pending.get(message.id);
      if (!pending || pending.text !== text) return;
      this.pending.delete(message.id);
      this.callback({
        id: message.id,
        text,
        conversationId: this.options.getConversationId(),
        receivedAt: this.now(),
      });
    }, this.settleDelayMs);
    this.pending.set(message.id, { text, timer });
  }

  dispose(): void {
    for (const { timer } of this.pending.values()) clearTimeout(timer);
    this.pending.clear();
  }
}
