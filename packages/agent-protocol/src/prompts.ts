export interface CompletedStepSummary {
  index: number;
  title: string;
  toolName?: string;
  ok?: boolean;
  detail?: string;
}

export interface ContinuationPromptInput {
  goal: string;
  currentStatus: string;
  availableTools: string;
  completedSteps?: CompletedStepSummary[];
  latestToolResult?: unknown;
  maxStepHistory?: number;
}

/**
 * The provider-neutral prompt used for the initial model decision and after
 * every tool result. It keeps the executable output contract in one place.
 */
export function buildContinuationPrompt(input: ContinuationPromptInput): string {
  const steps = (input.completedSteps ?? []).slice(-(input.maxStepHistory ?? 6));
  const formattedSteps = steps.length
    ? steps.map((step) => {
      const tool = step.toolName ? ` (${step.toolName})` : '';
      const state = step.ok === false ? '失败' : step.ok === true ? '成功' : '进行中';
      return `${step.index + 1}. [${state}] ${step.title}${tool}${step.detail ? `：${step.detail}` : ''}`;
    }).join('\n')
    : '（暂无）';

  return [
    '<omniagent-task>',
    `Goal:\n${input.goal.trim()}`,
    `Current Status:\n${input.currentStatus}`,
    `Completed Steps:\n${formattedSteps}`,
    `Latest Tool Result:\n${safeStringify(input.latestToolResult)}`,
    `Available Tools:\n${input.availableTools.trim() || '（暂无可用工具）'}`,
    'Instruction:',
    'Decide exactly one next action. Do not use Markdown code fences.',
    'Return exactly one <omniagent-action> block containing valid JSON.',
    'Allowed JSON shapes:',
    '{"type":"tool_call","toolName":"<available tool>","arguments":{}}',
    '{"type":"ask_user","message":"<question>"}',
    '{"type":"finish","result":"<final answer>"}',
    '</omniagent-task>',
  ].join('\n\n');
}

function safeStringify(value: unknown): string {
  if (value === undefined) return '（暂无）';
  try {
    return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
