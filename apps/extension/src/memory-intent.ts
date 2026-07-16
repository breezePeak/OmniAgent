const FILE_TARGET = '(?:文件|附件|文档|PDF|DOCX|TXT|考题|题库|试题|题目|答案|清单)';
const MEMORY_TARGET = '(?:文件|附件|文档|PDF|DOCX|TXT|考题|题库|试题|题目|答案|清单|聊天|对话|内容|文字|资料)';
const SAVE_VERB = '(?:记住|记下|记牢|记忆|保存|存下|存起来|存入|导入|写入|加入)';

const NEGATED_SAVE = new RegExp(
  `(?:不要|别|无需|不用|取消|停止|暂时不要|先不要)(?:再|进行)?(?:把|将|帮我|给我|替我)?(?:这个|这些|该|当前|全部|所有|任何|这段|这份)?${MEMORY_TARGET}?${SAVE_VERB}`,
  'iu',
);
const DENIED_SAVE_REQUEST = new RegExp(
  `(?:我)?(?:没|没有|并没有|不是)(?:要|让你|叫你|要求你).{0,24}${SAVE_VERB}`,
  'iu',
);
const FILE_THEN_SAVE = new RegExp(`${FILE_TARGET}.{0,40}${SAVE_VERB}`, 'iu');
const SAVE_THEN_FILE = new RegExp(`${SAVE_VERB}.{0,40}${FILE_TARGET}`, 'iu');

/** True only for an instruction that asks OmniAgent to persist attached/file content. */
export function isFileMemoryCommand(text: string): boolean {
  const normalized = text.trim();
  if (!normalized || isNegatedMemoryCommand(normalized)) return false;
  return FILE_THEN_SAVE.test(normalized) || SAVE_THEN_FILE.test(normalized);
}

/** “全部保存” inherits its target from the active conversation or staged files. */
export function isBulkMemoryCommand(text: string): boolean {
  const normalized = text.trim();
  if (!normalized || isNegatedMemoryCommand(normalized)) return false;
  return /(?:全部|全都|所有|都).{0,16}(?:保存|记住|记下|记牢|记忆|存下|存起来|存入)/u.test(normalized)
    || /(?:保存|记住|记下|记牢|记忆|存下|存起来|存入).{0,16}(?:全部|全都|所有|都)/u.test(normalized);
}

/**
 * Detect an explicit save request without treating noun phrases such as
 * “我的记忆有问题” or “怎么查看记忆” as write commands.
 */
export function isExplicitMemoryCommand(text: string): boolean {
  const normalized = text.trim();
  if (!normalized || isNegatedMemoryCommand(normalized)) return false;
  return isFileMemoryCommand(normalized)
    || isBulkMemoryCommand(normalized)
    || /(?:请|帮我|替我|给我|麻烦)(?:把|将)?(?:记住|记下|记牢|记忆).{1,180}/u.test(normalized)
    || /(?:请|帮我|替我|给我|麻烦)?(?:把|将)?.{1,180}(?:保存|写入|加入|存入)(?:到|进)?(?:长期)?记忆/u.test(normalized)
    || /(?:你|以后)(?:一定|务必|必须|要|得).{0,8}(?:记住|记下|记牢).{1,180}/u.test(normalized)
    || /^(?:记住|记下|记牢)(?:[：:，,\s]|这个|这些|这段|以下|以上|上面|上述|前面|当前|刚才|我).{1,180}/u.test(normalized)
    || /^.{1,180}[，,\s](?:请)?(?:记住|记下|记牢)[！!。\s]*$/u.test(normalized);
}

/**
 * An explicit command whose object is supplied by the immediately preceding
 * turn or attachment instead of repeated in the current sentence.
 */
export function isContextualMemoryCommand(text: string): boolean {
  const normalized = text.trim();
  if (!isExplicitMemoryCommand(normalized)) return false;
  return /(?:我.{0,8}让你|刚才|之前|前面|上面|上述|以上|这些|这个|这份|这段|当前(?:聊天|对话|内容)|那个|它|跨(?:对话|会话)|永久|长期)/u.test(normalized)
    || /^(?:请|帮我|给我|替我)?(?:保存|存入|写入)(?:到|进)?(?:长期)?记忆(?:里|中)?/u.test(normalized);
}

/** Read the real user sentence back out of a provider-rendered augmented prompt. */
export function userFacingMemoryCommandText(text: string): string {
  const marker = '用户当前问题：';
  const index = text.lastIndexOf(marker);
  return index >= 0 ? text.slice(index + marker.length).trim() : text.trim();
}

export function isNegatedMemoryCommand(text: string): boolean {
  const normalized = text.trim();
  return NEGATED_SAVE.test(normalized) || DENIED_SAVE_REQUEST.test(normalized);
}
