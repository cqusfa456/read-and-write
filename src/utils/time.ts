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
