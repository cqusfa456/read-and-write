// 数据访问层：D1 查询语句与行类型（plan §42 db/queries.ts）。
// DB/Stmt 是 D1Database 的结构化最小子集，方便测试用 node:sqlite 复刻同一接口跑真 SQL。

export interface Stmt {
  bind(...values: unknown[]): Stmt;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}

export interface DB {
  prepare(sql: string): Stmt;
}

export interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  created_at: string;
}

export interface StoryRow {
  id: string;
  title: string;
  opening: string;
  created_at: string;
  status: string;
  /** 排期（业务日 YYYY-MM-DD，UTC+8）；空 = 无排期 */
  start_date: string | null;
  end_date: string | null;
}

export interface SegmentRow {
  id: string;
  story_id: string;
  day: number;
  parent_segment_id: string | null;
  opened_at: string;
  closes_at: string;
  status: string;
  canonical_submission_id: string | null;
  created_at: string;
}

export interface SubmissionRow {
  id: string;
  segment_id: string;
  author_id: string;
  content: string;
  character_count: number;
  vote_count: number;
  status: string;
  created_at: string;
}

export const SQL = {
  // users
  insertUser: `INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)`,
  userById: `SELECT * FROM users WHERE id = ?`,
  userByUsername: `SELECT * FROM users WHERE username = ?`,
  listUsers: `SELECT id, username, created_at FROM users ORDER BY created_at ASC`,

  // stories
  insertStory:
    `INSERT INTO stories (id, title, opening, created_at, status, start_date, end_date) VALUES (?, ?, ?, ?, 'active', ?, ?)`,
  storyById: `SELECT * FROM stories WHERE id = ?`,
  updateStory: `UPDATE stories SET title = ?, opening = ?, start_date = ?, end_date = ? WHERE id = ?`,
  countStorySubmissions:
    `SELECT COUNT(*) AS n FROM submissions s JOIN segments g ON s.segment_id = g.id WHERE g.story_id = ?`,
  segmentsOfStory: `SELECT id FROM segments WHERE story_id = ? ORDER BY day DESC`,
  allSegmentsDesc: `SELECT id FROM segments ORDER BY day DESC`,
  deleteSegmentById: `DELETE FROM segments WHERE id = ?`,
  deleteAllVotes: `DELETE FROM votes`,
  deleteAllSubmissions: `DELETE FROM submissions`,
  listStories: `SELECT * FROM stories WHERE status = 'active' ORDER BY created_at ASC`,

  // segments
  insertSegment:
    `INSERT INTO segments (id, story_id, day, parent_segment_id, opened_at, closes_at, status, created_at) ` +
    `VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`,
  segmentById: `SELECT * FROM segments WHERE id = ?`,
  latestSegment: `SELECT * FROM segments WHERE story_id = ? ORDER BY day DESC LIMIT 1`,
  // plan §14：open → finalizing 的条件更新，affected_rows 决定谁获得结算权
  claimSegment: `UPDATE segments SET status = 'finalizing' WHERE id = ? AND status = 'open' AND closes_at <= ?`,
  claimSegmentForce: `UPDATE segments SET status = 'finalizing' WHERE id = ? AND status = 'open'`,
  finishSegment: `UPDATE segments SET canonical_submission_id = ?, status = 'finalized' WHERE id = ? AND status = 'finalizing'`,
  listSegments: `SELECT * FROM segments WHERE story_id = ? ORDER BY day ASC`,
  history:
    `SELECT g.day AS day, g.canonical_submission_id AS canonical_submission_id, ` +
    `s.content AS content, s.character_count AS character_count, s.vote_count AS vote_count, ` +
    `u.username AS author_username ` +
    `FROM segments g ` +
    `LEFT JOIN submissions s ON s.id = g.canonical_submission_id ` +
    `LEFT JOIN users u ON u.id = s.author_id ` +
    `WHERE g.story_id = ? AND g.status = 'finalized' ORDER BY g.day ASC`,

  // submissions
  insertSubmission:
    `INSERT INTO submissions (id, segment_id, author_id, content, character_count, vote_count, status, created_at) ` +
    `VALUES (?, ?, ?, ?, ?, 0, 'active', ?)`,
  submissionById: `SELECT * FROM submissions WHERE id = ?`,
  countMySubmissions: `SELECT COUNT(*) AS n FROM submissions WHERE segment_id = ? AND author_id = ? AND status = 'active'`,
  removeSubmission: `UPDATE submissions SET status = 'removed' WHERE id = ?`,
  submissionsBySegment:
    `SELECT s.id, s.segment_id, s.author_id, s.content, s.character_count, s.vote_count, s.created_at, ` +
    `u.username AS author_username, ` +
    `EXISTS(SELECT 1 FROM votes v WHERE v.submission_id = s.id AND v.user_id = ?) AS voted ` +
    `FROM submissions s JOIN users u ON u.id = s.author_id ` +
    `WHERE s.segment_id = ? AND s.status = 'active' ` +
    `ORDER BY s.created_at DESC, s.id DESC`,
  adminSubmissions:
    `SELECT s.id, s.segment_id, s.author_id, s.content, s.character_count, s.vote_count, s.status, s.created_at, ` +
    `u.username AS author_username ` +
    `FROM submissions s JOIN users u ON u.id = s.author_id ` +
    `WHERE (? IS NULL OR s.segment_id = ?) ORDER BY s.created_at DESC`,
  // plan §21：结算时票数以 votes 表实时重算，不信 vote_count 缓存；plan §15：票数最高，平票取创建更早
  winnerOfSegment:
    `SELECT s.id AS id FROM submissions s ` +
    `WHERE s.segment_id = ? AND s.status = 'active' ` +
    `ORDER BY (SELECT COUNT(*) FROM votes v WHERE v.submission_id = s.id) DESC, s.created_at ASC, s.id ASC ` +
    `LIMIT 1`,

  // votes
  insertVote: `INSERT INTO votes (id, segment_id, submission_id, user_id, created_at) VALUES (?, ?, ?, ?, ?)`,
  deleteVote: `DELETE FROM votes WHERE segment_id = ? AND submission_id = ? AND user_id = ?`,
  voteCountByUser: `SELECT COUNT(*) AS n FROM votes WHERE segment_id = ? AND user_id = ?`,
  incVoteCount: `UPDATE submissions SET vote_count = vote_count + 1 WHERE id = ?`,
  decVoteCount: `UPDATE submissions SET vote_count = MAX(vote_count - 1, 0) WHERE id = ?`,
} as const;
