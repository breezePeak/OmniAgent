import type { AgentDecision, ParseDecisionResult } from './types.js';

const ACTION_PATTERN = /<omniagent-action\s*>([\s\S]*?)<\/omniagent-action\s*>/i;

/**
 * Parses the single structured action emitted by a web model.
 * Deliberately accepts only the explicit envelope so regular model prose is
 * never mistaken for an executable instruction.
 */
export function parseAgentDecision(response: string): ParseDecisionResult {
  const raw = response.trim();
  const match = ACTION_PATTERN.exec(raw);
  if (!match) {
    return { ok: false, raw, error: '未找到 <omniagent-action> 输出块' };
  }

  let value: unknown;
  try {
    value = JSON.parse(match[1].trim());
  } catch {
    return { ok: false, raw, error: 'OmniAgent action 不是有效 JSON' };
  }

  const validation = validateDecision(value);
  return validation.ok
    ? { ok: true, raw, decision: validation.decision }
    : { ok: false, raw, error: validation.error };
}

export function validateDecision(value: unknown):
  | { ok: true; decision: AgentDecision }
  | { ok: false; error: string } {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return { ok: false, error: 'OmniAgent action 必须包含 type' };
  }

  if (value.type === 'tool_call') {
    if (!isNonEmptyString(value.toolName)) {
      return { ok: false, error: 'tool_call 必须包含非空 toolName' };
    }
    if (value.arguments !== undefined && !isRecord(value.arguments)) {
      return { ok: false, error: 'tool_call.arguments 必须是对象' };
    }
    if (value.reason !== undefined && typeof value.reason !== 'string') {
      return { ok: false, error: 'tool_call.reason 必须是字符串' };
    }
    return {
      ok: true,
      decision: {
        type: 'tool_call',
        toolName: value.toolName.trim(),
        arguments: value.arguments ?? {},
        ...(value.reason ? { reason: value.reason } : {}),
      },
    };
  }

  if (value.type === 'ask_user') {
    return isNonEmptyString(value.message)
      ? { ok: true, decision: { type: 'ask_user', message: value.message.trim() } }
      : { ok: false, error: 'ask_user 必须包含非空 message' };
  }

  if (value.type === 'finish') {
    return isNonEmptyString(value.result)
      ? { ok: true, decision: { type: 'finish', result: value.result.trim() } }
      : { ok: false, error: 'finish 必须包含非空 result' };
  }

  return { ok: false, error: `不支持的 OmniAgent action 类型: ${value.type}` };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
