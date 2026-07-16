import assert from 'node:assert/strict';
import test from 'node:test';
import { formatMemorySaveStatus, formatToolContinuationFailure } from '../src/tool-status.js';

test('formats an automatic memory save as a complete visible result', () => {
  assert.equal(
    formatMemorySaveStatus({ ok: true, result: { saved: 2, candidates: 0, rejected: 1 } }),
    '记忆处理完成：已保存 2 条，1 条未保存。',
  );
});

test('distinguishes real conflicts from saved and rejected items', () => {
  assert.equal(
    formatMemorySaveStatus({
      ok: true,
      result: { saved: 1, candidates: 2, rejected: 0, items: [{ status: 'conflict' }, { status: 'conflict' }] },
    }),
    '记忆处理完成：已保存 1 条，2 条存在冲突，需确认。',
  );
  assert.equal(
    formatMemorySaveStatus({
      ok: true,
      result: { saved: 0, candidates: 1, rejected: 0, items: [{ status: 'pending_confirmation' }] },
    }),
    '记忆处理完成：1 条待确认。',
  );
  assert.equal(formatMemorySaveStatus({ ok: false, error: '工具不可用' }), '记忆保存失败：工具不可用');
});

test('renders a visible fallback when a tool continuation cannot be sent', () => {
  assert.equal(
    formatToolContinuationFailure(
      'web_search',
      { ok: true, result: { count: 2 } },
      'Kimi 输入框中已有未发送内容，请先处理草稿',
    ),
    '工具 web_search 已执行，但 AI 未能继续回复：Kimi 输入框中已有未发送内容，请先处理草稿',
  );
  assert.equal(
    formatToolContinuationFailure('memory.save_batch', { ok: false, error: '来源校验失败' }, 'ignored'),
    '记忆处理失败：来源校验失败',
  );
});
