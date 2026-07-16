<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import type { ToolResult } from '@omni-agent/tools';
import type { MemoryArtifactLocator } from '@omni-agent/storage';
import { useExtensionStore } from '../../src/stores/extension';

const extension = useExtensionStore();
const status = computed(() => (extension.ready ? '基础工程已就绪' : '正在初始化'));
const provider = computed(() => extension.adapter.provider?.toUpperCase() ?? '未识别的平台');
const adapterNotice = computed(() => {
  const explicitError = extension.insertError || extension.refreshError || extension.conversationError;
  if (explicitError) return explicitError;
  const health = extension.adapter.health;
  if (!extension.adapter.provider || !health) return '';
  const name = extension.adapter.provider === 'kimi' ? 'Kimi' : 'DeepSeek';
  if (!health.inputFound) return `${name} 未找到聊天输入框，请确认页面已登录并刷新后重试`;
  if (!health.submitFound) return `${name} 未找到发送按钮，请刷新页面后重试`;
  if (!health.submitEnabled) return `${name} 发送按钮当前不可用，请检查页面状态后重试`;
  return '';
});
const supportedProviders = [
  { id: 'deepseek', name: 'DeepSeek', host: 'chat.deepseek.com' },
  { id: 'kimi', name: 'Kimi', host: 'kimi.com' },
] as const;
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

function summarizeHistory(value: unknown): string {
  if (value == null) return 'ok';
  try {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    return text.length > 180 ? `${text.slice(0, 177)}...` : text;
  } catch {
    return String(value);
  }
}

const selectedAgentTask = computed(
  () => extension.agentTasks.find((task) => task.id === extension.selectedAgentTaskId) ?? null,
);
const activeProject = computed(
  () => extension.projects.find((project) => project.id === extension.activeProjectId) ?? null,
);
type PanelId = 'overview' | 'conversations' | 'memory' | 'skills' | 'tools' | 'tasks' | 'projects' | 'settings';

const activePanel = ref<PanelId>('overview');
type MemoryView = 'home' | 'layer' | 'review' | 'manage';
type MemoryLayerId = 'profile' | 'preference' | 'knowledge' | 'context';
const memoryView = ref<MemoryView>('home');
const selectedMemoryLayer = ref<MemoryLayerId>('profile');
const memoryLayers: Array<{ id: MemoryLayerId; title: string; description: string; types: string[] }> = [
  { id: 'profile', title: '个人档案', description: '稳定身份、关系与长期背景', types: ['profile'] },
  { id: 'preference', title: '偏好习惯', description: '表达方式、饮食与常用选择', types: ['preference'] },
  { id: 'knowledge', title: '知识事实', description: '可复用的事实与经验结论', types: ['knowledge'] },
  { id: 'context', title: '项目与情境', description: '项目约束、流程和阶段事件', types: ['project', 'procedure', 'episode'] },
];
const activeMemoryLayer = computed(() => memoryLayers.find((layer) => layer.id === selectedMemoryLayer.value) ?? memoryLayers[0]);
const visibleLayerMemories = computed(() => extension.memories.filter((memory) => activeMemoryLayer.value.types.includes(memory.type)));

function openMemoryLayer(layer: MemoryLayerId) {
  selectedMemoryLayer.value = layer;
  memoryView.value = 'layer';
}

function openMemoryView(view: Exclude<MemoryView, 'layer'>) {
  memoryView.value = view;
}

function backToMemoryHome() {
  memoryView.value = 'home';
}

function candidateLabel(candidate: { status: string; canonicalKey: string }): string {
  if (candidate.status !== 'conflict') return '待确认的记忆';
  const field = candidate.canonicalKey === 'user.profile.name' ? '姓名'
    : candidate.canonicalKey === 'user.profile.location' ? '所在地'
      : candidate.canonicalKey === 'user.profile.occupation' ? '职业'
        : candidate.canonicalKey === 'user.preference.response.language' ? '回复语言'
          : candidate.canonicalKey === 'user.preference.response.verbosity' ? '回复长度'
            : '同一项记忆';
  return `与已有${field}不一致`;
}

function candidateReason(candidate: { status: string; reason?: string | null }): string {
  if (candidate.status === 'conflict') return '确认后将用下方内容更新该记忆；忽略则保留原内容。';
  return candidate.reason || '请确认这是否是你希望长期保留的信息。';
}

function formatArtifactLocation(locator?: MemoryArtifactLocator | null): string {
  if (!locator) return '';
  const pages = locator.page
    ? `第 ${locator.page}${locator.pageEnd && locator.pageEnd !== locator.page ? `–${locator.pageEnd}` : ''} 页`
    : '';
  const structured = [pages, locator.section, locator.question].filter(Boolean).join(' · ');
  return structured || locator.label || '';
}
const panelTitles: Record<Exclude<PanelId, 'overview'>, string> = {
  conversations: '本地会话',
  memory: '长期记忆',
  skills: 'Skills',
  tools: '工具与 MCP',
  tasks: 'Agent 任务',
  projects: '项目上下文',
  settings: '设置与备份',
};
const overviewStats = computed(() => [
  { id: 'memory' as const, label: '记忆', value: extension.memoryTotalCount },
  { id: 'skills' as const, label: 'Skill', value: extension.skills.length },
  { id: 'tools' as const, label: '工具', value: extension.tools.length },
  { id: 'tasks' as const, label: '任务', value: extension.agentTaskTotalCount },
  { id: 'conversations' as const, label: '会话', value: extension.savedConversations.length },
  { id: 'projects' as const, label: '项目', value: extension.projects.length },
]);

function openPanel(panel: Exclude<PanelId, 'overview'>) {
  activePanel.value = panel;
}
const agentPresets = [
  '请记住：我喜欢简洁的中文回复，并搜索记忆 简洁',
  '打开 https://github.com 并抓取页面快照',
  '在 GitHub 搜索 OmniAgent',
  '输入 "OmniAgent" 并点击 "Submit"',
];

function applyAgentPreset(goal: string) {
  extension.agentGoalDraft = goal;
}

watch(() => extension.memoryNewItemId, async (id) => {
  if (!id || activePanel.value !== 'memory' || memoryView.value !== 'layer') return;
  await nextTick();
  document.querySelector<HTMLElement>(`[data-memory-id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

onMounted(() => {
  extension.startResponseListener();
  extension.startAdapterListener();
  extension.startDiagnosticPolling();
  extension.refreshAdapter();
  extension.refreshSavedConversations();
  extension.refreshMemories();
  extension.refreshMemoryCandidates();
  extension.refreshSessionChunks();
  extension.refreshMemoryDiagnostic();
  extension.refreshSkills();
  extension.refreshSkillTemplates();
  extension.refreshTools();
  extension.refreshMcpServers();
  extension.refreshAgentTasks();
  extension.refreshProjects();
  extension.refreshSettings();
});

onUnmounted(() => {
  extension.stopDiagnosticPolling();
  extension.stopAgentPolling();
});
</script>

<template>
  <main class="panel-shell">
    <section v-if="activePanel === 'overview'" class="hero">
      <p class="eyebrow">OMNIAGENT</p>
      <h1>One memory.<br />Every AI.</h1>
      <p class="description">{{ status }}</p>
      <p v-if="activeProject" class="active-project">活动项目：{{ activeProject.name }}</p>
      <p v-else class="active-project muted">未设置活动项目</p>
      <div class="overview-grid">
        <button
          v-for="item in overviewStats"
          :key="item.label"
          class="overview-card"
          type="button"
          :aria-label="`查看${item.label}详情`"
          @click="openPanel(item.id)"
        >
          <strong>{{ item.value }}</strong>
          <span>{{ item.label }}</span>
        </button>
      </div>
      <section class="active-ai-card" :class="{ connected: extension.adapter.provider }" aria-label="当前激活 AI">
        <span class="quick-card-label">当前激活 AI</span>
        <strong>{{ provider }}</strong>
        <span class="active-ai-note">{{ extension.adapter.provider ? '已随当前浏览器页签自动切换' : '切换到已支持的网站后自动激活' }}</span>
        <div v-if="extension.adapter.health" class="adapter-health" aria-label="页面适配状态">
          <span class="adapter-health-item" :data-state="extension.adapter.health.inputFound ? 'ready' : 'error'">输入框</span>
          <span class="adapter-health-item" :data-state="extension.adapter.health.submitFound ? 'ready' : 'error'">发送按钮</span>
          <span class="adapter-health-item" :data-state="extension.adapter.health.messageCount ? 'ready' : 'idle'">消息 {{ extension.adapter.health.messageCount }}</span>
          <span class="adapter-health-item" :data-state="extension.adapter.health.responseCount ? 'ready' : 'idle'">回复 {{ extension.adapter.health.responseCount }}</span>
        </div>
      </section>
      <el-alert v-if="adapterNotice" class="action-error" :title="adapterNotice" type="error" :closable="false" show-icon />
      <section class="provider-section" aria-label="已支持的平台">
        <span class="quick-card-label">已支持的平台</span>
        <div class="provider-grid">
          <div
            v-for="item in supportedProviders"
            :key="item.id"
            class="provider-card"
            :class="{ connected: extension.adapter.provider === item.id }"
          >
            <strong>{{ item.name }}</strong>
            <span>{{ extension.adapter.provider === item.id ? '已自动连接' : item.host }}</span>
          </div>
        </div>
      </section>
      <button type="button" class="settings-link" @click="openPanel('settings')">设置与备份</button>
    </section>
    <header v-else class="detail-header">
      <el-button text class="back-button" @click="activePanel = 'overview'">← 概览</el-button>
      <h1>{{ panelTitles[activePanel] }}</h1>
    </header>

    <section v-if="activePanel === 'conversations'" class="capability-card detail-card">
      <div class="section-heading">
        <h2>本地会话</h2>
        <div class="heading-actions">
          <el-button text :loading="extension.storageLoading" @click="extension.refreshSavedConversations">刷新</el-button>
          <el-button
            text
            type="danger"
            :disabled="!extension.selectedConversationId"
            :loading="extension.storageLoading"
            @click="extension.deleteSelectedConversation"
          >
            删除
          </el-button>
          <el-button text type="danger" :loading="extension.storageLoading" @click="extension.clearConversations">
            清空
          </el-button>
        </div>
      </div>
      <div class="filter-row">
        <el-select
          v-model="extension.conversationProviderFilter"
          class="filter-select"
          clearable
          placeholder="全部平台"
          @change="extension.refreshSavedConversations"
        >
          <el-option label="DeepSeek" value="deepseek" />
          <el-option label="Kimi" value="kimi" />
        </el-select>
        <label class="filter-check">
          <el-switch
            v-model="extension.conversationProjectOnly"
            size="small"
            @change="extension.refreshSavedConversations"
          />
          <span>仅活动项目</span>
        </label>
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
          :label="`${conversation.providerId} · ${conversation.title || conversation.externalId}`"
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

    <section v-if="activePanel === 'memory'" class="capability-card detail-card">
      <div class="section-heading">
        <div class="memory-heading">
          <el-button v-if="memoryView !== 'home'" text size="small" @click="backToMemoryHome">← 记忆中心</el-button>
          <h2>{{ memoryView === 'home' ? '记忆中心' : memoryView === 'layer' ? activeMemoryLayer.title : memoryView === 'review' ? '待处理记忆' : '管理与整理' }}</h2>
        </div>
        <div class="heading-actions">
          <el-button text :loading="extension.memoryLoading" @click="extension.refreshMemories(); extension.refreshMemoryCandidates(); extension.refreshMemoryDiagnostic()">同步</el-button>
        </div>
      </div>

      <template v-if="memoryView === 'home'">
        <p class="memory-intro">长期信息按层管理；聊天原文只保存在“本地会话”，不会混入这里。</p>
        <div class="memory-layer-grid">
          <button v-for="layer in memoryLayers" :key="layer.id" class="memory-layer-card" type="button" @click="openMemoryLayer(layer.id)">
            <span class="memory-layer-count">{{ extension.memories.filter((memory) => layer.types.includes(memory.type)).length }}</span>
            <span class="memory-layer-title">{{ layer.title }}</span>
            <span class="memory-layer-description">{{ layer.description }}</span>
          </button>
        </div>
        <div class="memory-home-actions">
          <button class="memory-route-card" type="button" @click="openMemoryView('review')">
            <span><strong>待处理</strong><small>候选与冲突不会注入 AI</small></span>
            <b>{{ extension.memoryCandidates.length }}</b>
          </button>
          <button class="memory-route-card" type="button" @click="openMemoryView('manage')">
            <span><strong>添加与整理</strong><small>手动添加、搜索、检查与清理</small></span>
            <b>→</b>
          </button>
        </div>
        <p class="memory-chat-hint">聊天内容请到“本地会话”查看；会话摘要仅用于内部检索，不在记忆中心直接展开。</p>
      </template>

      <template v-else-if="memoryView === 'layer'">
        <p class="memory-intro">{{ activeMemoryLayer.description }}</p>
        <ul v-if="visibleLayerMemories.length" class="memory-list">
          <li v-for="memory in visibleLayerMemories" :key="memory.id" class="memory-card" :data-memory-id="memory.id" @click="extension.selectMemory(memory.id)">
            <div class="skill-item-header">
              <span class="message-role">{{ memory.type }} · {{ memory.scope }}</span>
              <div class="heading-actions">
                <el-button text size="small" @click.stop="extension.toggleMemoryPinned(memory)">{{ memory.pinned ? '取消置顶' : '置顶' }}</el-button>
                <el-button text size="small" @click.stop="extension.beginMemoryEdit(memory)">编辑</el-button>
                <el-button text type="danger" size="small" @click.stop="extension.deleteMemory(memory.id)">删除</el-button>
              </div>
            </div>
            <template v-if="extension.memoryEditId === memory.id">
              <el-input v-model="extension.memoryEditContent" class="memory-input" type="textarea" :rows="3" />
              <div class="agent-actions"><el-button size="small" @click="extension.cancelMemoryEdit">取消</el-button><el-button size="small" type="primary" @click="extension.saveMemoryEdit(memory)">保存</el-button></div>
            </template>
            <template v-else>
              <p>{{ memory.summary }}</p>
              <div v-if="extension.selectedMemoryId === memory.id" class="memory-detail">
                <p><strong>完整内容</strong></p><p>{{ memory.content }}</p>
                <p class="skill-triggers">置信度 {{ Math.round(memory.confidence * 100) }}% · 重要度 {{ Math.round(memory.importance * 100) }}%</p>
                <template v-if="extension.selectedMemoryDetail?.fact.id === memory.id">
                  <p class="skill-triggers">来源证据 {{ extension.selectedMemoryDetail.fact.sourceCount }} 条 · 修订 {{ extension.selectedMemoryDetail.revisions.length }} 次</p>
                  <p v-if="extension.selectedMemoryDetail.artifact" class="skill-triggers">来源文件：{{ extension.selectedMemoryDetail.artifact.fileName }}</p>
                  <p v-if="formatArtifactLocation(extension.selectedMemoryDetail.fact.artifactLocator)" class="skill-triggers">文件定位：{{ formatArtifactLocation(extension.selectedMemoryDetail.fact.artifactLocator) }}</p>
                  <p v-if="extension.selectedMemoryDetail.evidence[0]" class="skill-triggers">原文依据：{{ extension.selectedMemoryDetail.evidence[0].excerpt }}</p>
                </template>
              </div>
            </template>
          </li>
        </ul>
        <p v-else class="empty-text">这一层还没有记忆</p>
      </template>

      <template v-else-if="memoryView === 'review'">
        <p class="memory-intro">候选与冲突需要确认，确认前不会进入任何 AI 的上下文。</p>
        <div v-if="extension.memoryCandidates.length" class="memory-candidate-section">
          <article v-for="candidate in extension.memoryCandidates" :key="candidate.id" class="memory-candidate-card">
            <div class="skill-item-header"><span class="message-role">{{ candidateLabel(candidate) }} · {{ candidate.type }} · {{ candidate.scope }}</span><span class="skill-triggers">{{ candidateReason(candidate) }}</span></div>
            <el-input :model-value="extension.memoryCandidateEdit || candidate.proposedValue" class="memory-input" type="textarea" :rows="2" @focus="extension.memoryCandidateEdit = candidate.proposedValue" @update:model-value="(value: string) => extension.memoryCandidateEdit = value" />
            <div class="agent-actions"><el-button size="small" type="primary" :loading="extension.memoryLoading" @click="extension.acceptMemoryCandidate(candidate)">确认保存</el-button><el-button size="small" :loading="extension.memoryLoading" @click="extension.rejectMemoryCandidate(candidate.id)">忽略</el-button></div>
          </article>
        </div>
        <p v-else class="empty-text">没有待处理记忆</p>
      </template>

      <template v-else>
        <p v-if="extension.memoryDiagnostic" class="detected-host">注入诊断：{{ extension.memoryDiagnostic.detail }}</p>
        <div class="filter-row">
        <el-input
          v-model="extension.memoryQuery"
          class="filter-select"
          clearable
          placeholder="搜索记忆"
          @keyup.enter="extension.refreshMemories"
          @clear="extension.refreshMemories"
        />
        <el-button :loading="extension.memoryLoading" @click="extension.refreshMemories">搜索</el-button>
      </div>
      <div class="filter-row">
        <el-select
          v-model="extension.memoryTypeFilter"
          class="filter-select"
          clearable
          placeholder="全部类型"
          @change="extension.refreshMemories"
        >
          <el-option label="profile" value="profile" />
          <el-option label="preference" value="preference" />
          <el-option label="project" value="project" />
          <el-option label="knowledge" value="knowledge" />
          <el-option label="episode" value="episode" />
          <el-option label="procedure" value="procedure" />
        </el-select>
        <label class="filter-check">
          <el-switch v-model="extension.memoryProjectOnly" size="small" @change="extension.refreshMemories" />
          <span>含活动项目</span>
        </label>
      </div>
      <el-input
        v-model="extension.memoryDraft"
        class="memory-input"
        type="textarea"
        :rows="3"
        placeholder="例如：我偏好简洁的中文回复"
      />
      <div class="filter-row">
        <el-select v-model="extension.memoryTypeDraft" class="filter-select" placeholder="记忆类型">
          <el-option label="偏好" value="preference" />
          <el-option label="个人资料" value="profile" />
          <el-option label="知识" value="knowledge" />
          <el-option label="项目" value="project" />
        </el-select>
        <el-select v-model="extension.memoryScopeDraft" class="filter-select" placeholder="作用域">
          <el-option label="全局" value="global" />
          <el-option :disabled="!extension.adapter.provider" label="当前平台" value="provider" />
          <el-option :disabled="!extension.activeProjectId" label="当前项目" value="project" />
        </el-select>
      </div>
      <el-button class="primary-action" type="primary" :disabled="!extension.memoryDraft.trim()" @click="extension.saveMemory">
        保存记忆
      </el-button>
      <div class="heading-actions memory-maintenance-actions">
        <el-button text :loading="extension.memoryLoading" @click="extension.deduplicateMemories">检查与整理</el-button>
        <el-button text type="danger" :loading="extension.memoryLoading" @click="extension.clearMemories">清空所有长期记忆</el-button>
      </div>
      <el-alert v-if="extension.memoryError" class="action-error" :title="extension.memoryError" type="error" :closable="false" />
      <el-alert v-if="extension.memoryMessage" class="action-error" :title="extension.memoryMessage" type="success" :closable="false" />
      </template>
    </section>

    <section v-if="activePanel === 'skills'" class="capability-card detail-card">
      <div class="section-heading">
        <h2>已安装 Skill</h2>
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
      <div class="filter-row">
        <el-input
          v-model="extension.skillQuery"
          class="filter-select"
          clearable
          placeholder="匹配 Skill，例如 调研代码审查"
          @keyup.enter="extension.matchSkills"
          @clear="extension.matchedSkills = []"
        />
        <el-button :loading="extension.skillLoading" @click="extension.matchSkills">匹配</el-button>
      </div>
      <ul v-if="extension.matchedSkills.length" class="skill-list">
        <li v-for="match in extension.matchedSkills" :key="`match-${match.skill.id}`">
          <span class="message-role">matched · {{ match.score.toFixed(1) }}</span>
          <strong>{{ match.skill.manifest.name }}</strong>
          <p>{{ match.skill.manifest.description || match.skill.prompt }}</p>
        </li>
      </ul>
      <ul v-if="extension.skills.length" class="skill-list">
        <li v-for="skill in extension.skills" :key="skill.id">
          <div class="skill-item-header">
            <div>
              <span class="message-role">{{ skill.source }} · {{ skill.enabled ? 'enabled' : 'disabled' }}</span>
              <strong>{{ skill.manifest.name }}</strong>
            </div>
            <div class="heading-actions">
              <el-switch
                :model-value="skill.enabled"
                size="small"
                @change="(value: string | number | boolean) => extension.setSkillEnabled(skill.id, Boolean(value))"
              />
              <el-button
                v-if="skill.source === 'user'"
                text
                type="danger"
                size="small"
                @click="extension.deleteSkill(skill.id)"
              >
                删除
              </el-button>
            </div>
          </div>
          <p>{{ skill.manifest.description || skill.prompt }}</p>
          <p v-if="skill.manifest.triggers?.length" class="skill-triggers">触发：{{ skill.manifest.triggers.join(' / ') }}</p>
        </li>
      </ul>
      <p v-else class="empty-text">暂无已安装 Skill</p>
      <div class="section-heading skill-template-heading">
        <h2>Skill 模板</h2>
      </div>
      <ul v-if="extension.skillTemplates.length" class="skill-list">
        <li v-for="template in extension.skillTemplates" :key="template.id">
          <div class="skill-item-header">
            <div>
              <strong>{{ template.name }}</strong>
              <p>{{ template.description }}</p>
            </div>
            <el-button
              size="small"
              type="primary"
              :loading="extension.skillLoading"
              @click="extension.installSkillTemplate(template.id || template.name)"
            >
              安装
            </el-button>
          </div>
        </li>
      </ul>
    </section>

    <section v-if="activePanel === 'tools'" class="capability-card detail-card">
      <div class="section-heading">
        <h2>Tool Runtime</h2>
        <div class="heading-actions">
          <el-button text :loading="extension.toolLoading" @click="extension.refreshTools">刷新</el-button>
          <el-button text type="danger" :loading="extension.toolLoading" @click="extension.clearToolHistory">清空历史</el-button>
        </div>
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
      <div v-if="extension.toolHistory.length" class="message-history">
        <article v-for="item in extension.toolHistory.slice(0, 8)" :key="item.id" class="stored-message" :data-role="item.ok ? 'user' : 'assistant'">
          <div class="skill-item-header">
            <span class="message-role">{{ item.ok ? 'ok' : 'failed' }} · {{ item.name }} · {{ item.durationMs }}ms</span>
            <el-button text size="small" :loading="extension.toolLoading" @click="extension.rerunToolHistory(item)">重跑</el-button>
          </div>
          <p>{{ item.error || summarizeHistory(item.result) }}</p>
        </article>
      </div>
      <p v-else class="empty-text">尚未执行工具</p>
    </section>

    <section v-if="activePanel === 'settings'" class="capability-card detail-card">
      <div class="section-heading">
        <h2>备份 / 恢复</h2>
        <el-button text :loading="extension.backupLoading" @click="extension.exportData">导出</el-button>
      </div>
      <el-input
        v-model="extension.backupJson"
        class="skill-input"
        type="textarea"
        :rows="5"
        placeholder="导出结果或粘贴导入 JSON"
      />
      <div class="agent-actions">
        <el-button :loading="extension.backupLoading" @click="extension.exportData">导出数据</el-button>
        <el-button :disabled="!extension.backupJson.trim()" @click="extension.copyExportJson">复制 JSON</el-button>
        <el-button type="primary" :loading="extension.backupLoading" :disabled="!extension.backupJson.trim()" @click="extension.importData">
          导入数据
        </el-button>
      </div>
      <div class="filter-row">
        <el-select v-model="extension.agentProviderDraft" class="filter-select" placeholder="切换 Agent Provider">
          <el-option label="DeepSeek" value="deepseek" />
          <el-option label="Kimi" value="kimi" />
        </el-select>
        <el-button :disabled="!extension.selectedAgentTaskId || !extension.agentProviderDraft" :loading="extension.agentLoading" @click="extension.switchSelectedAgentProvider">
          切换并续跑
        </el-button>
      </div>
      <el-alert v-if="extension.backupError" class="action-error" :title="extension.backupError" type="error" :closable="false" />
      <el-alert v-if="extension.backupMessage" class="action-error" :title="extension.backupMessage" type="success" :closable="false" />
    </section>

    <section v-if="activePanel === 'settings'" class="capability-card">
      <div class="section-heading">
        <h2>注入设置</h2>
        <el-button text :loading="extension.settingsLoading" @click="extension.refreshSettings">刷新</el-button>
      </div>
      <div class="settings-grid">
        <label class="setting-item">
          <span>注入 Memory</span>
          <el-switch
            :model-value="extension.settings.injectMemory"
            @change="(value: string | number | boolean) => extension.updateSettings({ injectMemory: Boolean(value) })"
          />
        </label>
        <label class="setting-item">
          <span>自动记忆</span>
          <el-select
            :model-value="extension.settings.memorySaveMode"
            style="width: 120px"
            @change="(value: 'auto' | 'confirm' | 'off') => extension.updateSettings({ memorySaveMode: value })"
          >
            <el-option label="自动保存（安全项）" value="auto" />
            <el-option label="先确认再保存" value="confirm" />
            <el-option label="关闭自动捕捉" value="off" />
          </el-select>
        </label>
        <label class="setting-item">
          <span>启用 Browser Control</span>
          <el-switch
            :model-value="extension.settings.browserControlEnabled"
            @change="(value: string | number | boolean) => extension.updateSettings({ browserControlEnabled: Boolean(value) })"
          />
        </label>
        <label class="setting-item">
          <span>注入 Skill</span>
          <el-switch
            :model-value="extension.settings.injectSkills"
            @change="(value: string | number | boolean) => extension.updateSettings({ injectSkills: Boolean(value) })"
          />
        </label>
        <label class="setting-item">
          <span>注入 Tools</span>
          <el-switch
            :model-value="extension.settings.injectTools"
            @change="(value: string | number | boolean) => extension.updateSettings({ injectTools: Boolean(value) })"
          />
        </label>
        <label class="setting-item">
          <span>注入 Project</span>
          <el-switch
            :model-value="extension.settings.injectProject"
            @change="(value: string | number | boolean) => extension.updateSettings({ injectProject: Boolean(value) })"
          />
        </label>
      </div>
      <el-alert v-if="extension.settingsError" class="action-error" :title="extension.settingsError" type="error" :closable="false" />
    </section>

    <section v-if="activePanel === 'projects'" class="capability-card detail-card">
      <div class="section-heading">
        <h2>项目上下文</h2>
        <el-button text :loading="extension.projectLoading" @click="extension.refreshProjects">刷新</el-button>
      </div>
      <el-select
        :model-value="extension.activeProjectId"
        class="conversation-select"
        clearable
        placeholder="未选择活动项目"
        @change="(value: string) => extension.setActiveProject(value || null)"
      >
        <el-option
          v-for="project in extension.projects"
          :key="project.id"
          :label="project.name"
          :value="project.id"
        />
      </el-select>
      <el-input v-model="extension.projectDraftName" class="skill-input" placeholder="项目名称，例如 OmniAgent" />
      <el-input v-model="extension.projectDraftDescription" class="skill-input" placeholder="简短描述" />
      <el-input
        v-model="extension.projectDraftContext"
        class="skill-input"
        type="textarea"
        :rows="3"
        placeholder="项目上下文，会在记忆注入与 Agent 任务中使用"
      />
      <el-button
        class="primary-action"
        type="primary"
        :loading="extension.projectLoading"
        :disabled="!extension.projectDraftName.trim()"
        @click="extension.saveProject"
      >
        保存并设为活动项目
      </el-button>
      <el-alert v-if="extension.projectError" class="action-error" :title="extension.projectError" type="error" :closable="false" />
      <ul v-if="extension.projects.length" class="skill-list">
        <li v-for="project in extension.projects" :key="project.id">
          <div class="skill-item-header">
            <div>
              <span class="message-role">{{ project.status }}{{ project.id === extension.activeProjectId ? ' · active' : '' }}</span>
              <strong>{{ project.name }}</strong>
            </div>
            <el-button text type="danger" size="small" @click="extension.deleteProject(project.id)">删除</el-button>
          </div>
          <p>{{ project.description || project.context || '无描述' }}</p>
        </li>
      </ul>
      <p v-else class="empty-text">暂无项目</p>
    </section>

    <section v-if="activePanel === 'tools'" class="capability-card">
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

    <section v-if="activePanel === 'tasks'" class="capability-card detail-card">
      <div class="section-heading">
        <h2>Agent Runtime</h2>
        <div class="heading-actions">
          <el-button text :loading="extension.agentLoading" @click="extension.refreshAgentTasks">刷新</el-button>
          <el-button text type="danger" :loading="extension.agentLoading" @click="extension.clearAgentTasks">清空</el-button>
        </div>
      </div>
      <el-input
        v-model="extension.agentGoalDraft"
        class="skill-input"
        type="textarea"
        :rows="3"
        placeholder="例如：请记住：我喜欢简洁回复，并搜索记忆 简洁"
      />
      <div class="preset-row">
        <el-button
          v-for="preset in agentPresets"
          :key="preset"
          size="small"
          plain
          @click="applyAgentPreset(preset)"
        >
          {{ preset.length > 18 ? `${preset.slice(0, 18)}...` : preset }}
        </el-button>
      </div>
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
      <el-select
        v-model="extension.agentStatusFilter"
        class="conversation-select"
        clearable
        placeholder="全部状态"
        @change="extension.refreshAgentTasks"
      >
        <el-option label="idle" value="idle" />
        <el-option label="planning" value="planning" />
        <el-option label="running" value="running" />
        <el-option label="waiting_tool" value="waiting_tool" />
        <el-option label="completed" value="completed" />
        <el-option label="failed" value="failed" />
        <el-option label="stopped" value="stopped" />
      </el-select>
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
        <article
          v-for="step in selectedAgentTask.steps"
          :key="step.id"
          class="stored-message"
          :data-role="step.ok === false ? 'assistant' : step.type === 'tool' ? 'user' : 'system'"
        >
          <span class="message-role">
            #{{ step.index }} {{ step.type }}
            <template v-if="step.toolName"> · {{ step.toolName }}</template>
            <template v-if="step.ok === true"> · ok</template>
            <template v-if="step.ok === false"> · failed</template>
          </span>
          <p>{{ step.title }}</p>
          <p v-if="step.detail" class="skill-triggers">{{ step.detail }}</p>
        </article>
      </div>
      <p v-else class="empty-text">暂无 Agent 任务</p>
    </section>
  </main>
</template>
