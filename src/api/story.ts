import { SQL, type StoryRow } from '../db/queries.ts';
import { ensureCurrentSegment } from '../services/finalization.ts';
import { apiError, json } from '../utils/validation.ts';
import { segmentJson, type Ctx } from './common.ts';

export async function listStories(ctx: Ctx): Promise<Response> {
  const { results } = await ctx.db.prepare(SQL.listStories).bind().all<StoryRow>();
  return json(results.map((s) => ({ id: s.id, title: s.title })));
}

export async function getStory(ctx: Ctx, params: Record<string, string>): Promise<Response> {
  const story = await ctx.db.prepare(SQL.storyById).bind(params.id).first<StoryRow>();
  if (!story) return apiError('故事不存在', 404);
  const seg = await ensureCurrentSegment(ctx.db, story.id, ctx.nowMs);
  return json({
    id: story.id,
    title: story.title,
    opening: story.opening,
    current_segment: seg ? segmentJson(seg) : null,
  });
}

export async function getCurrent(ctx: Ctx, params: Record<string, string>): Promise<Response> {
  const story = await ctx.db.prepare(SQL.storyById).bind(params.id).first<StoryRow>();
  if (!story) return apiError('故事不存在', 404);
  const seg = await ensureCurrentSegment(ctx.db, story.id, ctx.nowMs);
  return json({ segment: seg ? segmentJson(seg) : null });
}

interface HistoryRow {
  day: number;
  canonical_submission_id: string | null;
  content: string | null;
  character_count: number | null;
  vote_count: number | null;
  author_username: string | null;
}

/** 故事历史（plan §36–§37）：Opening + 各天 Canon，正文逻辑拼接、不冗余复制。 */
export async function getHistory(ctx: Ctx, params: Record<string, string>): Promise<Response> {
  const story = await ctx.db.prepare(SQL.storyById).bind(params.id).first<StoryRow>();
  if (!story) return apiError('故事不存在', 404);
  const { results } = await ctx.db.prepare(SQL.history).bind(story.id).all<HistoryRow>();
  return json({
    id: story.id,
    title: story.title,
    opening: story.opening,
    canons: results.map((r) => ({
      day: r.day,
      content: r.content,
      character_count: r.character_count,
      vote_count: r.vote_count,
      author: r.author_username,
    })),
  });
}
