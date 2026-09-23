import assert from 'node:assert/strict';
import test from 'node:test';
import { countChars, validateContent } from '../src/utils/text.ts';

// plan §46 Phase 4：79/80/81/299/300/301 + emoji/中文/英文/换行/空格/组合字符

test('中文按字计数', () => {
  assert.equal(countChars('你好世界'), 4);
});

test('英文、换行、空格都计入', () => {
  assert.equal(countChars('hello\nworld '), 12);
});

test('emoji / 组合字符按 plan §18 的 MVP 规则（Array.from 码点数）计数', () => {
  assert.equal(countChars('👨‍👩‍👧‍👦'), 7); // ZWJ 家庭 = 7 个码点
  assert.equal(countChars('é'), 1); // 预组合
  assert.equal(countChars('e\u0301'), 2); // 分解式组合字符
});

test('长度边界 79/80/81/299/300/301', () => {
  assert.equal(validateContent('中'.repeat(79)).ok, false);
  assert.equal(validateContent('中'.repeat(80)).ok, true);
  assert.equal(validateContent('中'.repeat(81)).ok, true);
  assert.equal(validateContent('中'.repeat(299)).ok, true);
  assert.equal(validateContent('中'.repeat(300)).ok, true);
  assert.equal(validateContent('中'.repeat(301)).ok, false);
});

test('空串/纯空白拒绝；计数以服务端计算为准', () => {
  assert.equal(validateContent('').ok, false);
  assert.equal(validateContent('   \n  ').ok, false);
  assert.equal(validateContent(123).ok, false);
  const result = validateContent('中'.repeat(80));
  assert.deepEqual(result, { ok: true, count: 80 });
});
