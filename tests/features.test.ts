import assert from 'node:assert/strict';
import test from 'node:test';
import { SQL, type SegmentRow } from '../src/db/queries.ts';
import { createSubmission } from '../src/services/submission.ts';
import { castVote, removeVote } from '../src/services/voting.ts';
import { ensureCurrentSegment, finalizeSegment } from '../src/services/finalization.ts';
import { addSubmission, seedRound, setup } from './harness.ts';

const NOW = Date.parse('2026-09-23T04:00:00.000Z'); // UTC+8 12:00，回合进行中

test('功能1：投稿按时间从新到旧排列', async () => {
  const t = setup();
  seedRound(t, NOW);
  addSubmission(t, 'sub-old', 'u1', '2026-09-23T01:00:00.000Z');
  addSubmission(t, 'sub-mid', 'u2', '2026-09-23T02:00:00.000Z');
  addSubmission(t, 'sub-new', 'u1', '2026-09-23T03:00:00.000Z');
  const { results } = await t.db.prepare(SQL.submissionsBySegment).bind('', 'g1').all<{ id: string }>();
  assert.deepEqual(results.map((r) => r.id), ['sub-new', 'sub-mid', 'sub-old']);
});

test('功能2：撤票后配额恢复、可改投其他投稿', async () => {
  const t = setup();
  seedRound(t, NOW);
  addSubmission(t, 'sub-a', 'u1', '2026-09-23T01:00:00.000Z');
  addSubmission(t, 'sub-b', 'u2', '2026-09-23T02:00:00.000Z');
  addSubmission(t, 'sub-c', 'u2', '2026-09-23T02:30:00.000Z');
  assert.equal((await castVote(t.db, 'u1', 'sub-b', NOW)).ok, true);
  const back = await removeVote(t.db, 'u1', 'sub-b', NOW);
  assert.equal(back.ok, true);
  if (back.ok) assert.equal(back.voteCount, 0);
  const again = await removeVote(t.db, 'u1', 'sub-b', NOW);
  assert.equal(again.ok, false); // 没有可撤销的投票
  assert.equal((await castVote(t.db, 'u1', 'sub-c', NOW)).ok, true); // 撤票后改投 sub-c
  const votes = await t.db.prepare(`SELECT COUNT(*) AS n FROM votes`).bind().first<{ n: number }>();
  assert.equal(votes?.n, 1);
});

test('功能3：排期未开始不收稿不收票（开始日 00:00 UTC+8 起）', async () => {
  const t = setup();
  seedRound(t, NOW);
  // g1 = 10.1 的窗口（2026-09-30T16:00Z 起）
  t.sqlite
    .prepare(`UPDATE segments SET opened_at = ?, closes_at = ? WHERE id = 'g1'`)
    .run('2026-09-30T16:00:00.000Z', '2026-10-01T16:00:00.000Z');
  const before = await createSubmission(t.db, 'u1', 'g1', '中'.repeat(80), NOW);
  assert.equal(before.ok, false);
  assert.equal(before.ok === false && before.status, 403);
  const voteBefore = await castVote(t.db, 'u1', 'sub-none', NOW);
  assert.equal(voteBefore.ok, false);
  // 10.1 00:00:00 UTC+8 整点起可投稿
  const atStart = Date.parse('2026-09-30T16:00:00.000Z');
  const after = await createSubmission(t.db, 'u1', 'g1', '中'.repeat(80), atStart);
  assert.equal(after.ok, true);
});

test('功能3：截止日 24:00 后不再开新回合', async () => {
  const t = setup();
  seedRound(t, NOW, -60_000); // g1 已过期
  t.sqlite.prepare(`UPDATE stories SET start_date = '2026-10-01', end_date = '2026-10-02' WHERE id = 's1'`).run();
  t.sqlite
    .prepare(`UPDATE segments SET opened_at = ?, closes_at = ?, status = 'open' WHERE id = 'g1'`)
    .run('2026-09-30T16:00:00.000Z', '2026-10-01T16:00:00.000Z'); // Day 1 = 10.1
  // 10.2 01:00 UTC+8 访问：Day 1 结算，Day 2（10.2）开启
  const now = Date.parse('2026-10-01T17:00:00.000Z');
  const cur = await ensureCurrentSegment(t.db, 's1', now);
  assert.equal(cur?.day, 2);
  assert.equal(cur?.status, 'open');
  // 10.3 访问：Day 2 结算，但排期已尽，不再创建 Day 3
  await finalizeSegment(t.db, cur!.id, Date.parse('2026-10-02T17:00:00.000Z'));
  const { results } = await t.db.prepare(`SELECT day, status FROM segments ORDER BY day`).bind().all();
  assert.equal(results.length, 2);
  for (const row of results as Array<SegmentRow>) assert.equal(row.status, 'finalized');
  const last = await t.db.prepare(SQL.latestSegment).bind('s1').first<SegmentRow>();
  assert.equal(last?.day, 2);
});
