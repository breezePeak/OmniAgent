import type {
  AgentDependencies,
  AgentStep,
  AgentTask,
  CreateTaskInput,
  PlannedAction,
} from './types.js';
import { ContextBuilder, type ContextSources } from './context.js';
import { planActions } from './planner.js';

function createId(): string {
  const webCrypto = globalThis.crypto as Crypto | undefined;
  if (webCrypto?.randomUUID) return webCrypto.randomUUID();
  return `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export class AgentRuntime {
  private readonly tasks = new Map<string, AgentTask>();
  private readonly paused = new Set<string>();
  private readonly contextBuilder: ContextBuilder;
  private readonly dependencies: AgentDependencies;
  private readonly onChange?: (task: AgentTask) => void | Promise<void>;
  private readonly maxToolRetries: number;

  constructor(input: {
    sources: ContextSources;
    executeTool: AgentDependencies['executeTool'];
    plan?: AgentDependencies['plan'];
    onChange?: (task: AgentTask) => void | Promise<void>;
    maxToolRetries?: number;
  }) {
    this.contextBuilder = new ContextBuilder(input.sources);
    this.onChange = input.onChange;
    this.maxToolRetries = Math.max(0, input.maxToolRetries ?? 1);
    this.dependencies = {
      buildContext: (goal, options) => this.contextBuilder.build(goal, options),
      plan: input.plan ?? (async (goal, context, history) => planActions(goal, context, history)),
      executeTool: input.executeTool,
    };
  }

  hydrate(tasks: AgentTask[]): void {
    this.tasks.clear();
    for (const task of tasks) {
      const normalized: AgentTask = {
        ...task,
        steps: Array.isArray(task.steps) ? task.steps : [],
        // Interrupt in-flight statuses after process restart.
        status: isActiveStatus(task.status) ? 'stopped' : task.status,
      };
      this.tasks.set(normalized.id, normalized);
    }
  }

  listTasks(): AgentTask[] {
    return [...this.tasks.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  getTask(id: string): AgentTask | undefined {
    return this.tasks.get(id);
  }

  async createTask(input: CreateTaskInput): Promise<AgentTask> {
    const now = Date.now();
    const task: AgentTask = {
      id: createId(),
      goal: input.goal.trim(),
      status: 'idle',
      steps: [],
      createdAt: now,
      updatedAt: now,
      providerId: input.providerId ?? null,
      projectId: input.projectId ?? null,
    };
    if (!task.goal) throw new Error('任务目标不能为空');
    this.tasks.set(task.id, task);
    await this.emitChange(task);
    return task;
  }

  async runTask(id: string): Promise<AgentTask> {
    const task = this.requireTask(id);
    if (task.status === 'running' || task.status === 'planning' || task.status === 'waiting_tool') {
      return task;
    }
    this.paused.delete(id);
    setTaskStatus(task, 'planning');
    task.updatedAt = Date.now();
    task.error = undefined;
    await this.emitChange(task);

    try {
      const context = await this.dependencies.buildContext(task.goal, {
        providerId: task.providerId,
        projectId: task.projectId,
      });
      this.pushStep(task, {
        type: 'plan',
        title: '构建上下文',
        detail: this.contextBuilder.formatPrompt(context).slice(0, 500),
      });

      let done = false;
      while (!this.paused.has(id) && !done) {
        setTaskStatus(task, 'planning');
        const actions = await this.dependencies.plan(task.goal, context, task.steps);
        if (!actions.length) {
          setTaskStatus(task, 'completed');
          task.result = '没有更多可执行步骤';
          done = true;
          break;
        }

        for (const action of actions) {
          if (this.paused.has(id)) {
            setTaskStatus(task, 'stopped');
            done = true;
            break;
          }
          await this.executeAction(task, action);
          if (isTerminalStatus(task.status)) {
            done = true;
            break;
          }
        }

        if (isTerminalStatus(task.status) || actions.every((action) => action.type === 'finish')) {
          done = true;
        }
      }

      if (this.paused.has(id) && !isTerminalStatus(task.status)) {
        setTaskStatus(task, 'stopped');
      } else if (!isTerminalStatus(task.status)) {
        setTaskStatus(task, 'completed');
        task.result = task.result || '任务执行完成';
      }
    } catch (error) {
      setTaskStatus(task, 'failed');
      task.error = error instanceof Error ? error.message : String(error);
      this.pushStep(task, {
        type: 'error',
        title: '任务失败',
        detail: task.error,
        ok: false,
      });
    }

    task.updatedAt = Date.now();
    await this.emitChange(task);
    return task;
  }

  pauseTask(id: string): AgentTask {
    const task = this.requireTask(id);
    this.paused.add(id);
    if (task.status === 'running' || task.status === 'planning' || task.status === 'waiting_tool') {
      setTaskStatus(task, 'stopped');
      task.updatedAt = Date.now();
      void this.emitChange(task);
    }
    return task;
  }

  async resumeTask(id: string): Promise<AgentTask> {
    const task = this.requireTask(id);
    if (task.status === 'completed' || task.status === 'failed') return task;
    return this.runTask(task.id);
  }

  async deleteTask(id: string): Promise<void> {
    this.paused.add(id);
    this.tasks.delete(id);
  }

  private async executeAction(task: AgentTask, action: PlannedAction): Promise<void> {
    if (action.type === 'finish') {
      const step = this.pushStep(task, {
        type: 'finish',
        title: action.title,
        detail: action.result,
        ok: true,
      });
      step.finishedAt = Date.now();
      setTaskStatus(task, 'completed');
      task.result = action.result || action.title;
      return;
    }

    if (!action.toolName) {
      setTaskStatus(task, 'failed');
      task.error = '计划步骤缺少 toolName';
      return;
    }

    setTaskStatus(task, 'waiting_tool');
    const step = this.pushStep(task, {
      type: 'tool',
      title: action.title,
      toolName: action.toolName,
      toolArguments: action.toolArguments,
    });
    await this.emitChange(task);

    setTaskStatus(task, 'running');
    let attempt = 0;
    let result = await this.dependencies.executeTool(
      { name: action.toolName, arguments: action.toolArguments },
      { providerId: task.providerId, projectId: task.projectId },
    );
    while (!result.ok && attempt < this.maxToolRetries) {
      attempt += 1;
      this.pushStep(task, {
        type: 'observe',
        title: `重试 ${action.toolName} (${attempt}/${this.maxToolRetries})`,
        detail: result.error || 'tool failed',
        ok: false,
      });
      await this.emitChange(task);
      result = await this.dependencies.executeTool(
        { name: action.toolName, arguments: action.toolArguments },
        { providerId: task.providerId, projectId: task.projectId },
      );
    }

    step.finishedAt = Date.now();
    step.ok = result.ok;
    step.toolResult = result.ok ? result.result : undefined;
    step.detail = result.ok
      ? safeStringify(result.result)
      : (result.error || 'tool failed');

    if (!result.ok) {
      setTaskStatus(task, 'failed');
      task.error = result.error || `工具执行失败: ${action.toolName}`;
      this.pushStep(task, {
        type: 'error',
        title: '工具执行失败',
        detail: task.error,
        ok: false,
      });
    }
    await this.emitChange(task);
  }

  private pushStep(
    task: AgentTask,
    input: Omit<AgentStep, 'id' | 'index' | 'createdAt'>,
  ): AgentStep {
    const step: AgentStep = {
      id: createId(),
      index: task.steps.length,
      createdAt: Date.now(),
      ...input,
    };
    task.steps.push(step);
    task.updatedAt = Date.now();
    return step;
  }

  private requireTask(id: string): AgentTask {
    const task = this.tasks.get(id);
    if (!task) throw new Error(`Task not found: ${id}`);
    return task;
  }

  private async emitChange(task: AgentTask): Promise<void> {
    if (!this.onChange) return;
    await this.onChange(structuredCloneTask(task));
  }
}

function safeStringify(value: unknown): string {
  try {
    return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function setTaskStatus(task: AgentTask, status: AgentTask['status']): void {
  task.status = status;
}

function isTerminalStatus(status: AgentTask['status']): boolean {
  return status === 'failed' || status === 'completed' || status === 'stopped';
}

function isActiveStatus(status: AgentTask['status']): boolean {
  return status === 'running' || status === 'planning' || status === 'waiting_tool';
}

function structuredCloneTask(task: AgentTask): AgentTask {
  return {
    ...task,
    steps: task.steps.map((step) => ({ ...step })),
  };
}
