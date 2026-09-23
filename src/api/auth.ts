import { SQL, type UserRow } from '../db/queries.ts';
import { clearCookie, hashPassword, makeSession, sessionCookie, verifyPassword } from '../services/auth.ts';
import { isoAt } from '../utils/time.ts';
import { apiError, json, readJson, str } from '../utils/validation.ts';
import { isAdmin, type Ctx } from './common.ts';

const USERNAME_RE = /^[\p{L}\p{N}_-]{2,24}$/u;

function jsonWithCookie(data: unknown, cookie: string, status = 200): Response {
  const res = json(data, status);
  res.headers.set('set-cookie', cookie);
  return res;
}

function userJson(ctx: Ctx, id: string, username: string) {
  return { id, username, is_admin: isAdmin({ ...ctx, user: { id, username } }) };
}

export async function register(ctx: Ctx, request: Request): Promise<Response> {
  const body = await readJson(request);
  if (!body.ok) return body.response;
  const username = str(body.value.username, 'username', 24);
  if (!username.ok) return username.response;
  const password = str(body.value.password, 'password', 128);
  if (!password.ok) return password.response;
  if (!USERNAME_RE.test(username.value)) return apiError('用户名需为 2–24 位字母/数字/下划线/连字符');
  if (password.value.length < 8) return apiError('密码至少 8 位');
  const id = crypto.randomUUID();
  try {
    await ctx.db
      .prepare(SQL.insertUser)
      .bind(id, username.value, await hashPassword(password.value), isoAt(ctx.nowMs))
      .run();
  } catch {
    return apiError('用户名已被占用', 409);
  }
  const token = await makeSession(id, ctx.secret, ctx.nowMs);
  return jsonWithCookie(userJson(ctx, id, username.value), sessionCookie(token), 201);
}

export async function login(ctx: Ctx, request: Request): Promise<Response> {
  const body = await readJson(request);
  if (!body.ok) return body.response;
  const username = str(body.value.username, 'username', 24);
  if (!username.ok) return username.response;
  const password = str(body.value.password, 'password', 128);
  if (!password.ok) return password.response;
  const row = await ctx.db.prepare(SQL.userByUsername).bind(username.value).first<UserRow>();
  if (!row || !(await verifyPassword(password.value, row.password_hash))) {
    return apiError('用户名或密码错误', 401);
  }
  const token = await makeSession(row.id, ctx.secret, ctx.nowMs);
  return jsonWithCookie(userJson(ctx, row.id, row.username), sessionCookie(token));
}

export async function logout(): Promise<Response> {
  return jsonWithCookie({ ok: true }, clearCookie());
}

export async function me(ctx: Ctx): Promise<Response> {
  if (!ctx.user) return apiError('未登录', 401);
  return json(userJson(ctx, ctx.user.id, ctx.user.username));
}
