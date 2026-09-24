import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import type { DB, Stmt } from '../src/db/queries.ts';
import { isoAt } from '../src/utils/time.ts';

export interface TestDb {
  db: DB;
  sqlite: DatabaseSync;
}

/** 用 node:sqlite 复刻 D1 的 prepare/bind/first/all/run 接口，让服务层跑真实 SQL。 */
export function createTestDb(): TestDb {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  const db: DB = {
    prepare(sql: string): Stmt {
      const make = (params: unknown[]): Stmt => ({
        bind: (...values: unknown[]) => make(values),
        first: async <T,>(): Promise<T | null> => {
          const row = sqlite.prepare(sql).get(...(params as never[]));
          return (row ?? null) as T | null;
        },
        all: async <T,>(): Promise<{ results: T[] }> => ({
          results: sqlite.prepare(sql).all(...(params as never[])) as T[],
        }),
        run: async (): Promise<{ meta: { changes: number } }> => {
          const r = sqlite.prepare(sql).run(...(params as never[]));
          return { meta: { changes: Number(r.changes) } };
        },
      });
      return make([]);
    },
  };
  return { db, sqlite };
}

export function applyMigrations(t: TestDb): void {
  const dir = new URL('../migrations/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    t.sqlite.exec(readFileSync(new URL(f, dir), 'utf8'));
  }
}

export function setup(): TestDb {
  const t = createTestDb();
  applyMigrations(t);
  return t;
}

/** 基础场景：users u1/u2、story s1、Day 1 segment g1（open）。 */
export function seedRound(t: TestDb, nowMs: number, closesOffsetMs = 3_600_000): void {
  const closes = isoAt(nowMs + closesOffsetMs);
  t.sqlite
    .prepare(`INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, 'x', ?)`)
    .run('u1', 'alice', isoAt(nowMs));
  t.sqlite
    .prepare(`INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, 'x', ?)`)
    .run('u2', 'bob', isoAt(nowMs));
  t.sqlite
    .prepare(`INSERT INTO stories (id, title, opening, created_at, status) VALUES ('s1', '故事', '开篇', ?, 'active')`)
    .run(isoAt(nowMs));
  t.sqlite
    .prepare(
      `INSERT INTO segments (id, story_id, day, parent_segment_id, opened_at, closes_at, status, canonical_submission_id, created_at) ` +
        `VALUES ('g1', 's1', 1, NULL, ?, ?, 'open', NULL, ?)`,
    )
    .run(isoAt(nowMs - 3_600_000), closes, isoAt(nowMs));
}

export function addSubmission(t: TestDb, id: string, authorId: string, createdAt: string, content = '续写内容。'): void {
  t.sqlite
    .prepare(
      `INSERT INTO submissions (id, segment_id, author_id, content, character_count, vote_count, status, created_at) ` +
        `VALUES (?, 'g1', ?, ?, 5, 0, 'active', ?)`,
    )
    .run(id, authorId, content, createdAt);
}

export function addVote(t: TestDb, id: string, submissionId: string, userId: string, createdAt: string): void {
  t.sqlite
    .prepare(`INSERT INTO votes (id, segment_id, submission_id, user_id, created_at) VALUES (?, 'g1', ?, ?, ?)`)
    .run(id, submissionId, userId, createdAt);
}

export function setVoteCount(t: TestDb, submissionId: string, n: number): void {
  t.sqlite.prepare(`UPDATE submissions SET vote_count = ? WHERE id = ?`).run(n, submissionId);
}
