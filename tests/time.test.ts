import assert from 'node:assert/strict';
import test from 'node:test';
import { msAt, windowAfter, windowFor } from '../src/utils/time.ts';

// plan §44 Phase 2：UTC+8 业务日边界必须测 23:59:59 / 00:00:00 / 00:00:01

test('23:59:59.999（UTC+8）仍属于当天窗口', () => {
  const w = windowFor(Date.parse('2026-09-23T15:59:59.999Z'));
  assert.equal(w.openedAt, '2026-09-22T16:00:00.000Z');
  assert.equal(w.closesAt, '2026-09-23T16:00:00.000Z');
});

test('00:00:00（UTC+8）起属于新一天，closes_at 是排他边界', () => {
  const w = windowFor(Date.parse('2026-09-23T16:00:00.000Z'));
  assert.equal(w.openedAt, '2026-09-23T16:00:00.000Z');
  assert.equal(w.closesAt, '2026-09-24T16:00:00.000Z');
});

test('00:00:00.001（UTC+8）仍属新一天', () => {
  const w = windowFor(Date.parse('2026-09-23T16:00:00.001Z'));
  assert.equal(w.openedAt, '2026-09-23T16:00:00.000Z');
});

test('24:00:00 与次日 00:00:00 是同一时刻', () => {
  const day1 = windowFor(Date.parse('2026-09-23T03:00:00Z'));
  const day2 = windowAfter(day1.closesAt);
  assert.equal(day2.openedAt, day1.closesAt);
  assert.equal(msAt(day2.closesAt) - msAt(day2.openedAt), 86_400_000);
});

test('窗口恒为 24 小时且存储格式可直接字符串比较', () => {
  const w = windowFor(Date.parse('2026-12-31T10:00:00Z'));
  assert.equal(msAt(w.closesAt) - msAt(w.openedAt), 86_400_000);
  assert.ok(w.openedAt < w.closesAt, 'ISO 字符串序 == 时间序');
});
