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

  if (/输入|填写|type/u.test(goal)) {
    const value = extractQuoted(goal) || goal.replace(/.*(输入|填写|type)\s*/u, '').trim();
    if (value) {
      actions.push({
        type: 'tool',
        title: '向页面输入文本',
        toolName: 'browser.type',
        toolArguments: {
          selector: 'input, textarea, [contenteditable="true"]',
          value,
          clear: true,
        },
      });
    }
  }

  if (/点击|click/u.test(goal)) {
    const text = extractQuoted(goal) || goal.replace(/.*(点击|click)\s*/u, '').trim();
    actions.push({
      type: 'tool',
      title: '点击页面元素',
      toolName: 'browser.click',
      toolArguments: text ? { text } : { selector: 'button, a, [role="button"]' },
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
