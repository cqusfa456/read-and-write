// 明确的产品规则配置（plan §9 / §24 / §25 要求"做成明确配置"，不写死在代码分支里）。
// 注意：投票规则与 migration 中 votes 表的 UNIQUE 约束必须保持一致（见 README「可配置规则」）。
export const CONFIG = {
  /** 每回合每用户可投票数。MVP = 1，对应 UNIQUE(segment_id, user_id)（plan §9 默认）。 */
  VOTES_PER_USER_PER_SEGMENT: 1,
  /** 同一回合是否允许同一用户提交多个投稿（plan §24）。 */
  ALLOW_MULTIPLE_SUBMISSIONS_PER_SEGMENT: true,
  /** 是否允许给自己的投稿投票（plan §25）。 */
  ALLOW_SELF_VOTE: false,
  /** 单次投稿字符数限制（plan §17，字符定义见 utils/text.ts）。 */
  MIN_CHARS: 80,
  MAX_CHARS: 300,
  /** 请求体上限（plan §31）：300 字 UTF-8 最多约 1200 字节，8KB 足够且能挡住巨型 JSON。 */
  MAX_BODY_BYTES: 8192,
  /** 管理员名单（plan §38）；MVP 以用户名配置，见 README。 */
  ADMIN_USERNAMES: ['admin'],
  /** Session Cookie 有效期。 */
  SESSION_TTL_MS: 30 * 24 * 60 * 60 * 1000,
  /** Lazy Finalization 单次请求最多补结的天数（长期闲置后由后续请求继续）。 */
  CATCHUP_MAX_STEPS: 64,
};
