import type { MemoryType } from '@omni-agent/storage';

const SAVE_VERB = /(?:记住|记下|记牢|记忆|保存|存下|存起来|存入|导入|写入|加入)/u;
const REFERENTIAL_TARGET = /^(?:(?:这|那|该)(?:个|些|份|段)?|以下|以上|下面|上面|上述|刚才|之前|前面|当前|全部|所有|它)(?:的)?(?:内容|文字|资料|信息|文档|文件|附件|聊天|对话|答案|考题|试题|题目|题库|清单)?(?:全部|都)?$/u;

/** Extracts user-owned content from an explicit memory command. */
export function extractExplicitMemoryContent(text: string): string | null {
  const normalized = text.trim();
  if (!normalized || !SAVE_VERB.test(normalized)) return null;

  const delimiter = normalized.match(/[：:]/u);
  if (delimiter?.index !== undefined) {
    const prefix = normalized.slice(0, delimiter.index);
    const suffix = normalized.slice(delimiter.index + delimiter[0].length);
    if (SAVE_VERB.test(prefix)) {
      const content = cleanContent(suffix);
      if (content) return content;
    }
  }

  const saveToMemory = normalized.match(
    /^(?:请|麻烦)?(?:帮我|替我|给我)?(?:把|将)?\s*(.+?)\s*(?:保存|存下|存起来|存入|导入|写入|加入)(?:到|进)?(?:长期)?记忆(?:里|中)?[。！!\s]*$/u,
  );
  if (saveToMemory?.[1]) {
    const content = cleanContent(saveToMemory[1]);
    if (content) return content;
  }

  const remember = normalized.match(/(?:记住|记下|记牢)([\s\S]*)/u);
  if (remember?.[1]) {
    const content = cleanContent(remember[1]);
    if (content) return content;
  }

  const rememberTrailing = normalized.match(
    /^(?:请|麻烦)?(?:帮我|替我|给我)?(?:把|将)?\s*(.+?)\s*(?:记住|记下|记牢)[。！!\s]*$/u,
  );
  return rememberTrailing?.[1] ? cleanContent(rememberTrailing[1]) : null;
}

export function inferExplicitMemoryType(content: string): MemoryType {
  if (/我(?:喜欢|偏好|习惯|通常|不喜欢|讨厌)/u.test(content)
    || /(?:请|以后|今后).{0,80}(?:回复|回答|表达|格式|语言)/u.test(content)) return 'preference';
  if (/(?:本|这个|当前)项目/u.test(content) || /项目(?:使用|采用|要求|禁止|必须|约定)/u.test(content)) return 'project';
  if (/我(?:叫|是|的名字是|有|家有|正在使用|住在)/u.test(content)
    || /我的(?:职业|工作|孩子|家人|公司|团队|设备)/u.test(content)
    || /(?:朋友|孩子|宠物|家人|同事|客户|同学).{0,32}(?:叫|是|有)/u.test(content)) return 'profile';
  if (/(?:步骤|流程|操作方法|依次|首先.{0,120}然后)/u.test(content)) return 'procedure';
  return 'knowledge';
}

function cleanContent(value: string): string | null {
  const content = value
    .trim()
    .replace(/^[，,。！!；;\s]+/u, '')
    .replace(/^(?:一下|清楚|牢)[，,。！!；;\s]*/u, '')
    .replace(/^(?:以下|以上|下面)(?:内容|文字|资料|信息)[，,。！!；;\s]+/u, '')
    .replace(/[，,。！!；;\s]+$/u, '')
    .trim();
  if (!content || REFERENTIAL_TARGET.test(content)) return null;
  return content;
}
