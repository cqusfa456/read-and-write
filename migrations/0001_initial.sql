-- 每日接龙式社区共创小说 · 初始结构（plan §6–§10）
-- 全部 IF NOT EXISTS：迁移可重复部署（plan §60.12）

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stories (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    opening TEXT NOT NULL,
    created_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS segments (
    id TEXT PRIMARY KEY,
    story_id TEXT NOT NULL,
    day INTEGER NOT NULL,
    parent_segment_id TEXT,
    opened_at TEXT NOT NULL,
    closes_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    canonical_submission_id TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (story_id) REFERENCES stories(id),
    FOREIGN KEY (parent_segment_id) REFERENCES segments(id)
);

CREATE TABLE IF NOT EXISTS submissions (
    id TEXT PRIMARY KEY,
    segment_id TEXT NOT NULL,
    author_id TEXT NOT NULL,
    content TEXT NOT NULL,
    character_count INTEGER NOT NULL,
    vote_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    FOREIGN KEY (segment_id) REFERENCES segments(id),
    FOREIGN KEY (author_id) REFERENCES users(id)
);

-- plan §9 默认规则：一个用户 + 一个回合 = 最多一票。
-- 若改为「每回合可投多个不同投稿」，把 UNIQUE 改为 (segment_id, submission_id, user_id)
-- 并同步 CONFIG.VOTES_PER_USER_PER_SEGMENT（README「可配置规则」）。
CREATE TABLE IF NOT EXISTS votes (
    id TEXT PRIMARY KEY,
    segment_id TEXT NOT NULL,
    submission_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (segment_id) REFERENCES segments(id),
    FOREIGN KEY (submission_id) REFERENCES submissions(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(segment_id, user_id)
);

-- Invariant 7（plan §40）：同一 Segment 只能创建一个下一 Segment —— (story_id, day) 唯一索引兜底
CREATE UNIQUE INDEX IF NOT EXISTS idx_segments_story_day
ON segments(story_id, day);

CREATE INDEX IF NOT EXISTS idx_submissions_segment
ON submissions(segment_id);

CREATE INDEX IF NOT EXISTS idx_submissions_segment_votes
ON submissions(segment_id, vote_count DESC);

CREATE INDEX IF NOT EXISTS idx_votes_submission
ON votes(submission_id);

CREATE INDEX IF NOT EXISTS idx_votes_segment
ON votes(segment_id);
