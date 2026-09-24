// 时间系统（plan §11）：存储一律 UTC ISO 8601，业务规则固定 UTC+8（Asia/Shanghai，无夏令时）。
const DAY_MS = 86_400_000;
const TZ_OFFSET_MS = 8 * 3_600_000;

/** 统一时间戳字符串格式（ISO 8601 UTC）：字符串序 == 时间序，SQL 里可直接比较。 */
export function isoAt(ms: number): string {
  return new Date(ms).toISOString();
}

export function msAt(iso: string): number {
  return Date.parse(iso);
}

/** 当前 UTC+8 业务日的 [00:00, 24:00) 窗口。00:00 <= t < 24:00（plan §3.1）。 */
export function windowFor(nowMs: number): { openedAt: string; closesAt: string } {
  const start = Math.floor((nowMs + TZ_OFFSET_MS) / DAY_MS) * DAY_MS - TZ_OFFSET_MS;
  return { openedAt: isoAt(start), closesAt: isoAt(start + DAY_MS) };
}

/** 紧随 closesAt 之后的下一个业务日窗口（plan §57：Day N+1 从 Day N 的 closes_at 开始）。 */
export function windowAfter(closesAt: string): { openedAt: string; closesAt: string } {
  const start = msAt(closesAt);
  return { openedAt: isoAt(start), closesAt: isoAt(start + DAY_MS) };
}

/** 排期日期（YYYY-MM-DD，UTC+8 业务日）→ 该日 00:00 的 UTC 毫秒。 */
export function dateStartMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`) - TZ_OFFSET_MS;
}

/** 排期截止日（YYYY-MM-DD）→ 该日 24:00（即次日 00:00）的 UTC 毫秒。 */
export function dateEndMs(date: string): number {
  return dateStartMs(date) + DAY_MS;
}

/** 以排期开始日构造 Day 1 的窗口。 */
export function firstWindowOf(startDate: string): { openedAt: string; closesAt: string } {
  const start = dateStartMs(startDate);
  return { openedAt: isoAt(start), closesAt: isoAt(start + DAY_MS) };
}
