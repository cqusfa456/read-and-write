import { castVote } from '../services/voting.ts';
import { apiError, json, readJson, str } from '../utils/validation.ts';
import type { Ctx } from './common.ts';

export async function create(ctx: Ctx, request: Request): Promise<Response> {
  if (!ctx.user) return apiError('请先登录', 401);
  const body = await readJson(request);
  if (!body.ok) return body.response;
  const submissionId = str(body.value.submission_id, 'submission_id', 64);
  if (!submissionId.ok) return submissionId.response;
  const result = await castVote(ctx.db, ctx.user.id, submissionId.value, ctx.nowMs);
  if (!result.ok) return apiError(result.error, result.status);
  return json({ ok: true, vote_count: result.voteCount });
}
