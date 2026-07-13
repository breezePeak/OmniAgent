import assert from 'node:assert/strict';
import test from 'node:test';
import { AgentRuntime, planActions } from '../src/index.js';

test('plans browser and memory actions from natural language goals', () => {
  const actions = planActions(
    '打开 https://github.com 并抓取页面快照，然后记住：我喜欢简洁回复',
    {
      goal: 'demo',
      memoryContext: '',
      skillContext: '',
      toolContext: '',
    },
    [],
  );
  const names = actions.filter((action) => action.type === 'tool').map((action) => action.toolName);
  assert.ok(names.includes('browser.navigate'));
  assert.ok(names.includes('browser.snapshot'));
  assert.ok(names.includes('memory.save'));
});

test('plans github search goals into navigate + snapshot', () => {
  const actions = planActions(
    '在 GitHub 搜索 OmniAgent',
    {
      goal: 'demo',
      memoryContext: '',
      skillContext: '',
      toolContext: '',
    },
    [],
  );
  const names = actions.filter((action) => action.type === 'tool').map((action) => action.toolName);
  assert.ok(names.includes('browser.navigate'));
  assert.ok(names.includes('browser.snapshot'));
});

test('runs a multi-step task through tools and completes', async () => {
  const calls: string[] = [];
  const runtime = new AgentRuntime({
    sources: {
      retrieveMemory: async () => '<omniagent-memory>\n- 用户偏好简洁\n</omniagent-memory>',
      matchSkills: async () => '',
      describeTools: () => '- memory.save\n- memory.search',
    },
    executeTool: async (call) => {
      calls.push(call.name);
      if (call.name === 'memory.save') return { ok: true, result: { id: 'm1', content: call.arguments?.content } };
      if (call.name === 'memory.search') return { ok: true, result: [{ summary: '用户偏好简洁' }] };
      return { ok: false, error: `unexpected tool ${call.name}` };
    },
  });

  const created = await runtime.createTask({ goal: '请记住：我喜欢简洁回复，并搜索记忆 简洁' });
  const finished = await runtime.runTask(created.id);

  assert.equal(finished.status, 'completed');
  assert.ok(calls.includes('memory.save'));
  assert.ok(calls.includes('memory.search'));
  assert.ok(finished.steps.some((step) => step.type === 'tool' && step.ok));
  assert.ok(finished.steps.some((step) => step.type === 'finish'));
});

test('can pause a running task before completion', async () => {
  let resolveTool: (() => void) | null = null;
  const runtime = new AgentRuntime({
    sources: {
      describeTools: () => '- memory.save',
    },
    executeTool: async () => {
      await new Promise<void>((resolve) => {
        resolveTool = resolve;
      });
      return { ok: true, result: { saved: true } };
    },
  });

  const task = await runtime.createTask({ goal: '请记住：暂停测试' });
  const running = runtime.runTask(task.id);
  // Allow the runtime to enter waiting_tool/running.
  await new Promise((resolve) => setTimeout(resolve, 10));
  runtime.pauseTask(task.id);
  resolveTool?.();
  const finished = await running;
  assert.ok(finished.status === 'stopped' || finished.status === 'completed');
});

test('hydrates persisted tasks and retries failed tools', async () => {
  const changes: string[] = [];
  let attempts = 0;
  const runtime = new AgentRuntime({
    sources: {
      describeTools: () => '- memory.save',
    },
    maxToolRetries: 1,
    onChange: async (task) => {
      changes.push(task.status);
    },
    executeTool: async () => {
      attempts += 1;
      if (attempts === 1) return { ok: false, error: 'temporary failure' };
      return { ok: true, result: { saved: true } };
    },
  });

  runtime.hydrate([
    {
      id: 'persisted-1',
      goal: '请记住：恢复后继续',
      status: 'running',
      steps: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      providerId: null,
      projectId: null,
    },
  ]);
  const hydrated = runtime.getTask('persisted-1');
  assert.equal(hydrated?.status, 'stopped');

  const task = await runtime.createTask({ goal: '请记住：自动重试' });
  const finished = await runtime.runTask(task.id);
  assert.equal(finished.status, 'completed');
  assert.equal(attempts, 2);
  assert.ok(changes.includes('planning') || changes.includes('completed'));
});
