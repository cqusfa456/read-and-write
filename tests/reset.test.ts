import assert from 'node:assert/strict';
import test from 'node:test';
import { SQL, type SegmentRow } from '../src/db/queries.ts';
import { resetActivity } from '../src/services/story.ts';
import { createSubmission } from '../src/services/submission.ts';
import { castVote } from '../src/services/voting.ts';
import { seedRound, setup } from './harness.ts';

const NOW = Date.parse('2026-09-23T04:00:00.000Z');

test('一键清除活动数据：投稿/投票/回合一键清空并按排期重建 Day 1，用户保留', async () => {
  const t = setup();
  seedRound(t, NOW);
  const sub = await createSubmission(t.db, 'u1', 'g1', '中'.repeat(80), NOW);
  assert.equal(sub.ok, true);
  if (sub.ok) assert.equal((await castVote(t.db, 'u2', sub.submission.id, NOW)).ok, true);
  // 给故事设排期（无投稿限制之外的路径：直接写库模拟活动配置）
  t.sqlite.prepare(`UPDATE stories SET start_date = '2026-10-01', end_date = '2026-10-07' WHERE id = 's1'`).run();

  const res = await resetActivity(t.db, NOW);
  assert.equal(res.ok, true);

  const votes = await t.db.prepare(`SELECT COUNT(*) AS n FROM votes`).bind().first<{ n: number }>();
  const subs = await t.db.prepare(`SELECT COUNT(*) AS n FROM submissions`).bind().first<{ n: number }>();
  assert.equal(votes?.n, 0);
  assert.equal(subs?.n, 0);

  const seg = await t.db.prepare(SQL.latestSegment).bind('s1').first<SegmentRow>();
  assert.equal(seg?.day, 1);
  assert.equal(seg?.opened_at, '2026-09-30T16:00:00.000Z'); // Day 1 = 开始日 10.1（UTC+8）
  assert.equal(seg?.status, 'open');

  const users = await t.db.prepare(`SELECT COUNT(*) AS n FROM users`).bind().first<{ n: number }>();
  assert.equal(users?.n, 2); // 用户账号保留
});
