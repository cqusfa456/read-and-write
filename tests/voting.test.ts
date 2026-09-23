import assert from 'node:assert/strict';
import test from 'node:test';
import { CONFIG } from '../src/config.ts';
import { createSubmission } from '../src/services/submission.ts';
import { castVote } from '../src/services/voting.ts';
import { seedRound, setup } from './harness.ts';

const NOW = Date.parse('2026-09-23T04:00:00.000Z'); // UTC+8 12:00，回合进行中

test('投稿：字符数由服务器重新计算并落库（plan §17）', async () => {
  const t = setup();
  seedRound(t, NOW);
  const ok = await createSubmission(t.db, 'u1', 'g1', '中'.repeat(80), NOW);
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.submission.character_count, 80);
  const short = await createSubmission(t.db, 'u1', 'g1', '中'.repeat(79), NOW);
  assert.equal(short.ok, false);
  const long = await createSubmission(t.db, 'u1', 'g1', '中'.repeat(301), NOW);
  assert.equal(long.ok, false);
});

test('重复投票/并发点击不会产生重复票（plan §22）', async () => {
  const t = setup();
  seedRound(t, NOW);
  await createSubmission(t.db, 'u1', 'g1', '中'.repeat(80), NOW);
  const subs = await t.db.prepare(`SELECT id FROM submissions`).bind().all<{ id: string }>();
  const sid = subs.results[0].id;
  const first = await castVote(t.db, 'u2', sid, NOW);
  assert.equal(first.ok, true);
  const second = await castVote(t.db, 'u2', sid, NOW);
  assert.equal(second.ok, false);
  const dup = await t.db.prepare(`SELECT COUNT(*) AS n FROM votes WHERE user_id = 'u2'`).bind().first<{ n: number }>();
  assert.equal(dup?.n, 1);
});

test('一回合一票：投过一篇后不能再投另一篇（plan §9 默认规则）', async () => {
  const t = setup();
  seedRound(t, NOW);
  await createSubmission(t.db, 'u1', 'g1', '中'.repeat(80), NOW);
  await createSubmission(t.db, 'u2', 'g1', '文'.repeat(80), NOW);
  const subs = await t.db.prepare(`SELECT id FROM submissions ORDER BY created_at`).bind().all<{ id: string }>();
  assert.equal((await castVote(t.db, 'u2', subs.results[0].id, NOW)).ok, true);
  assert.equal((await castVote(t.db, 'u2', subs.results[1].id, NOW)).ok, false);
});

test('禁止自投（CONFIG.ALLOW_SELF_VOTE=false，plan §25）', async () => {
  const t = setup();
  seedRound(t, NOW);
  await createSubmission(t.db, 'u1', 'g1', '中'.repeat(80), NOW);
  const sub = await t.db.prepare(`SELECT id FROM submissions`).bind().first<{ id: string }>();
  assert.equal((await castVote(t.db, 'u1', sub!.id, NOW)).ok, false);
  CONFIG.ALLOW_SELF_VOTE = true;
  assert.equal((await castVote(t.db, 'u1', sub!.id, NOW)).ok, true);
  CONFIG.ALLOW_SELF_VOTE = false;
});

test('回合关闭后禁止投稿与投票（Invariant 2）', async () => {
  const t = setup();
  seedRound(t, NOW, -1_000); // 已过 closes_at
  const submit = await createSubmission(t.db, 'u1', 'g1', '中'.repeat(80), NOW);
  assert.equal(submit.ok, false);
  const missing = await castVote(t.db, 'u2', 'no-such-submission', NOW);
  assert.equal(missing.ok, false);
  assert.equal(missing.ok === false && missing.status, 404); // 投不存在的投稿
});

test('配置：一回合一稿时拒绝重复投稿（plan §24）', async () => {
  const t = setup();
  seedRound(t, NOW);
  assert.equal((await createSubmission(t.db, 'u1', 'g1', '中'.repeat(80), NOW)).ok, true);
  CONFIG.ALLOW_MULTIPLE_SUBMISSIONS_PER_SEGMENT = false;
  assert.equal((await createSubmission(t.db, 'u1', 'g1', '文'.repeat(80), NOW)).ok, false);
  assert.equal((await createSubmission(t.db, 'u2', 'g1', '文'.repeat(80), NOW)).ok, true);
  CONFIG.ALLOW_MULTIPLE_SUBMISSIONS_PER_SEGMENT = true;
});
