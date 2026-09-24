import { SQL, type SegmentRow, type StoryRow, type UserRow } from '../db/queries.ts';
import { finalizeSegment } from '../services/finalization.ts';
import { updateStoryFields } from '../services/story.ts';
import { isoAt, firstWindowOf, windowFor } from '../utils/time.ts';
import { apiError, json, readJson, str } from '../utils/validation.ts';
import { isAdmin, segmentJson, submissionJson, type Ctx } from './common.ts';

function adminOnly(ctx: Ctx): Response | null {
  return isAdmin(ctx) ? null : apiError('无权限', 403);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 排期（功能3）：start_date/end_date 为 UTC+8 业务日（YYYY-MM-DD）；空 = 无排期（长期开放）。 */
function schedule(value: unknown, name: string): { ok: true; value: string | null } | { ok: false; response: Response } {
  if (value === undefined || value === null || value === '') return { ok: true, value: null };
  if (typeof value !== 'string' || !DATE_RE.test(value)) {
    return { ok: false, response: apiError(`排期日期需为 YYYY-MM-DD：${name}`) };
  }
  return { ok: true, value };
}

/** 管理员创建故事：写入 Opening 并创建 Day 1（plan §59 MVP 流程第一步）。 */
export async function createStory(ctx: Ctx, request: Request): Promise<Response> {
  const denied = adminOnly(ctx);
  if (denied) return denied;
  const body = await readJson(request);
  if (!body.ok) return body.response;
  const title = str(body.value.title, 'title', 80);
  if (!title.ok) return title.response;
  const opening = str(body.value.opening, 'opening', 4000);
  if (!opening.ok) return opening.response;
  const start = schedule(body.value.start_date, 'start_date');
  if (!start.ok) return start.response;
  const end = schedule(body.value.end_date, 'end_date');
  if (!end.ok) return end.response;
  if (start.value && end.value && end.value < start.value) return apiError('截止日不能早于开始日');
  const storyId = crypto.randomUUID();
  const win = start.value ? firstWindowOf(start.value) : windowFor(ctx.nowMs);
  await ctx.db
    .prepare(SQL.insertStory)
    .bind(storyId, title.value, opening.value, isoAt(ctx.nowMs), start.value, end.value)
    .run();
  const segmentId = crypto.randomUUID();
  await ctx.db
    .prepare(SQL.insertSegment)
    .bind(segmentId, storyId, 1, null, win.openedAt, win.closesAt, isoAt(ctx.nowMs))
    .run();
  const seg = await ctx.db.prepare(SQL.segmentById).bind(segmentId).first<SegmentRow>();
  const story = await ctx.db.prepare(SQL.storyById).bind(storyId).first<StoryRow>();
  return json({ story, segment: seg ? segmentJson(seg) : null }, 201);
}

/** 测试阶段：管理员可修改标题/开篇/排期；开始日期变更会重建 Day 1（Day 编号由开始日期决定）。 */
export async function updateStory(ctx: Ctx, request: Request, params: Record<string, string>): Promise<Response> {
  const denied = adminOnly(ctx);
  if (denied) return denied;
  const body = await readJson(request);
  if (!body.ok) return body.response;
  const title = str(body.value.title, 'title', 80);
  if (!title.ok) return title.response;
  const opening = str(body.value.opening, 'opening', 4000);
  if (!opening.ok) return opening.response;
  const start = schedule(body.value.start_date, 'start_date');
  if (!start.ok) return start.response;
  const end = schedule(body.value.end_date, 'end_date');
  if (!end.ok) return end.response;
  if (start.value && end.value && end.value < start.value) return apiError('截止日不能早于开始日');
  const result = await updateStoryFields(
    ctx.db,
    params.id,
    { title: title.value, opening: opening.value, start: start.value, end: end.value },
    ctx.nowMs,
  );
  if (!result.ok) return apiError(result.error, result.status);
  return json({ story: result.story });
}

interface AdminSubmissionRow {
  id: string;
  segment_id: string;
  author_id: string;
  content: string;
  character_count: number;
  vote_count: number;
  created_at: string;
  author_username: string;
  status: string;
}

export async function listSubmissions(ctx: Ctx, request: Request): Promise<Response> {
  const denied = adminOnly(ctx);
  if (denied) return denied;
  const segmentId = new URL(request.url).searchParams.get('segment_id');
  const { results } = await ctx.db.prepare(SQL.adminSubmissions).bind(segmentId, segmentId).all<AdminSubmissionRow>();
  return json(results.map((r) => submissionJson(r, ctx)));
}

/** 违规处理：status = 'removed'，保留审计记录、不物理删除（plan §38）。 */
export async function removeSubmission(ctx: Ctx, params: Record<string, string>): Promise<Response> {
  const denied = adminOnly(ctx);
  if (denied) return denied;
  const result = await ctx.db.prepare(SQL.removeSubmission).bind(params.id).run();
  if (result.meta.changes === 0) return apiError('投稿不存在', 404);
  return json({ ok: true });
}

export async function listUsers(ctx: Ctx): Promise<Response> {
  const denied = adminOnly(ctx);
  if (denied) return denied;
  const { results } = await ctx.db.prepare(SQL.listUsers).bind().all<UserRow>();
  return json(results.map((u) => ({ id: u.id, username: u.username, created_at: u.created_at })));
}

export async function listSegments(ctx: Ctx, params: Record<string, string>): Promise<Response> {
  const denied = adminOnly(ctx);
  if (denied) return denied;
  const { results } = await ctx.db.prepare(SQL.listSegments).bind(params.id).all<SegmentRow>();
  return json(results.map(segmentJson));
}

/** 手动处理异常回合：跳过时间门槛强制结算，但走同一结算路径（不做"随意改 Canon"接口，plan §39）。 */
export async function finalizeNow(ctx: Ctx, params: Record<string, string>): Promise<Response> {
  const denied = adminOnly(ctx);
  if (denied) return denied;
  await finalizeSegment(ctx.db, params.id, ctx.nowMs, true);
  const seg = await ctx.db.prepare(SQL.segmentById).bind(params.id).first<SegmentRow>();
  return json({ segment: seg ? segmentJson(seg) : null });
}
