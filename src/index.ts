import { SQL, type DB, type UserRow } from './db/queries.ts';
import { cookieValue, verifySession } from './services/auth.ts';
import { apiError, originOk } from './utils/validation.ts';
import type { Ctx } from './api/common.ts';
import * as auth from './api/auth.ts';
import * as story from './api/story.ts';
import * as submission from './api/submission.ts';
import * as vote from './api/vote.ts';
import * as admin from './api/admin.ts';

interface Env {
  DB: DB;
  ASSETS: { fetch(request: Request): Promise<Response> };
  SESSION_SECRET?: string;
}

type Handler = (ctx: Ctx, request: Request, params: Record<string, string>) => Promise<Response> | Response;

const routes: Array<[string, string, Handler]> = [
  ['GET', '/api/stories', (ctx) => story.listStories(ctx)],
  ['POST', '/api/admin/stories', admin.createStory],
  ['PATCH', '/api/admin/stories/:id', (ctx, req, p) => admin.updateStory(ctx, req, p)],
  ['GET', '/api/stories/:id', (ctx, _req, p) => story.getStory(ctx, p)],
  ['GET', '/api/stories/:id/current', (ctx, _req, p) => story.getCurrent(ctx, p)],
  ['GET', '/api/stories/:id/history', (ctx, _req, p) => story.getHistory(ctx, p)],
  ['GET', '/api/stories/:id/segments', (ctx, _req, p) => admin.listSegments(ctx, p)],
  ['GET', '/api/segments/:id/submissions', (ctx, _req, p) => submission.listBySegment(ctx, p)],
  ['POST', '/api/submissions', (ctx, req) => submission.create(ctx, req)],
  ['POST', '/api/votes', (ctx, req) => vote.create(ctx, req)],
  ['DELETE', '/api/votes/:submission_id', (ctx, req, p) => vote.remove(ctx, req, p)],
  ['POST', '/api/auth/register', auth.register],
  ['POST', '/api/auth/login', auth.login],
  ['POST', '/api/auth/logout', () => auth.logout()],
  ['GET', '/api/auth/me', (ctx) => auth.me(ctx)],
  ['GET', '/api/admin/submissions', (ctx, req) => admin.listSubmissions(ctx, req)],
  ['POST', '/api/admin/submissions/:id/remove', (ctx, _req, p) => admin.removeSubmission(ctx, p)],
  ['GET', '/api/admin/users', (ctx) => admin.listUsers(ctx)],
  ['POST', '/api/admin/reset', (ctx) => admin.reset(ctx)],
  ['POST', '/api/admin/segments/:id/finalize', (ctx, _req, p) => admin.finalizeNow(ctx, p)],
];

function matchRoute(pattern: string, pathname: string): Record<string, string> | null {
  const pp = pattern.split('/');
  const sp = pathname.split('/');
  if (pp.length !== sp.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pp.length; i++) {
    if (pp[i].startsWith(':')) params[pp[i].slice(1)] = decodeURIComponent(sp[i]);
    else if (pp[i] !== sp[i]) return null;
  }
  return params;
}

// ponytail: 内存滑动窗口限流，按隔离实例各自计数（plan §29 的"简单版本"）；
// 并发量上来后换 Cloudflare Rate Limiting / Durable Objects，不要加 Redis。
const hits = new Map<string, number[]>();
function rateLimited(key: string, nowMs: number): boolean {
  const windowMs = 60_000;
  const max = 20;
  const arr = (hits.get(key) ?? []).filter((t) => t > nowMs - windowMs);
  arr.push(nowMs);
  hits.set(key, arr);
  return arr.length > max;
}

const LIMITED_POSTS = new Set(['/api/submissions', '/api/votes', '/api/auth/login', '/api/auth/register']);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      const nowMs = Date.now();
      const method = request.method.toUpperCase();
      if (method !== 'GET' && method !== 'HEAD' && !originOk(request)) {
        return apiError('跨站请求被拒绝', 403);
      }
      if (method === 'POST' && LIMITED_POSTS.has(url.pathname)) {
        const ip = request.headers.get('cf-connecting-ip') ?? 'local';
        if (rateLimited(`${ip}:${url.pathname}`, nowMs)) return apiError('请求过于频繁，请稍后再试', 429);
      }
      const secret = env.SESSION_SECRET ?? 'dev-only-secret-change-me';
      let user: Ctx['user'] = null;
      const token = cookieValue(request, 'sid');
      if (token) {
        const uid = await verifySession(token, secret, nowMs);
        if (uid) {
          const row = await env.DB.prepare(SQL.userById).bind(uid).first<UserRow>();
          if (row) user = { id: row.id, username: row.username };
        }
      }
      const ctx: Ctx = { db: env.DB, secret, nowMs, user };
      for (const [m, pattern, handler] of routes) {
        if (m !== method) continue;
        const params = matchRoute(pattern, url.pathname);
        if (params) return await handler(ctx, request, params);
      }
      return apiError('接口不存在', 404);
    } catch (err) {
      console.error(err);
      return apiError('服务器错误', 500);
    }
  },
};
