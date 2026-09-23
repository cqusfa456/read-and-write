import { CONFIG } from '../config.ts';

/** 字符计数（plan §18）：MVP 用 Array.from 计数；需要 grapheme 级再换 Intl.Segmenter。 */
export function countChars(text: string): number {
  return Array.from(text).length;
}

/**
 * 投稿内容校验（plan §17）：长度由服务器重新计算，绝不相信客户端传来的 character_count。
 */
export function validateContent(content: unknown): { ok: true; count: number } | { ok: false; error: string } {
  if (typeof content !== 'string' || content.trim() === '') {
    return { ok: false, error: '内容不能为空' };
  }
  const count = countChars(content);
  if (count < CONFIG.MIN_CHARS) {
    return { ok: false, error: `内容太短：${count} 字（至少 ${CONFIG.MIN_CHARS} 字）` };
  }
  if (count > CONFIG.MAX_CHARS) {
    return { ok: false, error: `内容太长：${count} 字（最多 ${CONFIG.MAX_CHARS} 字）` };
  }
  return { ok: true, count };
}
