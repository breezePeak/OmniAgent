<script setup lang="ts">
import { computed, onMounted } from 'vue';
import type { ToolResult } from '@omni-agent/tools';
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
    return 'Chrome/Edge 内部页面不能注入脚本，请切换到 DeepSeek 或 Kimi 网页后再识别';
  }
  return extension.adapter.provider
    ? '已连接当前网页的 Site Adapter'
    : '请打开 DeepSeek 或 Kimi 网页以启用适配器';
});
const selectedToolDescription = computed(
  () => extension.tools.find((tool) => tool.name === extension.selectedToolName)?.description ?? '',
);

function formatToolResult(result: ToolResult): string {
  if (!result.ok) return result.error || 'unknown error';
  try {
    return JSON.stringify(result.result, null, 2);
  } catch {
    return String(result.result);
  }
}

const selectedAgentTask = computed(
  () => extension.agentTasks.find((task) => task.id === extension.selectedAgentTaskId) ?? null,
);

onMounted(() => {
  extension.startResponseListener();
  extension.refreshAdapter();
  extension.refreshSavedConversations();
  extension.refreshMemories();
  extension.refreshMemoryDiagnostic();
  extension.refreshSkills();
  extension.refreshTools();
  extension.refreshMcpServers();
  extension.refreshAgentTasks();
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
      <h2>填入当前 AI</h2>
      <el-input
        v-model="extension.prompt"
        type="textarea"
        :rows="4"
        placeholder="输入要填入当前网页输入框的内容"
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
        <p v-else class="empty-text">等待 AI 回复</p>
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

    <section class="capability-card">
      <div class="section-heading">
        <h2>Skill 技能</h2>
        <el-button text :loading="extension.skillLoading" @click="extension.refreshSkills">刷新</el-button>
      </div>
      <el-input v-model="extension.skillDraftName" class="skill-input" placeholder="Skill 名称，例如 research-agent" />
      <el-input v-model="extension.skillDraftDescription" class="skill-input" placeholder="简短描述" />
      <el-input
        v-model="extension.skillDraftTriggers"
        class="skill-input"
        placeholder="触发词，逗号分隔，例如 调研,研究"
      />
      <el-input
        v-model="extension.skillDraftPrompt"
        class="skill-input"
        type="textarea"
        :rows="3"
        placeholder="Skill Prompt / 工作指引"
      />
      <el-button
        class="primary-action"
        type="primary"
        :loading="extension.skillLoading"
        :disabled="!extension.skillDraftName.trim() || !extension.skillDraftPrompt.trim()"
        @click="extension.registerSkill"
      >
        注册 Skill
      </el-button>
      <el-alert v-if="extension.skillError" class="action-error" :title="extension.skillError" type="error" :closable="false" />
      <ul v-if="extension.skills.length" class="skill-list">
        <li v-for="skill in extension.skills" :key="skill.id">
          <div class="skill-item-header">
            <div>
              <span class="message-role">{{ skill.source }} · {{ skill.enabled ? 'enabled' : 'disabled' }}</span>
              <strong>{{ skill.manifest.name }}</strong>
            </div>
            <el-switch
              :model-value="skill.enabled"
              size="small"
              @change="(value: string | number | boolean) => extension.setSkillEnabled(skill.id, Boolean(value))"
            />
          </div>
          <p>{{ skill.manifest.description || skill.prompt }}</p>
          <p v-if="skill.manifest.triggers?.length" class="skill-triggers">触发：{{ skill.manifest.triggers.join(' / ') }}</p>
        </li>
      </ul>
      <p v-else class="empty-text">暂无 Skill</p>
    </section>

    <section class="capability-card">
      <div class="section-heading">
        <h2>Tool Runtime</h2>
        <el-button text :loading="extension.toolLoading" @click="extension.refreshTools">刷新</el-button>
      </div>
      <el-select
        :model-value="extension.selectedToolName"
        class="conversation-select"
        placeholder="选择工具"
        :disabled="!extension.tools.length"
        @change="extension.selectTool"
      >
        <el-option
          v-for="tool in extension.tools"
          :key="tool.name"
          :label="`${tool.name} · ${tool.source}`"
          :value="tool.name"
        />
      </el-select>
      <p v-if="selectedToolDescription" class="detected-host">{{ selectedToolDescription }}</p>
      <el-input
        v-model="extension.toolArgumentJson"
        class="skill-input"
        type="textarea"
        :rows="5"
        placeholder='工具参数 JSON，例如 {"query":"偏好"}'
      />
      <el-button
        class="primary-action"
        type="primary"
        :loading="extension.toolLoading"
        :disabled="!extension.selectedToolName"
        @click="extension.executeSelectedTool"
      >
        执行工具
      </el-button>
      <el-alert v-if="extension.toolError" class="action-error" :title="extension.toolError" type="error" :closable="false" />
      <div v-if="extension.lastToolResult" class="message-block">
        <span class="message-role">{{ extension.lastToolResult.ok ? 'result' : 'error' }} · {{ extension.lastToolResult.durationMs }}ms</span>
        <p class="response-text">{{ formatToolResult(extension.lastToolResult) }}</p>
      </div>
      <p v-else class="empty-text">尚未执行工具</p>
    </section>

    <section class="capability-card">
      <div class="section-heading">
        <h2>MCP</h2>
        <el-button text :loading="extension.mcpLoading" @click="extension.refreshMcpServers">刷新</el-button>
      </div>
      <el-alert v-if="extension.mcpError" class="action-error" :title="extension.mcpError" type="error" :closable="false" />
      <ul v-if="extension.mcpServers.length" class="skill-list">
        <li v-for="server in extension.mcpServers" :key="server.id">
          <span class="message-role">{{ server.kind }} · {{ server.enabled ? 'enabled' : 'disabled' }}</span>
          <strong>{{ server.name }}</strong>
          <p>{{ server.toolCount }} tools: {{ server.tools.join(', ') }}</p>
        </li>
      </ul>
      <p v-else class="empty-text">暂无 MCP Server</p>
    </section>

    <section class="capability-card">
      <div class="section-heading">
        <h2>Agent Runtime</h2>
        <el-button text :loading="extension.agentLoading" @click="extension.refreshAgentTasks">刷新</el-button>
      </div>
      <el-input
        v-model="extension.agentGoalDraft"
        class="skill-input"
        type="textarea"
        :rows="3"
        placeholder="例如：请记住：我喜欢简洁回复，并搜索记忆 简洁"
      />
      <el-button
        class="primary-action"
        type="primary"
        :loading="extension.agentLoading"
        :disabled="!extension.agentGoalDraft.trim()"
        @click="extension.createAndRunAgentTask"
      >
        创建并执行任务
      </el-button>
      <div class="agent-actions">
        <el-button :disabled="!extension.selectedAgentTaskId" :loading="extension.agentLoading" @click="extension.pauseSelectedAgentTask">
          暂停
        </el-button>
        <el-button :disabled="!extension.selectedAgentTaskId" :loading="extension.agentLoading" @click="extension.resumeSelectedAgentTask">
          恢复
        </el-button>
        <el-button
          type="danger"
          plain
          :disabled="!extension.selectedAgentTaskId"
          :loading="extension.agentLoading"
          @click="extension.deleteSelectedAgentTask"
        >
          删除
        </el-button>
      </div>
      <el-alert v-if="extension.agentError" class="action-error" :title="extension.agentError" type="error" :closable="false" />
      <el-select
        v-model="extension.selectedAgentTaskId"
        class="conversation-select"
        placeholder="尚未创建任务"
        :disabled="!extension.agentTasks.length"
      >
        <el-option
          v-for="task in extension.agentTasks"
          :key="task.id"
          :label="`${task.status} · ${task.goal}`"
          :value="task.id"
        />
      </el-select>
      <div v-if="selectedAgentTask" class="message-history">
        <p class="detected-host">状态：{{ selectedAgentTask.status }}</p>
        <p v-if="selectedAgentTask.result" class="response-text">结果：{{ selectedAgentTask.result }}</p>
        <p v-if="selectedAgentTask.error" class="response-text">错误：{{ selectedAgentTask.error }}</p>
        <article v-for="step in selectedAgentTask.steps" :key="step.id" class="stored-message">
          <span class="message-role">#{{ step.index }} {{ step.type }}</span>
          <p>{{ step.title }}</p>
          <p v-if="step.detail" class="skill-triggers">{{ step.detail }}</p>
        </article>
      </div>
      <p v-else class="empty-text">暂无 Agent 任务</p>
    </section>
  </main>
</template>
