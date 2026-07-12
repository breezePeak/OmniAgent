import { defineStore } from 'pinia';
import type { AdapterStatus, ConversationTurn, ExtensionMessage, ExtensionMessageMap } from '@omni-agent/shared';
import type { ConversationRecord, MessageRecord } from '@omni-agent/storage';
import type { MemoryRecord } from '@omni-agent/storage';

interface MemoryInjectionDiagnostic {
  stage: string;
  detail: string;
  count: number;
  at: number;
}

const unsupported: AdapterStatus = {
  provider: null,
  url: '',
  conversationId: null,
};

export const useExtensionStore = defineStore('extension', {
  state: () => ({
    ready: true,
    adapter: unsupported,
    refreshError: '',
    prompt: '',
    inserting: false,
    insertError: '',
    latestResponse: '',
    latestQuestion: '',
    conversationError: '',
    savedConversations: [] as ConversationRecord[],
    selectedConversationId: '',
    savedMessages: [] as MessageRecord[],
    storageLoading: false,
    memories: [] as MemoryRecord[],
    memoryDraft: '',
    memoryLoading: false,
    memoryError: '',
    memoryDiagnostic: null as MemoryInjectionDiagnostic | null,
    listening: false,
  }),
  actions: {
    startResponseListener() {
      if (this.listening) return;
      this.listening = true;
      browser.runtime.onMessage.addListener((message: ExtensionMessage) => {
        if (message.type !== 'omni:response-update') return undefined;
        const payload = message.payload as ExtensionMessageMap['omni:response-update'] | undefined;
        if (payload?.role === 'user') this.latestQuestion = payload.text;
        if (payload?.role === 'assistant') this.latestResponse = payload.text;
        return undefined;
      });
    },
    async refreshAdapter() {
      try {
        const response = await browser.runtime.sendMessage<ExtensionMessage<'omni:adapter-status'>, AdapterStatus | undefined>({
          type: 'omni:adapter-status',
        });
        if (!response) throw new Error('Background 未返回识别结果');
        this.adapter = response;
        this.refreshError = '';
        this.conversationError = '';
        if (response.provider) {
          try {
            await this.refreshConversation();
          } catch (error) {
            this.conversationError = error instanceof Error ? error.message : '读取当前问答失败';
          }
        }
      } catch (error) {
        this.adapter = unsupported;
        this.refreshError = error instanceof Error ? error.message : '无法连接当前页面';
      }
    },
    async refreshConversation() {
      const turn = await browser.runtime.sendMessage<ExtensionMessage<'omni:conversation-snapshot'>, ConversationTurn | null | undefined>({
        type: 'omni:conversation-snapshot',
      });
      if (!turn) throw new Error('Content Script 未返回问答数据，请刷新 DeepSeek 页面');
      this.latestQuestion = turn.question;
      this.latestResponse = turn.response;
      this.conversationError = '';
    },
    async insertPrompt() {
      const message = this.prompt.trim();
      if (!message || !this.adapter.provider) return;
      this.inserting = true;
      this.insertError = '';
      try {
        await browser.runtime.sendMessage<ExtensionMessage<'omni:insert-prompt'>, AdapterStatus>({
          type: 'omni:insert-prompt',
          payload: { message },
        });
      } catch (error) {
        this.insertError = error instanceof Error ? error.message : '写入 DeepSeek 输入框失败';
      } finally {
        this.inserting = false;
      }
    },
    async refreshSavedConversations() {
      this.storageLoading = true;
      try {
        this.savedConversations = await browser.runtime.sendMessage<
          ExtensionMessage<'omni:list-conversations'>,
          ConversationRecord[]
        >({ type: 'omni:list-conversations' });
        if (!this.savedConversations.some((conversation) => conversation.id === this.selectedConversationId)) {
          this.selectedConversationId = this.savedConversations[0]?.id ?? '';
        }
        if (this.selectedConversationId) await this.selectConversation(this.selectedConversationId);
        else this.savedMessages = [];
      } finally {
        this.storageLoading = false;
      }
    },
    async selectConversation(conversationId: string) {
      this.selectedConversationId = conversationId;
      this.savedMessages = conversationId
        ? await browser.runtime.sendMessage<ExtensionMessage<'omni:list-messages'>, MessageRecord[]>({
          type: 'omni:list-messages',
          payload: { conversationId },
        })
        : [];
    },
    async refreshMemories() {
      this.memoryLoading = true;
      try {
        this.memories = await browser.runtime.sendMessage<ExtensionMessage<'omni:list-memories'>, MemoryRecord[]>({
          type: 'omni:list-memories',
        });
        this.memoryError = '';
      } catch (error) {
        this.memoryError = error instanceof Error ? error.message : '读取记忆失败';
      } finally {
        this.memoryLoading = false;
      }
    },
    async refreshMemoryDiagnostic() {
      this.memoryDiagnostic = await browser.runtime.sendMessage(
        { type: 'omni:get-memory-diagnostic' } as unknown as ExtensionMessage,
      ) as MemoryInjectionDiagnostic | null;
    },
    async saveMemory() {
      const content = this.memoryDraft.trim();
      if (!content) return;
      this.memoryLoading = true;
      try {
        await browser.runtime.sendMessage<ExtensionMessage<'omni:save-memory'>, MemoryRecord>({
          type: 'omni:save-memory',
          payload: { content },
        });
        this.memoryDraft = '';
        await this.refreshMemories();
      } catch (error) {
        this.memoryError = error instanceof Error ? error.message : '保存记忆失败';
      } finally {
        this.memoryLoading = false;
      }
    },
  },
});
