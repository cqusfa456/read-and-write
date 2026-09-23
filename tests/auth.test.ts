import assert from 'node:assert/strict';
import test from 'node:test';
import { hashPassword, makeSession, verifyPassword, verifySession } from '../src/services/auth.ts';

const NOW = Date.parse('2026-09-23T04:00:00.000Z');
const SECRET = 'test-secret';

test('密码哈希：正确密码通过、错误密码拒绝、不同盐不同哈希', async () => {
  const h1 = await hashPassword('correct horse');
  const h2 = await hashPassword('correct horse');
  assert.notEqual(h1, h2, '每次随机盐');
  assert.equal(await verifyPassword('correct horse', h1), true);
  assert.equal(await verifyPassword('wrong horse', h1), false);
  assert.equal(await verifyPassword('correct horse', 'garbage'), false);
});

test('Session：合法令牌通过，篡改/过期拒绝', async () => {
  const token = await makeSession('u1', SECRET, NOW);
  assert.equal(await verifySession(token, SECRET, NOW), 'u1');
  assert.equal(await verifySession(token + 'x', SECRET, NOW), null);
  assert.equal(await verifySession(token, 'other-secret', NOW), null);
  const expired = await makeSession('u1', SECRET, NOW - 31 * 86_400_000);
  assert.equal(await verifySession(expired, SECRET, NOW), null);
});
