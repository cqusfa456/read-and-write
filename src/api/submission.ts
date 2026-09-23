import { CONFIG } from '../config.ts';
import { SQL } from '../db/queries.ts';
import { createSubmission } from '../services/submission.ts';
import { apiError, json, readJson, str } from '../utils/validation.ts';
import { submissionJson, type Ctx } from './common.ts';

interface SubmissionJoinRow {
  id: string;
  segment_id: string;
  author_id: string;
  content: string;
  character_count: number;
  vote_count: number;
  created_at: string;
  author_username: string;
  voted: number;
}

export async function listBySegment(ctx: Ctx, params: Record<string, string>): Promise<Response> {
  const viewer = ctx.user?.id ?? '';
  const { results } = await ctx.db
    .prepare(SQL.submissionsBySegment)
    .bind(viewer, params.id)
    .all<SubmissionJoinRow>();
  return json(results.map((r) => submissionJson(r, ctx)));
}

/** 投稿（plan §19）：segment_id 仅是目标定位，作者/字符数/状态全部由服务器决定。 */
export async function create(ctx: Ctx, request: Request): Promise<Response> {
  if (!ctx.user) return apiError('请先登录', 401);
  const body = await readJson(request);
  if (!body.ok) return body.response;
  const segmentId = str(body.value.segment_id, 'segment_id', 64);
  if (!segmentId.ok) return segmentId.response;
  const result = await createSubmission(ctx.db, ctx.user.id, segmentId.value, body.value.content, ctx.nowMs);
  if (!result.ok) return apiError(result.error, result.status);
  return json({ submission: submissionJson({ ...result.submission, author_username: ctx.user.username, voted: 0 }, ctx) }, 201);
}
