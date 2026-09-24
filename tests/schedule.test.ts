import assert from 'node:assert/strict';
import test from 'node:test';
import { SQL, type SegmentRow } from '../src/db/queries.ts';
import { updateStoryFields } from '../src/services/story.ts';
import { addSubmission, seedRound, setup } from './harness.ts';

const NOW = Date.parse('2026-09-23T04:00:00.000Z');

test('Day 编号由开始日期决定：设置开始日期后重建 Day 1', async () => {
  const t = setup();
  seedRound(t, NOW); // g1 是"今天"的段，day=1 但窗口不对
  const res = await updateStoryFields(
    t.db,
    's1',
    { title: '铅字中毒者', opening: '开篇', start: '2026-10-01', end: '2026-10-07' },
    NOW,
  );
  assert.equal(res.ok, true);
  const seg = await t.db.prepare(SQL.latestSegment).bind('s1').first<SegmentRow>();
  assert.equal(seg?.day, 1);
  assert.equal(seg?.opened_at, '2026-09-30T16:00:00.000Z'); // 10.1 00:00 UTC+8
  assert.equal(seg?.closes_at, '2026-10-01T16:00:00.000Z'); // 10.1 24:00 UTC+8
  const count = await t.db.prepare(`SELECT COUNT(*) AS n FROM segments`).bind().first<{ n: number }>();
  assert.equal(count?.n, 1); // 旧段链已清空重建
});

test('已有投稿时禁止修改开始日期（保护 Day 编号与数据）', async () => {
  const t = setup();
  seedRound(t, NOW);
  addSubmission(t, 'sub-a', 'u1', '2026-09-23T01:00:00.000Z');
  const res = await updateStoryFields(
    t.db,
    's1',
    { title: 'x', opening: 'y', start: '2026-10-01', end: null },
    NOW,
  );
  assert.equal(res.ok, false);
  assert.equal(res.ok === false && res.status, 400);
  // 开始日期不变时，标题/开篇/截止日照常可改
  const ok = await updateStoryFields(
    t.db,
    's1',
    { title: '新标题', opening: '新开篇', start: null, end: '2026-12-31' },
    NOW,
  );
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.story.title, '新标题');
    assert.equal(ok.story.end_date, '2026-12-31');
  }
});
