import { CONFIG } from '../config.ts';
import { SQL, type DB, type SegmentRow, type SubmissionRow } from '../db/queries.ts';
import { validateContent } from '../utils/text.ts';
import { isoAt, msAt } from '../utils/time.ts';

export type ServiceResult<T> = ({ ok: true } & T) | { ok: false; status: number; error: string };

/** 投稿流程（plan §19）：状态、时间、字符数全部由服务器判断。 */
export async function createSubmission(
  db: DB,
  userId: string,
  segmentId: string,
  content: unknown,
  nowMs: number,
): Promise<ServiceResult<{ submission: SubmissionRow }>> {
  const check = validateContent(content); // 服务器重新计算字符数（plan §17）
  if (!check.ok) return { ok: false, status: 400, error: check.error };
  const seg = await db.prepare(SQL.segmentById).bind(segmentId).first<SegmentRow>();
  if (!seg) return { ok: false, status: 404, error: '回合不存在' };
  // 只有 open 且未到 closes_at 才能投稿（plan §3）
  if (seg.status !== 'open' || nowMs >= msAt(seg.closes_at)) {
    return { ok: false, status: 403, error: '本回合已结束' };
  }
  if (!CONFIG.ALLOW_MULTIPLE_SUBMISSIONS_PER_SEGMENT) {
    const mine = await db.prepare(SQL.countMySubmissions).bind(segmentId, userId).first<{ n: number }>();
    if ((mine?.n ?? 0) > 0) return { ok: false, status: 409, error: '本回合已提交过投稿' };
  }
  const id = crypto.randomUUID();
  await db
    .prepare(SQL.insertSubmission)
    .bind(id, segmentId, userId, content, check.count, isoAt(nowMs))
    .run();
  const submission = await db.prepare(SQL.submissionById).bind(id).first<SubmissionRow>();
  return { ok: true, submission: submission! };
}
