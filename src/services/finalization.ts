import { CONFIG } from '../config.ts';
import { SQL, type DB, type SegmentRow, type StoryRow } from '../db/queries.ts';
import { dateEndMs, isoAt, msAt, windowAfter } from '../utils/time.ts';

/**
 * Finalization（plan §13–§16）：结算一个已到期回合。
 * 并发安全（plan §14）：先做 open → finalizing 的条件 UPDATE，affected_rows = 0 的请求直接退出，
 * 保证只有一个 Canon、只创建一个下一 Segment（Invariants 6/7）。
 * 排期：到达故事截止日 24:00（UTC+8）后不再创建新回合。
 */
export async function finalizeSegment(db: DB, segmentId: string, nowMs: number, force = false): Promise<void> {
  const seg = await db.prepare(SQL.segmentById).bind(segmentId).first<SegmentRow>();
  if (!seg) return;
  if (!force && nowMs < msAt(seg.closes_at)) return;
  const claim = await db
    .prepare(force ? SQL.claimSegmentForce : SQL.claimSegment)
    .bind(...(force ? [segmentId] : [segmentId, isoAt(nowMs)]))
    .run();
  if (claim.meta.changes === 0) return; // 已被其他请求结算 / 已结算（Invariants 1/6）
  // 票数以 votes 表实时重算为准（plan §21）；平票取创建更早的投稿（plan §15）
  const winner = await db.prepare(SQL.winnerOfSegment).bind(segmentId).first<{ id: string }>();
  const next = windowAfter(seg.closes_at);
  await db.prepare(SQL.finishSegment).bind(winner?.id ?? null, seg.id).run();
  // 没有有效投稿 → Canon = NULL，下一天照常开启、从上一 Canon 继续（plan §16）
  const story = await db.prepare(SQL.storyById).bind(seg.story_id).first<StoryRow>();
  const pastSchedule = Boolean(story?.end_date) && msAt(next.openedAt) >= dateEndMs(story!.end_date!);
  if (pastSchedule) return; // 排期结束：之后不再开放
  await db
    .prepare(SQL.insertSegment)
    .bind(crypto.randomUUID(), seg.story_id, seg.day + 1, seg.id, next.openedAt, next.closesAt, isoAt(nowMs))
    .run();
}

/**
 * Lazy Finalization（plan §12）：不依赖 Cron，请求到来时发现过期就补结算。
 * 长期无人访问时逐日补结（空回合 Canon = NULL），单次请求最多 CATCHUP_MAX_STEPS 天。
 */
export async function ensureCurrentSegment(db: DB, storyId: string, nowMs: number): Promise<SegmentRow | null> {
  for (let i = 0; i < CONFIG.CATCHUP_MAX_STEPS; i++) {
    const seg = await db.prepare(SQL.latestSegment).bind(storyId).first<SegmentRow>();
    if (!seg || nowMs < msAt(seg.closes_at)) return seg;
    await finalizeSegment(db, seg.id, nowMs);
    const after = await db.prepare(SQL.latestSegment).bind(storyId).first<SegmentRow>();
    if (!after || after.id === seg.id) return after; // 他人正在结算（finalizing），本次不再推进
  }
  return await db.prepare(SQL.latestSegment).bind(storyId).first<SegmentRow>();
}
