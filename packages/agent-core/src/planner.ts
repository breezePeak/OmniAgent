import type { AgentContext, AgentStep, PlannedAction } from './types.js';

/**
 * Heuristic planner for the first Agent Runtime MVP.
 * It turns common natural-language goals into tool sequences without requiring a model API.
 */
export function planActions(goal: string, context: AgentContext, history: AgentStep[]): PlannedAction[] {
  if (history.some((step) => step.type === 'finish')) {
    return [{ type: 'finish', title: '任务已完成', result: history.find((step) => step.type === 'finish')?.detail || 'done' }];
  }

  const normalized = goal.toLowerCase();
  const actions: PlannedAction[] = [];

  if (/记住|记忆|save memory|remember/u.test(goal)) {
    const content = goal.replace(/^(请)?(帮我)?记住[：:\s]*/u, '').trim() || goal;
    actions.push({
      type: 'tool',
      title: '保存长期记忆',
      toolName: 'memory.save',
      toolArguments: { content },
    });
  }

  if (/搜索记忆|查找记忆|memory search|回忆/u.test(goal)) {
    actions.push({
      type: 'tool',
      title: '检索相关记忆',
      toolName: 'memory.search',
      toolArguments: { query: goal, limit: 5 },
    });
  }

  if (/打开|访问|navigate|goto|跳转/u.test(goal)) {
    const url = extractUrl(goal) ?? inferSiteUrl(goal);
    if (url) {
      actions.push({
        type: 'tool',
        title: `打开 ${url}`,
        toolName: 'browser.navigate',
        toolArguments: { url },
      });
    }
  }

  if (/搜索|search/u.test(goal) && /github|谷歌|google|bing/i.test(goal)) {
    const query = extractQuoted(goal) || goal.replace(/.*(搜索|search)\s*/iu, '').trim();
    const url = /github/i.test(goal)
      ? `https://github.com/search?q=${encodeURIComponent(query || 'OmniAgent')}`
      : /bing/i.test(goal)
        ? `https://www.bing.com/search?q=${encodeURIComponent(query || 'OmniAgent')}`
        : `https://www.google.com/search?q=${encodeURIComponent(query || 'OmniAgent')}`;
    actions.push({
      type: 'tool',
      title: `搜索并打开 ${url}`,
      toolName: 'browser.navigate',
      toolArguments: { url },
    });
    actions.push({
      type: 'tool',
      title: '读取搜索结果页',
      toolName: 'browser.snapshot',
      toolArguments: { includeText: true, maxLength: 2500 },
    });
  }

  if (/快照|snapshot|读取页面|看一下页面/u.test(goal)) {
    actions.push({
      type: 'tool',
      title: '抓取当前页面快照',
      toolName: 'browser.snapshot',
      toolArguments: { includeText: true, maxLength: 2000 },
    });
  }

  if (/滚动|scroll/u.test(goal)) {
    actions.push({
      type: 'tool',
      title: '滚动页面',
      toolName: 'browser.scroll',
      toolArguments: {
        direction: /上|up/u.test(goal) ? 'up' : 'down',
        amount: 800,
      },
    });
  }

  const latestSnapshot = findLatestSnapshot(history);

  if (/输入|填写|type/u.test(goal)) {
    const value = extractQuoted(goal) || goal.replace(/.*(输入|填写|type)\s*/u, '').trim();
    if (value) {
      const inputRef = findElementRef(latestSnapshot, ['textbox', 'input', 'textarea', 'search']);
      actions.push({
        type: 'tool',
        title: '向页面输入文本',
        toolName: 'browser.type',
        toolArguments: inputRef
          ? { ref: inputRef, value, clear: true }
          : {
            selector: 'input, textarea, [contenteditable="true"]',
            value,
            clear: true,
          },
      });
    }
  }

  if (/点击|click/u.test(goal)) {
    const text = extractClickTarget(goal);
    const clickRef = text
      ? findElementRefByName(latestSnapshot, text)
      : findElementRef(latestSnapshot, ['button', 'link', 'submit', 'search']);
    actions.push({
      type: 'tool',
      title: '点击页面元素',
      toolName: 'browser.click',
      toolArguments: clickRef
        ? { ref: clickRef }
        : (text ? { text } : { selector: 'button, a, [role="button"]' }),
    });
  }

  // If the goal needs page interaction but we have no snapshot yet, capture one first.
  if (
    (/输入|填写|type|点击|click/u.test(goal)) &&
    !latestSnapshot &&
    !actions.some((action) => action.toolName === 'browser.snapshot')
  ) {
    actions.unshift({
      type: 'tool',
      title: '抓取页面元素后再操作',
      toolName: 'browser.snapshot',
      toolArguments: { includeText: true, includeElements: true, maxLength: 1500, maxElements: 30 },
    });
  }

  if (/mcp\.|notes\.|echo/u.test(normalized) || /mcp/u.test(normalized)) {
    if (/echo/u.test(normalized)) {
      actions.push({
        type: 'tool',
        title: '调用 Echo MCP',
        toolName: 'mcp.echo.echo',
        toolArguments: { message: extractQuoted(goal) || goal },
      });
    } else if (/notes|笔记/u.test(normalized)) {
      if (/写|保存|write/u.test(normalized)) {
        actions.push({
          type: 'tool',
          title: '写入 MCP 笔记',
          toolName: 'mcp.notes.notes.write',
          toolArguments: {
            key: 'agent-note',
            value: extractQuoted(goal) || goal,
          },
        });
      } else if (/读|read/u.test(normalized)) {
        actions.push({
          type: 'tool',
          title: '读取 MCP 笔记',
          toolName: 'mcp.notes.notes.read',
          toolArguments: { key: 'agent-note' },
        });
      } else {
        actions.push({
          type: 'tool',
          title: '列出 MCP 笔记',
          toolName: 'mcp.notes.notes.list',
          toolArguments: {},
        });
      }
    }
  }

  // Avoid re-running tools that already succeeded in this task.
  const completedTools = new Set(
    history
      .filter((step) => step.type === 'tool' && step.ok && step.toolName)
      .map((step) => `${step.toolName}:${JSON.stringify(step.toolArguments ?? {})}`),
  );
  const pending = actions.filter((action) => {
    if (action.type !== 'tool') return true;
    return !completedTools.has(`${action.toolName}:${JSON.stringify(action.toolArguments ?? {})}`);
  });

  if (!pending.length) {
    const summary = history
      .filter((step) => step.type === 'tool')
      .map((step) => `${step.title}: ${step.ok ? 'ok' : 'failed'}`)
      .join('；') || context.toolContext || '未匹配到可执行工具，已完成规划。';
    return [{ type: 'finish', title: '完成任务', result: summary }];
  }

  return pending.slice(0, 4);
}

function extractUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s]+/i) ?? text.match(/\b([a-z0-9-]+\.)+[a-z]{2,}(\/[^\s]*)?/i);
  return match?.[0] ?? null;
}

function inferSiteUrl(goal: string): string | null {
  if (/github/i.test(goal)) return 'https://github.com';
  if (/deepseek/i.test(goal)) return 'https://chat.deepseek.com';
  if (/kimi/i.test(goal)) return 'https://www.kimi.com';
  if (/google|谷歌/i.test(goal)) return 'https://www.google.com';
  if (/bing/i.test(goal)) return 'https://www.bing.com';
  return null;
}

function extractQuoted(text: string): string | null {
  const match = text.match(/[“"']([^”"']+)[”"']/u);
  return match?.[1]?.trim() || null;
}

function extractClickTarget(goal: string): string | null {
  const afterClick = goal.match(/(?:点击|click)\s*[“"']([^”"']+)[”"']/iu);
  if (afterClick?.[1]) return afterClick[1].trim();
  const quoted = [...goal.matchAll(/[“"']([^”"']+)[”"']/gu)].map((match) => match[1]?.trim()).filter(Boolean);
  if (quoted.length > 1) return quoted[quoted.length - 1] ?? null;
  if (quoted.length === 1 && !/输入|填写|type/u.test(goal)) return quoted[0] ?? null;
  const fallback = goal.replace(/.*(点击|click)\s*/iu, '').trim();
  return fallback && fallback !== goal ? fallback : null;
}

function findLatestSnapshot(history: AgentStep[]): unknown {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const step = history[index];
    if (step?.type === 'tool' && step.ok && step.toolName === 'browser.snapshot') {
      return step.toolResult;
    }
  }
  return null;
}

function findElementRef(snapshot: unknown, rolesOrTags: string[]): string | undefined {
  const elements = getSnapshotElements(snapshot);
  const normalized = rolesOrTags.map((item) => item.toLowerCase());
  const match = elements.find((element) => {
    const role = String(element.role ?? '').toLowerCase();
    const tag = String(element.tag ?? '').toLowerCase();
    const type = String(element.inputType ?? '').toLowerCase();
    return normalized.some((token) => role.includes(token) || tag.includes(token) || type.includes(token));
  });
  return typeof match?.ref === 'string' ? match.ref : undefined;
}

function findElementRefByName(snapshot: unknown, text: string): string | undefined {
  const elements = getSnapshotElements(snapshot);
  const needle = text.toLowerCase();
  const match = elements.find((element) => String(element.name ?? '').toLowerCase().includes(needle));
  return typeof match?.ref === 'string' ? match.ref : undefined;
}

function getSnapshotElements(snapshot: unknown): Array<Record<string, unknown>> {
  if (!snapshot || typeof snapshot !== 'object') return [];
  const elements = (snapshot as { elements?: unknown }).elements;
  if (!Array.isArray(elements)) return [];
  return elements.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object');
}
