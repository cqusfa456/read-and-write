import { CONFIG } from '../config.ts';
import type { DB, SegmentRow } from '../db/queries.ts';

export interface Ctx {
  db: DB;
  secret: string;
  nowMs: number;
  /** 身份一律来自 Session（plan §52）：客户端传的 user_id/author_id 一律忽略。 */
  user: { id: string; username: string } | null;
}

export function isAdmin(ctx: Ctx): boolean {
  return ctx.user !== null && CONFIG.ADMIN_USERNAMES.includes(ctx.user.username);
}

export function segmentJson(seg: SegmentRow) {
  return {
    id: seg.id,
    story_id: seg.story_id,
    day: seg.day,
    parent_segment_id: seg.parent_segment_id,
    opened_at: seg.opened_at,
    closes_at: seg.closes_at,
    status: seg.status,
    canonical_submission_id: seg.canonical_submission_id,
  };
}

interface SubmissionJoinRow {
  id: string;
  segment_id: string;
  author_id: string;
  content: string;
  character_count: number;
  vote_count: number;
  created_at: string;
  author_username: string;
  voted?: number;
  status?: string;
}

export function submissionJson(row: SubmissionJoinRow, ctx: Ctx) {
  return {
    id: row.id,
    segment_id: row.segment_id,
    content: row.content,
    character_count: row.character_count,
    vote_count: row.vote_count,
    author: { id: row.author_id, username: row.author_username },
    created_at: row.created_at,
    voted: Boolean(row.voted),
    is_mine: ctx.user?.id === row.author_id,
    ...(row.status ? { status: row.status } : {}),
  };
}
