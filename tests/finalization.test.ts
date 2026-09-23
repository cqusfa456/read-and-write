import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureCurrentSegment, finalizeSegment } from '../src/services/finalization.ts';
import type { SegmentRow } from '../src/db/queries.ts';
import { isoAt } from '../src/utils/time.ts';
import { addSubmission, addVote, seedRound, setVoteCount, setup } from './harness.ts';

const NOW = Date.parse('2026-09-23T16:30:00.000Z'); // UTC+8 2026-09-24 00:30，Day 1 已过期

test('Canon = 票数最高，且结算时以 votes 表实时重算（不信 vote_count 缓存）', async () => {
  const t = setup();
  seedRound(t, NOW, -60_000); // closes_at 已过
  addSubmission(t, 'sub-a', 'u1', '2026-09-23T02:00:00.000Z');
  addSubmission(t, 'sub-b', 'u2', '2026-09-23T03:00:00.000Z');
  setVoteCount(t, 'sub-a', 99); // 缓存是假的：sub-a 真实 0 票
  addVote(t, 'v1', 'sub-b', 'u1', '2026-09-23T05:00:00.000Z'); // sub-b 真实 1 票

  await finalizeSegment(t.db, 'g1', NOW);
  const seg = await t.db.prepare(`SELECT * FROM segments WHERE id = 'g1'`).bind().first<SegmentRow>();
  assert.equal(seg?.status, 'finalized');
  assert.equal(seg?.canonical_submission_id, 'sub-b');
});

test('平票时创建更早的投稿优先（plan §15）', async () => {
  const t = setup();
  seedRound(t, NOW, -60_000);
  addSubmission(t, 'sub-late', 'u2', '2026-09-23T13:20:00.000Z');
  addSubmission(t, 'sub-early', 'u1', '2026-09-23T12:01:00.000Z');
  addVote(t, 'v1', 'sub-late', 'u1', '2026-09-23T14:00:00.000Z');
  addVote(t, 'v2', 'sub-early', 'u2', '2026-09-23T14:00:00.000Z');

  await finalizeSegment(t.db, 'g1', NOW);
  const seg = await t.db.prepare(`SELECT * FROM segments WHERE id = 'g1'`).bind().first<SegmentRow>();
  assert.equal(seg?.canonical_submission_id, 'sub-early');
});

test('空回合：Canon = NULL，下一天照常开启（plan §16）', async () => {
  const t = setup();
  seedRound(t, NOW, -60_000);
  await finalizeSegment(t.db, 'g1', NOW);
  const seg = await t.db.prepare(`SELECT * FROM segments WHERE id = 'g1'`).bind().first<SegmentRow>();
  assert.equal(seg?.status, 'finalized');
  assert.equal(seg?.canonical_submission_id, null);
  const next = await t.db.prepare(`SELECT * FROM segments WHERE day = 2`).bind().first<SegmentRow>();
  assert.equal(next?.story_id, 's1');
  assert.equal(next?.parent_segment_id, 'g1');
  assert.equal(next?.status, 'open');
  assert.equal(next?.opened_at, seg?.closes_at);
});

test('未到期不结算（plan §13）', async () => {
  const t = setup();
  seedRound(t, NOW, 3_600_000); // 一小时后才截止
  await finalizeSegment(t.db, 'g1', NOW);
  const seg = await t.db.prepare(`SELECT * FROM segments WHERE id = 'g1'`).bind().first<SegmentRow>();
  assert.equal(seg?.status, 'open');
  const days = await t.db.prepare(`SELECT COUNT(*) AS n FROM segments`).bind().first<{ n: number }>();
  assert.equal(days?.n, 1);
});

test('并发 Finalization：只有一个 Canon、只有一个 Day 2（plan §14 / §48）', async () => {
  const t = setup();
  seedRound(t, NOW, -60_000);
  addSubmission(t, 'sub-a', 'u1', '2026-09-23T02:00:00.000Z');
  addVote(t, 'v1', 'sub-a', 'u2', '2026-09-23T04:00:00.000Z');

  await Promise.all([finalizeSegment(t.db, 'g1', NOW), finalizeSegment(t.db, 'g1', NOW)]);

  const next = await t.db.prepare(`SELECT * FROM segments WHERE day = 2`).bind().all<SegmentRow>();
  assert.equal(next.results.length, 1);
  const seg = await t.db.prepare(`SELECT * FROM segments WHERE id = 'g1'`).bind().first<SegmentRow>();
  assert.equal(seg?.canonical_submission_id, 'sub-a');
  // 数据库层面再兜底：(story_id, day) 唯一索引不允许两个 Day 2（Invariant 7）
  assert.throws(() =>
    t.sqlite
      .prepare(`INSERT INTO segments (id, story_id, day, opened_at, closes_at, status, created_at) VALUES ('dup','s1',2,?,?, 'open', ?)`)
      .run(isoAt(NOW), isoAt(NOW + 1), isoAt(NOW)),
  );
});

test('Lazy Finalization 补结闲置多日（plan §12 / §16）', async () => {
  const t = setup();
  seedRound(t, NOW, -2 * 86_400_000); // Day 1 在两天前就截止了
  const cur = await ensureCurrentSegment(t.db, 's1', NOW);
  assert.equal(cur?.day, 4); // Day 1–3 空转补结，Day 4 开放
  assert.equal(cur?.status, 'open');
  const all = await t.db.prepare(`SELECT day, status, canonical_submission_id FROM segments ORDER BY day`).bind().all();
  assert.equal(all.results.length, 4);
  for (const row of all.results.slice(0, 3) as Array<Record<string, unknown>>) {
    assert.equal(row.status, 'finalized');
    assert.equal(row.canonical_submission_id, null);
  }
});

test('force 结算用于管理员手动处理异常回合（plan §38–§39）', async () => {
  const t = setup();
  seedRound(t, NOW, 3_600_000); // 未到期
  await finalizeSegment(t.db, 'g1', NOW, true);
  const seg = await t.db.prepare(`SELECT * FROM segments WHERE id = 'g1'`).bind().first<SegmentRow>();
  assert.equal(seg?.status, 'finalized');
});
