<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useExtensionStore } from '../../src/stores/extension';

const extension = useExtensionStore();
const status = computed(() => (extension.ready ? '基础工程已就绪' : '正在初始化'));
const provider = computed(() => extension.adapter.provider?.toUpperCase() ?? '未识别的平台');
const detectedHost = computed(() => {
  if (!extension.adapter.url) return '无法获取当前标签页';
  try {
    return new URL(extension.adapter.url).host;
  } catch {
    return extension.adapter.url;
  }
});
const adapterDescription = computed(() => {
  if (extension.refreshError) return `识别失败：${extension.refreshError}`;
  if (extension.adapter.url.startsWith('chrome://') || extension.adapter.url.startsWith('edge://')) {
    return 'Chrome/Edge 内部页面不能注入脚本，请切换到 DeepSeek 网页后再识别';
  }
  return extension.adapter.provider
    ? '已连接当前网页的 Site Adapter'
    : '请打开 DeepSeek 网页以启用适配器';
});

onMounted(() => {
  extension.startResponseListener();
  extension.refreshAdapter();
  extension.refreshSavedConversations();
  extension.refreshMemories();
  extension.refreshMemoryDiagnostic();
});
</script>

<template>
  <main class="panel-shell">
    <section class="hero">
      <p class="eyebrow">OMNIAGENT</p>
      <h1>One memory.<br />Every AI.</h1>
      <p class="description">{{ status }}</p>
    </section>
    <el-alert
      :title="provider"
      :description="adapterDescription"
      :type="extension.refreshError ? 'error' : extension.adapter.provider ? 'success' : 'info'"
      :closable="false"
      show-icon
    />
    <p class="detected-host">当前识别页：{{ detectedHost }}</p>
    <el-button class="refresh" plain @click="extension.refreshAdapter">重新识别</el-button>

    <section class="capability-card">
      <h2>填入 DeepSeek</h2>
      <el-input
        v-model="extension.prompt"
        type="textarea"
        :rows="4"
        placeholder="输入要填入 DeepSeek 的内容"
        :disabled="!extension.adapter.provider"
      />
      <el-button
        class="primary-action"
        type="primary"
        :loading="extension.inserting"
        :disabled="!extension.adapter.provider || !extension.prompt.trim()"
        @click="extension.insertPrompt"
      >
        填入输入框
      </el-button>
      <el-alert
        v-if="extension.insertError"
        class="action-error"
        :title="extension.insertError"
        type="error"
        :closable="false"
      />
    </section>

    <section class="capability-card">
      <h2>当前问答</h2>
      <el-alert
        v-if="extension.conversationError"
        class="action-error"
        :title="extension.conversationError"
        type="warning"
        :closable="false"
      />
      <div class="message-block">
        <span class="message-role">问题</span>
        <p v-if="extension.latestQuestion" class="response-text">{{ extension.latestQuestion }}</p>
        <p v-else class="empty-text">尚未读取到问题</p>
      </div>
      <div class="message-block">
        <span class="message-role">回复</span>
      <p v-if="extension.latestResponse" class="response-text">{{ extension.latestResponse }}</p>
        <p v-else class="empty-text">等待 DeepSeek 回复</p>
      </div>
    </section>

    <section class="capability-card">
      <div class="section-heading">
        <h2>本地会话</h2>
        <el-button text :loading="extension.storageLoading" @click="extension.refreshSavedConversations">刷新</el-button>
      </div>
      <el-select
        v-model="extension.selectedConversationId"
        class="conversation-select"
        placeholder="尚未保存会话"
        :disabled="!extension.savedConversations.length"
        @change="extension.selectConversation"
      >
        <el-option
          v-for="conversation in extension.savedConversations"
          :key="conversation.id"
          :label="conversation.title || conversation.externalId"
          :value="conversation.id"
        />
      </el-select>
      <div v-if="extension.savedMessages.length" class="message-history">
        <article v-for="message in extension.savedMessages" :key="message.id" class="stored-message" :data-role="message.role">
          <span class="message-role">{{ message.role }}</span>
          <p>{{ message.content }}</p>
        </article>
      </div>
      <p v-else class="empty-text">当前会话尚未保存消息</p>
    </section>

    <section class="capability-card">
      <div class="section-heading">
        <h2>长期记忆</h2>
        <el-button text :loading="extension.memoryLoading" @click="extension.refreshMemories(); extension.refreshMemoryDiagnostic()">刷新</el-button>
      </div>
      <p v-if="extension.memoryDiagnostic" class="detected-host">
        注入诊断：{{ extension.memoryDiagnostic.detail }}
        <template v-if="extension.memoryDiagnostic.stage === 'memory-retrieved'">（{{ extension.memoryDiagnostic.count }} 条）</template>
      </p>
      <el-input
        v-model="extension.memoryDraft"
        class="memory-input"
        type="textarea"
        :rows="3"
        placeholder="例如：我偏好简洁的中文回复"
      />
      <el-button class="primary-action" type="primary" :disabled="!extension.memoryDraft.trim()" @click="extension.saveMemory">
        保存记忆
      </el-button>
      <el-alert v-if="extension.memoryError" class="action-error" :title="extension.memoryError" type="error" :closable="false" />
      <ul v-if="extension.memories.length" class="memory-list">
        <li v-for="memory in extension.memories" :key="memory.id">
          <span class="message-role">{{ memory.type }}</span>
          <p>{{ memory.summary }}</p>
        </li>
      </ul>
      <p v-else class="empty-text">暂无长期记忆</p>
    </section>
  </main>
</template>
