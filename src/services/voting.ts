import { CONFIG } from '../config.ts';
import { SQL, type DB, type SegmentRow, type SubmissionRow } from '../db/queries.ts';
import { isoAt, msAt } from '../utils/time.ts';
import type { ServiceResult } from './submission.ts';

/** 投票流程（plan §20–§22）：重复投票最终由 votes 表 UNIQUE 约束兜底。 */
export async function castVote(
  db: DB,
  userId: string,
  submissionId: string,
  nowMs: number,
): Promise<ServiceResult<{ voteCount: number }>> {
  const sub = await db.prepare(SQL.submissionById).bind(submissionId).first<SubmissionRow>();
  if (!sub || sub.status !== 'active') return { ok: false, status: 404, error: '投稿不存在或已下架' };
  const seg = await db.prepare(SQL.segmentById).bind(sub.segment_id).first<SegmentRow>();
  if (!seg) return { ok: false, status: 404, error: '回合不存在' };
  // vote.segment_id 恒取自 submission（Invariant 5）
  if (seg.status !== 'open' || nowMs >= msAt(seg.closes_at)) {
    return { ok: false, status: 403, error: '本回合已结束' };
  }
  if (!CONFIG.ALLOW_SELF_VOTE && sub.author_id === userId) {
    return { ok: false, status: 403, error: '不能给自己的投稿投票' };
  }
  const used = await db.prepare(SQL.voteCountByUser).bind(seg.id, userId).first<{ n: number }>();
  if ((used?.n ?? 0) >= CONFIG.VOTES_PER_USER_PER_SEGMENT) {
    return { ok: false, status: 409, error: '本回合已投过票' };
  }
  try {
    await db.prepare(SQL.insertVote).bind(crypto.randomUUID(), seg.id, sub.id, userId, isoAt(nowMs)).run();
  } catch {
    return { ok: false, status: 409, error: '本回合已投过票' }; // UNIQUE(segment_id, user_id) 兜底
  }
  await db.prepare(SQL.incVoteCount).bind(sub.id).run(); // vote_count 仅是显示缓存（plan §21）
  const fresh = await db.prepare(SQL.submissionById).bind(sub.id).first<SubmissionRow>();
  return { ok: true, voteCount: fresh?.vote_count ?? 0 };
}
