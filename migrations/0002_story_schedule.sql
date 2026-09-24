-- 故事排期（开始/截止日期，业务日 UTC+8）：空 = 无排期（长期开放），与旧行为兼容
-- SQLite 无 IF NOT EXISTS 的 ADD COLUMN；wrangler 的 d1_migrations 记账保证只执行一次
ALTER TABLE stories ADD COLUMN start_date TEXT;
ALTER TABLE stories ADD COLUMN end_date TEXT;
