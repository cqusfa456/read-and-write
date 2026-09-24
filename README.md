# 每日接龙 · 社区共创小说

Cloudflare Workers + D1 的社区接龙小说 MVP：每天（UTC+8 00:00–24:00）一个创作回合，
投稿与投票同时开放，24:00 结算出票数最高的投稿作为 Canon，故事由此继续。

设计文档见 [plan.md](plan.md)。

## 架构

```text
静态前端 (frontend/) ── Cloudflare Worker (src/) ── D1 (migrations/)
（Astro 构建产物        │
 frontend/dist）       ├─ Lazy Finalization：请求到来时发现回合过期就地结算（不依赖 Cron）
                       ├─ 所有状态 / 权限 / 时间 / 字符数由服务器判定
                       └─ Session Cookie + DB 约束兜底
```

- 状态机：`open → finalizing → finalized`（不是 SUBMISSION/VOTING 两段式）
- 时间：存储一律 UTC ISO 8601，业务窗口固定 UTC+8（plan §11）
- 结算并发安全：`UPDATE ... SET status='finalizing' WHERE status='open'` 的 affected_rows
  决定唯一结算权（plan §14），外加 `(story_id, day)` 唯一索引（Invariant 7）
- Canon 选择：票数以 votes 表实时重算，平票取创建更早的投稿（plan §15 / §21）
- 空回合：Canon = NULL，下一天照常开启、从上一 Canon 继续（plan §16）

## 目录

```text
src/index.ts          路由、鉴权注入、CSRF/限流
src/api/              HTTP 层（auth/story/submission/vote/admin/common）
src/services/         业务层（auth/finalization/submission/voting）
src/db/queries.ts     SQL 与行类型
src/utils/            time（UTC+8 窗口）/ text（字符计数）/ validation（请求体与响应）
migrations/           D1 结构（IF NOT EXISTS，可重复部署）
frontend/             前端：Astro + Tailwind v4 + DaisyUI v5（构建产物 dist/ 由 assets 伺服）
tests/                node --test + node:sqlite 跑真实 SQL
```

## 运行

```bash
npm install
npm test          # 25 个用例：时间边界/字符计数/结算/并发/投票/认证
npm run typecheck

# 本地开发
npx wrangler d1 create read-and-write      # 把输出的 database_id 填进 wrangler.jsonc
npm run db:local                           # 应用 migration（本地 SQLite）
npm run build:web                          # 构建前端（frontend/ → frontend/dist）
npx wrangler dev                           # http://127.0.0.1:8787
# 前端单独热更：cd frontend && npm run dev

# 部署
npx wrangler secret put SESSION_SECRET     # 生产必须设置
npm run deploy                             # = 构建前端 + 远程 migration + wrangler deploy
```

前端（Astro + Tailwind v4 + DaisyUI v5）在 `frontend/`，纯静态 SSG + 原生 TS 交互脚本，
产物 `frontend/dist/` **入库**——这样即使 CI 的 Deploy command 还是 `npx wrangler deploy`
也能发布最新前端；若 CI 配置了 Build command `npm run build:web` 则每次构建自动重出产物。

CI（Cloudflare Workers Builds）：把 Settings > Build 的 Deploy command 设为 `npm run deploy`，
每次构建即自动应用 migration（幂等可重复执行）。注意构建用的 API token 需要有 D1 编辑权限；
若构建在 migration 步骤报权限错误，在 Settings > Build 的 API token 处换用自建的、带 D1 Edit 的 token。

首次启用：注册用户名 `admin` 的账号（见「可配置规则」的管理员名单），
调用 `POST /api/admin/stories` 创建故事（标题 + Opening），Day 1 即自动开启。

## 可配置规则（plan §9 / §24 / §25，改动前先看这里）

| 配置（src/config.ts） | 默认 | 说明 |
| --- | --- | --- |
| `VOTES_PER_USER_PER_SEGMENT` | `1` | 一回合一票。**改多票必须同步改 migration**：`votes` 的 UNIQUE 从 `(segment_id, user_id)` 换成 `(segment_id, submission_id, user_id)`（plan §9） |
| `ALLOW_MULTIPLE_SUBMISSIONS_PER_SEGMENT` | `true` | 允许一回合一作者多稿。改为 `false` 时建议给 `submissions` 加 `UNIQUE(segment_id, author_id)` 兜底 |
| `ALLOW_SELF_VOTE` | `false` | 禁止给自己的投稿投票 |
| `MIN_CHARS` / `MAX_CHARS` | `80` / `300` | 投稿长度，服务器用 `Array.from(text).length` 重算（plan §17–§18） |
| `ADMIN_USERNAMES` | `['admin']` | 管理员名单；MVP 以用户名配置 |
| `SESSION_TTL_MS` | 30 天 | Session Cookie 有效期 |

前端管理卡片（admin 可见）：创建/修改标题与开篇，开篇预填默认草稿（测试阶段随时可改）；Canon 仍只能由每日结算产生。前端按默认规则渲染（自己的投稿不显示投票按钮等），服务器才是最终权威。

## API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/stories` | 故事列表 |
| GET | `/api/stories/:id` | 故事 + 当前回合（触发 Lazy Finalization） |
| GET | `/api/stories/:id/current` | 当前回合 |
| GET | `/api/stories/:id/history` | Opening + 各天 Canon |
| GET | `/api/segments/:id/submissions` | 当日投稿列表（含 voted / is_mine） |
| POST | `/api/submissions` | 投稿 `{segment_id, content}` |
| POST | `/api/votes` | 投票 `{submission_id}` |
| POST | `/api/votes` | 投票 `{submission_id}` |
| POST | `/api/votes` | 投票 `{submission_id}` |
| POST | `/api/votes` | 投票 `{submission_id}` |
| DELETE | `/api/votes/:submission_id` | 撤票（撤回后可改投其他投稿） |
| POST | `/api/auth/register` / `login` / `logout` | 注册 / 登录 / 退出 |
| GET | `/api/auth/me` | 当前用户 |
| POST | `/api/admin/stories` | 创建故事 `{title, opening}` + Day 1 |
| PATCH | `/api/admin/stories/:id` | 修改标题/开篇（测试阶段可改；Canon 不可手改） |
| GET | `/api/admin/submissions?segment_id=` | 全部投稿（含 removed，审计用） |
| POST | `/api/admin/submissions/:id/remove` | 违规下架（status=removed，不物理删除） |
| GET | `/api/admin/users` | 用户列表 |
| GET | `/api/stories/:id/segments` | 回合列表（管理员） |
| POST | `/api/admin/reset` | 一键清除活动数据（投稿/投票/回合并重建 Day 1，用户保留） |
| POST | `/api/admin/segments/:id/finalize` | 手动结算异常回合（走同一结算路径，不提供随意改 Canon 的接口） |

## 安全边界（plan §51–§52）

- 身份只来自 Session Cookie（HMAC 签名，HttpOnly + Secure + SameSite=Lax）；
  请求体里的 `user_id` / `vote_count` / `status` 等一律忽略
- 写操作校验 Origin（CSRF），请求体上限 8KB（plan §31）
- 密码：PBKDF2-SHA256（10 万次迭代 + 随机盐 + 常量时间比较；10 万是 workerd
  WebCrypto 的硬上限，生产实测超过会抛错）；换 Argon2id 只需替换 `services/auth.ts` 两个函数
- 投稿渲染用 `textContent`，无 innerHTML（XSS，plan §30）
- 重复投票由 `UNIQUE(segment_id, user_id)` 最终兜底（plan §22）
- 限流：进程内滑动窗口（每个隔离实例各自计数），并发量大了换 Cloudflare Rate Limiting，
  不要为此引入 Redis（plan §29）

## MVP 明确不做（plan §61）

评论、私信、关注、点赞、积分、AI 生成/审核、分支故事、WebSocket、Markdown/富文本、
图片视频音频、多故事前台切换（数据模型已支持，plan §56）。
