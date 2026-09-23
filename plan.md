# 每日接龙式社区共创小说

## Cloudflare Workers + D1 MVP 开发规划

---

## 1. 项目目标

开发一个轻量级的社区共创小说网站。

核心机制：

1. 网站拥有一篇故事的初始开篇。
2. 故事按照“天”推进。
3. 每天 UTC+8 00:00 开启一个新的创作回合。
4. 在当天 00:00–24:00 期间：

   * 用户可以提交故事续写；
   * 用户可以给其他续写投票；
   * 投稿和投票同时开放；
   * 用户投稿后可以立即参与投票。
5. 当天 24:00 回合结束：

   * 停止投稿；
   * 停止投票；
   * 统计投票；
   * 按规则选出最高票投稿；
   * 将该投稿正式加入故事；
   * 作为下一天故事的基础。
6. 第二天 00:00 开启新的回合。
7. 最终形成：

```text
故事开篇
    ↓
Day 1 投稿竞争
    ↓
Day 1 获胜投稿
    ↓
Day 2 投稿竞争
    ↓
Day 2 获胜投稿
    ↓
Day 3 投稿竞争
    ↓
...
```

整个故事实际上是由每天一次的社区共识不断向前推进的。

---

# 2. 核心规则

## 2.1 每日回合

每一个 Story Segment 对应一天。

例如：

```text
Day 0
故事开篇

Day 1
00:00 开始
24:00 结束
→ 选出 Day 1 Canon

Day 2
00:00 开始
24:00 结束
→ 选出 Day 2 Canon

Day 3
...
```

---

# 3. 投稿与投票规则

这是项目最重要的生命周期设计。

## 3.1 开放期间

在：

```text
00:00 <= current_time < 24:00
```

时：

```text
投稿：允许
投票：允许
```

用户可以：

```text
查看当天所有投稿
      ↓
自己投稿
      ↓
立即查看其他投稿
      ↓
进行投票
```

投稿和投票没有先后阶段。

---

## 3.2 关闭期间

当：

```text
current_time >= closes_at
```

当天回合关闭。

此时：

```text
投稿：禁止
投票：禁止
```

服务器进入 Finalization。

---

# 4. 回合状态机

不要设计成：

```text
SUBMISSION
    ↓
VOTING
    ↓
FINALIZED
```

因为这与实际玩法不符。

正确设计：

```text
OPEN
  │
  │ 到达 closes_at
  ↓
FINALIZING
  │
  │ 完成票数统计
  │ 选择 Canon
  │ 创建下一回合
  ↓
FINALIZED
```

状态：

```text
open
finalizing
finalized
```

---

# 5. Story 数据模型

数据库使用 Cloudflare D1。

不使用：

* PostgreSQL
* Redis
* MongoDB
* 独立服务器

MVP 只需要：

```text
Cloudflare Worker
        +
       D1
        +
静态前端
```

---

# 6. 数据库结构

## 6.1 stories

保存故事本身。

```sql
CREATE TABLE stories (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    opening TEXT NOT NULL,
    created_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
);
```

字段：

| 字段         | 说明                |
| ---------- | ----------------- |
| id         | Story ID          |
| title      | 故事标题              |
| opening    | 初始故事              |
| created_at | 创建时间              |
| status     | active / archived |

---

# 7. segments

每一天对应一个 Segment。

```sql
CREATE TABLE segments (
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
```

例如：

```text
Segment A
day = 1
parent = null

Segment B
day = 2
parent = Segment A

Segment C
day = 3
parent = Segment B
```

这样可以明确表达故事的连续关系。

---

# 8. submissions

保存用户投稿。

```sql
CREATE TABLE submissions (
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
```

状态：

```text
active
removed
winner
```

其中 `winner` 可以不是必要字段，也可以完全依靠：

```text
segments.canonical_submission_id
```

判断 Canon。

MVP 可以只使用：

```text
active
removed
```

---

# 9. votes

保存投票记录。

```sql
CREATE TABLE votes (
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
```

这个 UNIQUE 约束意味着：

```text
一个用户
+
一个回合
=
最多一票
```

但是：

**“一个用户每天只能投一票”目前属于可配置规则。**

如果项目最终希望允许：

```text
一个用户每天投多个不同投稿
```

则不能使用：

```sql
UNIQUE(segment_id, user_id)
```

而应该改成：

```sql
UNIQUE(segment_id, submission_id, user_id)
```

因此在正式开发之前，将这一条做成明确配置。

---

# 10. users

MVP 使用最简单的账户系统。

```sql
CREATE TABLE users (
    id TEXT PRIMARY KEY,

    username TEXT NOT NULL UNIQUE,

    password_hash TEXT NOT NULL,

    created_at TEXT NOT NULL
);
```

后续可以增加：

```text
email
OAuth
Passkey
WebAuthn
```

但 MVP 不需要。

---

# 11. 时间设计

不要使用服务器本地时间。

所有数据库时间统一使用：

```text
UTC ISO 8601
```

例如：

```text
2026-09-23T16:00:00Z
```

业务规则固定为：

```text
UTC+8
```

即：

```text
Asia/Shanghai
```

每天：

```text
UTC+8 00:00
```

开启。

即 UTC：

```text
前一天 16:00 UTC
```

关闭：

```text
当天 16:00 UTC
```

---

# 12. 不依赖 Cron 保证正确性

MVP 不应该依赖 Cloudflare Cron 才能推进故事。

例如：

```text
24:00 到了
```

但是没有任何请求。

那么：

```text
Worker 不需要主动执行
```

下一次有人访问：

```text
GET /api/story/current
```

发现：

```text
current_time >= closes_at
```

就执行 Finalization。

这叫：

```text
Lazy Finalization
```

因此：

```text
时间到达
≠ 必须立即执行数据库任务
```

而是：

```text
第一次请求到来
        ↓
发现已经过期
        ↓
执行结算
```

后续可以增加 Cron 作为辅助机制。

---

# 13. Finalization

这是整个系统最关键的服务端逻辑。

伪代码：

```ts
async function finalizeSegment(segmentId) {
    // 1. 获取 segment

    // 2. 检查当前时间
    if (now < closes_at) {
        return;
    }

    // 3. 尝试将 open 改为 finalizing

    // 4. 如果已经是 finalizing/finalized
    //    不重复处理

    // 5. 获取有效投稿

    // 6. 统计票数

    // 7. 选择获胜投稿

    // 8. 写入 canonical_submission_id

    // 9. 将 segment 设置为 finalized

    // 10. 创建下一个 segment
}
```

---

# 14. 防止重复结算

必须考虑：

```text
用户 A
       ↓
请求 1 ──────┐
             ├→ 同时发现 Day 1 已结束
请求 2 ──────┘
```

不能导致：

```text
创建两个 Day 2
```

因此需要数据库层面的状态转换。

例如：

```sql
UPDATE segments
SET status = 'finalizing'
WHERE id = ?
  AND status = 'open'
  AND closes_at <= ?;
```

然后检查：

```text
affected_rows
```

只有成功将：

```text
open → finalizing
```

的请求获得 Finalization 权。

其他请求发现：

```text
affected_rows = 0
```

则重新读取 Segment 状态。

这样可以避免：

```text
重复选 Canon
重复创建下一天
```

---

# 15. 如何选择 Canon

默认规则：

```text
票数最高
```

如果出现平票：

```text
创建时间更早的投稿优先
```

例如：

```text
A = 10票
B = 10票
C = 7票
```

如果：

```text
A 创建于 12:01
B 创建于 13:20
```

则：

```text
A
```

成为 Canon。

SQL 可以类似：

```sql
SELECT *
FROM submissions
WHERE segment_id = ?
  AND status = 'active'
ORDER BY vote_count DESC, created_at ASC
LIMIT 1;
```

---

# 16. 没有投稿怎么办

必须定义空回合行为。

推荐：

```text
当天没有有效投稿
        ↓
Canon = NULL
        ↓
下一天继续从上一 Canon 开始
```

也就是说：

```text
Day 3 没人投稿

Day 4
仍然从 Day 2 Canon 继续
```

这样不会因为一天无人参与而导致故事断裂。

也可以选择：

```text
无人投稿
→ 自动跳过一天
→ 第二天继续
```

两者实际上可以合并。

---

# 17. 投稿限制

每次投稿：

```text
80–300 个字符
```

这里必须由服务器重新计算。

绝不能相信客户端传来的：

```json
{
    "character_count": 100
}
```

应该：

```text
content
 ↓
Worker
 ↓
Unicode 字符计数
 ↓
character_count
```

然后验证：

```text
80 <= character_count <= 300
```

---

# 18. 字符计算

需要提前确定“字符”的定义。

对于中文：

```text
你好世界
```

通常：

```text
4
```

但对于：

```text
emoji
组合字符
ZWJ
变体选择符
```

JavaScript：

```js
str.length
```

不一定符合用户看到的字符数量。

推荐 MVP 使用：

```js
Array.from(text).length
```

如果以后需要更严格的 Unicode grapheme cluster 统计，可以使用：

```text
Intl.Segmenter
```

例如：

```js
const segmenter = new Intl.Segmenter(
    'zh',
    { granularity: 'grapheme' }
);

const count = [...segmenter.segment(text)].length;
```

最终以服务端规则为准。

---

# 19. 投稿流程

客户端：

```text
用户输入
    ↓
本地显示字符数
    ↓
POST /api/submissions
```

服务器：

```text
验证登录状态
    ↓
检查当前 Segment
    ↓
检查 Segment 是否 open
    ↓
检查文本大小
    ↓
重新计算字符数
    ↓
检查 80–300
    ↓
插入 submission
    ↓
返回投稿
```

---

# 20. 投票流程

客户端：

```text
点击 Vote
    ↓
POST /api/votes
```

服务器：

```text
验证用户
    ↓
获取 submission
    ↓
获取 submission 所属 segment
    ↓
检查 segment 是否 open
    ↓
检查 submission 是否 active
    ↓
检查投票规则
    ↓
写入 vote
    ↓
更新 vote_count
```

---

# 21. vote_count 的设计

可以采用：

```text
votes 表 = 真正数据源
submissions.vote_count = 缓存计数
```

即：

```text
votes
  ↓
真实投票记录

vote_count
  ↓
快速显示
```

最终结算时不要完全相信：

```text
submission.vote_count
```

可以重新：

```sql
COUNT(*)
FROM votes
WHERE submission_id = ?
```

保证 Canon 选择正确。

---

# 22. 防止重复投票

数据库 UNIQUE constraint 是最终保障。

即使用户快速点击：

```text
Vote
Vote
Vote
Vote
```

服务器也不会产生重复投票。

客户端按钮禁用只是 UX。

真正安全性依靠：

```text
UNIQUE constraint
```

---

# 23. 投稿是否可以修改

MVP 推荐：

```text
提交后不可修改
```

原因：

如果允许修改：

```text
Day 1 12:00 投稿
Day 1 23:50 修改
```

可能改变投票公平性。

因此：

```text
submission = immutable
```

管理员可以：

```text
removed
```

但普通用户不能修改内容。

---

# 24. 是否允许用户提交多个投稿

这一项不要在代码中提前假设。

可以设计成配置：

```ts
ALLOW_MULTIPLE_SUBMISSIONS_PER_SEGMENT
```

例如：

```text
true
```

表示：

```text
一个用户可以提交多个版本
```

如果设置：

```text
false
```

则数据库增加：

```sql
UNIQUE(segment_id, author_id)
```

MVP 可以先选择一种明确规则实现。

---

# 25. 是否允许给自己的投稿投票

同样应该作为明确规则，而不是隐含假设。

如果：

```text
禁止自投
```

服务器检查：

```text
submission.author_id !== currentUser.id
```

如果：

```text
允许自投
```

则不进行检查。

这属于产品规则，不应该由前端自行决定。

---

# 26. API

## Story

```http
GET /api/stories/:id
```

返回：

```json
{
    "id": "...",
    "title": "...",
    "opening": "...",
    "current_segment": {...}
}
```

---

## 当前回合

```http
GET /api/stories/:id/current
```

返回：

```json
{
    "segment": {
        "id": "...",
        "day": 17,
        "opened_at": "...",
        "closes_at": "...",
        "status": "open"
    }
}
```

---

## 投稿列表

```http
GET /api/segments/:id/submissions
```

返回：

```json
[
    {
        "id": "...",
        "content": "...",
        "character_count": 132,
        "vote_count": 15,
        "author": {
            "username": "..."
        },
        "created_at": "..."
    }
]
```

---

## 投稿

```http
POST /api/submissions
```

请求：

```json
{
    "segment_id": "...",
    "content": "..."
}
```

---

## 投票

```http
POST /api/votes
```

请求：

```json
{
    "submission_id": "..."
}
```

不要让客户端直接决定：

```text
user_id
segment_id
vote_count
```

这些都由服务器根据：

```text
Session
Submission
Database
```

确定。

---

# 27. Auth

MVP 可以使用：

```text
username + password
```

密码必须：

```text
Argon2id
```

或者使用 Cloudflare 环境中可靠的密码哈希方案。

绝对不要：

```text
SHA256(password)
MD5(password)
明文密码
```

登录后：

```text
session cookie
```

Cookie 至少：

```text
HttpOnly
Secure
SameSite=Lax
```

---

# 28. CSRF

如果使用 Cookie Session：

需要考虑：

```text
CSRF
```

可以使用：

```text
SameSite=Lax
+
Origin/Referer 检查
+
CSRF token
```

对于投票、投稿等状态修改 API，必须进行防护。

---

# 29. Rate Limit

MVP 至少对：

```text
POST /api/submissions
POST /api/votes
POST /api/auth/login
```

做基础限流。

Cloudflare 环境可以后续使用：

```text
Cloudflare Rate Limiting
```

或者：

```text
Durable Objects
```

但 MVP 可以先做简单版本。

不要为了限流引入 Redis。

---

# 30. XSS

用户投稿属于不可信文本。

前端显示：

```text
textContent
```

不要：

```js
element.innerHTML = submission.content;
```

如果以后需要 Markdown，也必须经过严格 sanitizer。

MVP：

```text
纯文本
```

最简单。

---

# 31. 请求体限制

投稿最大只有 300 字符，因此服务器应该主动限制：

```text
Content-Length
```

以及 JSON body 大小。

不要允许用户发送：

```text
几十 MB JSON
```

然后才检查 content。

---

# 32. 前端结构

MVP 不需要 React。

推荐：

```text
HTML
CSS
Vanilla JS
```

结构：

```text
public/
├── index.html
├── app.js
└── style.css
```

---

# 33. 页面结构

主页：

```text
┌──────────────────────────────┐
│        故事标题              │
│                              │
│        当前故事              │
│                              │
│  开篇                        │
│                              │
│  Day 1 Canon                 │
│                              │
│  Day 2 Canon                 │
│                              │
│  Day 3 Canon                 │
│                              │
├──────────────────────────────┤
│        今日续写              │
│                              │
│  距离截止：08:32:15           │
│                              │
│  [投稿框]                    │
│                              │
│  123 / 300                   │
│                              │
│  [提交]                      │
│                              │
├──────────────────────────────┤
│        今日投稿              │
│                              │
│  投稿 A              32票    │
│  投稿 B              27票    │
│  投稿 C              11票    │
│                              │
└──────────────────────────────┘
```

---

# 34. 当前回合 UI

必须明确告诉用户：

```text
Day 17
```

以及：

```text
投稿截止时间
投票截止时间
```

因为二者实际上是同一个时间。

例如：

```text
Day 17

距离本回合结束：
05:23:41

投稿 ✓
投票 ✓
```

---

# 35. 截止后的 UI

关闭后：

```text
本回合已结束

正在结算最终结果……
```

Finalization 完成后：

```text
Day 17 Canon

[获胜内容]

作者：xxx
最终票数：123

Day 18 已开始
```

---

# 36. 故事历史

提供：

```http
GET /api/stories/:id/history
```

返回：

```text
Opening
Day 1 Canon
Day 2 Canon
Day 3 Canon
...
```

前端可以显示完整故事。

---

# 37. 故事正文生成

最终故事可以逻辑上表示为：

```text
opening
+
canonical submission Day 1
+
canonical submission Day 2
+
canonical submission Day 3
+
...
```

数据库不需要把整个故事正文反复复制。

只保存：

```text
Opening
+
Canonical Submission References
```

---

# 38. 管理员

MVP 提供最基本管理员能力：

```text
查看所有投稿
删除/隐藏违规投稿
查看用户
手动处理异常回合
```

管理员删除投稿：

```text
status = removed
```

不要直接物理 DELETE。

这样可以保留审计记录。

---

# 39. 管理员不能随意修改 Canon

正常情况下：

```text
Canon
```

由 Finalization 自动产生。

普通管理 API 不应该提供：

```text
POST /set-canon
```

这种随意修改接口。

如果以后需要管理员纠错，可以设计专门的：

```text
admin correction
```

并留下：

```text
reason
admin_id
timestamp
old_value
new_value
```

---

# 40. 数据完整性

必须保证以下 invariant：

### Invariant 1

一个 Segment 最多有一个 Canon：

```text
canonical_submission_id
```

---

### Invariant 2

已经 finalized 的 Segment：

```text
不能投稿
不能投票
```

---

### Invariant 3

所有投稿必须属于一个 Segment。

---

### Invariant 4

所有投票必须属于一个 Submission。

---

### Invariant 5

投票对应的 Submission 必须属于同一个 Segment。

不能出现：

```text
vote.segment_id = Day 1
vote.submission_id = Day 2 submission
```

服务器必须检查。

---

### Invariant 6

已经成为 Canon 的 Segment 不能被普通用户重新结算。

---

### Invariant 7

同一个 Segment 只能创建一个下一 Segment。

---

# 41. Cloudflare 架构

最终结构：

```text
                Internet
                    │
                    ▼
             Cloudflare
                    │
          ┌─────────┴─────────┐
          │                   │
          ▼                   ▼
      Static Assets        Worker
                              │
                              ▼
                             D1
```

不需要：

```text
VPS
Docker
Nginx
Redis
PostgreSQL
WebSocket Server
```

---

# 42. Worker 项目结构

推荐：

```text
project/
│
├── src/
│   ├── index.ts
│   │
│   ├── api/
│   │   ├── story.ts
│   │   ├── segment.ts
│   │   ├── submission.ts
│   │   ├── vote.ts
│   │   ├── auth.ts
│   │   └── admin.ts
│   │
│   ├── services/
│   │   ├── story.ts
│   │   ├── segment.ts
│   │   ├── submission.ts
│   │   ├── voting.ts
│   │   ├── finalization.ts
│   │   └── auth.ts
│   │
│   ├── db/
│   │   └── queries.ts
│   │
│   └── utils/
│       ├── time.ts
│       ├── validation.ts
│       └── text.ts
│
├── public/
│   ├── index.html
│   ├── app.js
│   └── style.css
│
├── migrations/
│   └── 0001_initial.sql
│
├── wrangler.jsonc
├── package.json
└── README.md
```

---

# 43. 不要过度工程化

MVP 明确禁止：

```text
微服务
GraphQL
Redis
消息队列
WebSocket
Kubernetes
Docker
复杂 ORM
复杂状态管理
AI
区块链
Token
NFT
```

先把：

```text
每日投稿
+
投票
+
自动结算
+
故事推进
```

做正确。

---

# 44. 开发阶段

## Phase 1：数据库

完成：

```text
stories
segments
submissions
votes
users
```

以及：

```text
foreign keys
unique constraints
indexes
migration
```

---

## Phase 2：时间系统

实现：

```text
UTC
+
UTC+8 business day
+
opened_at
+
closes_at
```

测试：

```text
23:59:59
00:00:00
00:00:01
23:59:59
24:00:00
```

尤其测试边界。

---

# 45. Phase 3：Segment Lifecycle

实现：

```text
open
↓
finalizing
↓
finalized
```

测试：

```text
正常结束
无人请求后再访问
多个请求同时触发
```

---

# 46. Phase 4：Submission

实现：

```text
POST submission
GET submissions
character count
80–300 validation
```

测试：

```text
79
80
81
299
300
301
```

以及：

```text
emoji
中文
英文
换行
空格
组合字符
```

---

# 47. Phase 5：Voting

实现：

```text
POST vote
duplicate protection
vote_count
```

测试：

```text
重复点击
并发请求
关闭后投票
投不存在的 submission
投其他 segment 的 submission
```

---

# 48. Phase 6：Finalization

实现：

```text
统计票数
选择 winner
写入 Canon
创建下一 Segment
```

重点测试：

```text
两个请求同时 Finalize
```

必须保证：

```text
只有一个 Canon
只有一个下一 Segment
```

---

# 49. Phase 7：Frontend

实现：

```text
故事正文
当前回合
倒计时
投稿框
字符统计
投稿列表
投票按钮
登录
```

---

# 50. Phase 8：Admin

实现：

```text
管理员登录
投稿管理
违规投稿隐藏
异常回合查看
```

---

# 51. Phase 9：安全测试

至少测试：

```text
XSS
CSRF
SQL injection
duplicate vote
forged user_id
forged segment_id
forged vote_count
closed segment submission
closed segment vote
oversized request
concurrent finalization
```

---

# 52. API 安全原则

客户端永远不能决定：

```text
user_id
author_id
vote_count
status
canonical_submission_id
created_at
```

例如：

错误：

```json
{
    "user_id": "123",
    "content": "..."
}
```

正确：

```json
{
    "content": "..."
}
```

服务器通过：

```text
session
```

知道是谁。

---

# 53. MVP 不需要 Cron

第一版：

```text
Lazy Finalization
```

即可。

第二阶段可以增加：

```text
Cloudflare Cron
```

例如：

```text
每天 00:01
```

执行：

```text
finalize expired segments
```

但 Cron 是：

```text
辅助机制
```

不是：

```text
业务正确性的唯一依赖
```

---

# 54. 推荐增加的索引

例如：

```sql
CREATE INDEX idx_segments_story_day
ON segments(story_id, day);

CREATE INDEX idx_submissions_segment
ON submissions(segment_id);

CREATE INDEX idx_submissions_segment_votes
ON submissions(segment_id, vote_count DESC);

CREATE INDEX idx_votes_submission
ON votes(submission_id);

CREATE INDEX idx_votes_segment
ON votes(segment_id);
```

具体根据 D1 查询计划再调整。

---

# 55. 未来扩展

MVP 稳定之后，再考虑：

```text
评论
```

```text
用户主页
```

```text
关注
```

```text
点赞
```

```text
通知
```

```text
多故事
```

```text
标签
```

```text
故事分类
```

```text
排行榜
```

```text
历史版本
```

```text
投稿作者统计
```

```text
AI 辅助总结
```

```text
AI 自动生成候选续写
```

---

# 56. 多故事

当前数据库设计已经支持多故事：

```text
Story A
 ├── Day 1
 ├── Day 2
 └── Day 3

Story B
 ├── Day 1
 ├── Day 2
 └── Day 3
```

因此：

```text
stories.id
```

是整个系统的重要顶层 ID。

---

# 57. 一个完整回合示例

假设：

```text
2026-09-23 00:00 UTC+8
```

Day 10 开始。

数据库：

```text
segment:
day = 10
status = open
opened_at = 2026-09-22T16:00:00Z
closes_at = 2026-09-23T16:00:00Z
```

---

用户 A：

```text
10:05
提交 150 字
```

用户 B：

```text
11:20
提交 200 字
```

用户 C：

```text
15:30
提交 120 字
```

期间所有人都可以投票。

例如：

```text
A = 35
B = 48
C = 17
```

---

到：

```text
2026-09-23 16:00 UTC
```

Day 10 关闭。

之后：

```text
A 投稿 → 拒绝
B 投稿 → 拒绝
C 投稿 → 拒绝

任何新投票 → 拒绝
```

Finalization：

```text
B = 48
```

因此：

```text
Day 10 Canon = B
```

然后创建：

```text
Day 11
parent_segment_id = Day 10
status = open
```

---

# 58. 用户体验上的核心循环

整个产品实际上只有一个核心循环：

```text
阅读当前故事
      ↓
思考“接下来会发生什么”
      ↓
写下自己的续写
      ↓
查看其他人的续写
      ↓
投票
      ↓
等待一天
      ↓
查看最终 Canon
      ↓
继续阅读
      ↓
再次创作
```

所以 UI 不应该把它做成普通论坛。

核心动作应该始终围绕：

```text
READ
WRITE
VOTE
CONTINUE
```

---

# 59. MVP 完成标准

当以下流程全部成功时，MVP 才算完成：

```text
管理员创建故事
        ↓
设置 Opening
        ↓
创建 Day 1
        ↓
00:00 开放
        ↓
用户注册
        ↓
用户投稿
        ↓
其他用户查看投稿
        ↓
用户投票
        ↓
用户可以在投稿后继续投票
        ↓
24:00 到达
        ↓
投稿关闭
        ↓
投票关闭
        ↓
Finalization
        ↓
统计票数
        ↓
选择最高票投稿
        ↓
设置 Canon
        ↓
创建 Day 2
        ↓
Day 2 从 Day 1 Canon 继续
```

并且：

```text
并发 Finalization 不产生重复 Day
并发 Vote 不产生重复票
非法请求不能绕过状态限制
用户不能伪造其他用户身份
用户不能直接修改 Canon
```

---

# 60. AI Agent 执行原则

开发 Agent 时要求：

1. **先实现数据库和生命周期，再实现 UI。**
2. 不要擅自增加产品规则。
3. 对尚未确定的规则使用配置或在 README 中明确标记。
4. 所有业务状态由服务器判断。
5. 所有权限由服务器判断。
6. 所有时间判断由服务器完成。
7. 所有字符长度由服务器重新计算。
8. 所有投票限制必须由数据库约束兜底。
9. Finalization 必须能够安全处理并发。
10. 不为了“未来可能需要”提前加入复杂基础设施。
11. 每完成一个 Phase 都运行对应测试。
12. 所有数据库 migration 必须可重复部署。
13. 前端不保存任何可以直接改变业务状态的可信数据。
14. MVP 优先保证正确性，而不是功能数量。

---

# 61. 第一版明确不实现

以下功能全部暂时排除：

```text
评论系统
私信
关注
点赞
复杂用户等级
积分
Token
NFT
区块链
AI 生成
AI 审核
分支故事
多人实时协作编辑
WebSocket
实时聊天室
Markdown
富文本编辑器
图片上传
视频
音频
复杂推荐算法
```

先验证：

> **“每天让社区共同决定故事下一步”这个核心循环是否成立。**

---

# 62. 最终技术栈

### Backend

```text
Cloudflare Workers
TypeScript
```

### Database

```text
Cloudflare D1
SQLite
```

### Frontend

```text
HTML
CSS
Vanilla JavaScript
```

### Authentication

```text
Session Cookie
Argon2id password hashing
```

### Deployment

```text
Cloudflare Workers / Pages
```

### Time

```text
UTC storage
UTC+8 business timezone
```

### Core architecture

```text
Stateless Worker
        +
D1 persistent state
        +
Lazy Finalization
```

---

# 63. 最终架构图

```text
                         ┌──────────────┐
                         │    User      │
                         └──────┬───────┘
                                │
                                ▼
                    ┌─────────────────────┐
                    │ Cloudflare Worker   │
                    │                     │
                    │ Auth                │
                    │ Submission         │
                    │ Voting              │
                    │ Segment Lifecycle   │
                    │ Finalization        │
                    └──────────┬──────────┘
                               │
                               ▼
                       ┌───────────────┐
                       │      D1       │
                       │               │
                       │ stories       │
                       │ segments      │
                       │ submissions   │
                       │ votes         │
                       │ users         │
                       └───────────────┘
```

故事推进：

```text
             ┌───────────────────┐
             │     Opening       │
             └─────────┬─────────┘
                       │
                       ▼
                 ┌───────────┐
                 │  Day N    │
                 │   OPEN    │
                 └─────┬─────┘
                       │
              ┌────────┴────────┐
              │                 │
              ▼                 ▼
           投稿                  投票
              │                 │
              └────────┬────────┘
                       │
                       ▼
                 24:00 UTC+8
                       │
                       ▼
                 ┌───────────┐
                 │ FINALIZING│
                 └─────┬─────┘
                       │
                       ▼
                选择最高票投稿
                       │
                       ▼
                 ┌───────────┐
                 │   Canon   │
                 └─────┬─────┘
                       │
                       ▼
                 ┌───────────┐
                 │  Day N+1  │
                 │    OPEN   │
                 └───────────┘
                       │
                       └──────→ 循环
```

---

# 64. 最重要的产品定义

这个项目不是：

```text
一天投稿
↓
第二天投票
```

也不是：

```text
投稿阶段
↓
投票阶段
```

而是：

```text
一个 24 小时的社区创作回合
```

在这个回合内：

```text
创造
+
阅读
+
投票
```

同时发生。

最终：

```text
社区当天产生的所有候选续写
        ↓
当天累计投票
        ↓
24:00 冻结
        ↓
选出 Canon
        ↓
Canon 成为下一天故事的一部分
```

这就是整个产品最核心的状态机。
