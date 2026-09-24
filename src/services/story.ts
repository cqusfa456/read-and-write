import { SQL, type DB, type SegmentRow, type StoryRow } from '../db/queries.ts';
import { firstWindowOf, isoAt, windowFor } from '../utils/time.ts';
import type { ServiceResult } from './submission.ts';

/**
 * 故事维护（测试阶段，管理员）：标题/开篇/排期可改。
 * Day 编号由开始日期决定（开稿第一天 = Day 1）——因此开始日期变更时重建段链：
 * 已产生投稿则拒绝修改（避免编号错位毁数据），未产生投稿则清空段链重建 Day 1。
 */
export async function updateStoryFields(
  db: DB,
  storyId: string,
  fields: { title: string; opening: string; start: string | null; end: string | null },
  nowMs: number,
): Promise<ServiceResult<{ story: StoryRow }>> {
  const story = await db.prepare(SQL.storyById).bind(storyId).first<StoryRow>();
  if (!story) return { ok: false, status: 404, error: '故事不存在' };
  const scheduleChanged = fields.start !== story.start_date;
  if (scheduleChanged) {
    const has = await db.prepare(SQL.countStorySubmissions).bind(storyId).first<{ n: number }>();
    if ((has?.n ?? 0) > 0) {
      return { ok: false, status: 400, error: '已产生投稿，不能再修改开始日期（Day 编号会错位）' };
    }
  }
  await db.prepare(SQL.updateStory).bind(fields.title, fields.opening, fields.start, fields.end, storyId).run();
  if (scheduleChanged) {
    // 按 day 降序删除，满足 parent_segment_id 自引用外键
    const olds = await db.prepare(SQL.segmentsOfStory).bind(storyId).all<{ id: string }>();
    for (const row of olds.results) await db.prepare(SQL.deleteSegmentById).bind(row.id).run();
    const win = fields.start ? firstWindowOf(fields.start) : windowFor(nowMs);
    await db
      .prepare(SQL.insertSegment)
      .bind(crypto.randomUUID(), storyId, 1, null, win.openedAt, win.closesAt, isoAt(nowMs))
      .run();
  }
  const fresh = await db.prepare(SQL.storyById).bind(storyId).first<StoryRow>();
  return { ok: true, story: fresh! };
}

export type { SegmentRow };
