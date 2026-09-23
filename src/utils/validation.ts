import { CONFIG } from '../config.ts';

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'x-content-type-options': 'nosniff',
    },
  });
}

export function apiError(message: string, status = 400): Response {
  return json({ error: message }, status);
}

/** 请求体读取（plan §31）：先限制大小再解析，不允许几十 MB 的 JSON 进来。 */
export async function readJson(request: Request): Promise<
  { ok: true; value: Record<string, unknown> } | { ok: false; response: Response }
> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > CONFIG.MAX_BODY_BYTES) {
    return { ok: false, response: apiError('请求体过大', 413) };
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).length > CONFIG.MAX_BODY_BYTES) {
    return { ok: false, response: apiError('请求体过大', 413) };
  }
  try {
    const value = JSON.parse(text);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return { ok: false, response: apiError('请求体必须是 JSON 对象') };
    }
    return { ok: true, value: value as Record<string, unknown> };
  } catch {
    return { ok: false, response: apiError('JSON 解析失败') };
  }
}

export function str(value: unknown, name: string, maxLen = 4096): { ok: true; value: string } | { ok: false; response: Response } {
  if (typeof value !== 'string' || value === '' || value.length > maxLen) {
    return { ok: false, response: apiError(`缺少或非法字段：${name}`) };
  }
  return { ok: true, value };
}

/** CSRF（plan §28）：写操作校验 Origin 与本站一致；配合 SameSite=Lax 的 Session Cookie。 */
export function originOk(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true; // 同源表单/脚本可能不带 Origin，Cookie 已由 SameSite=Lax 兜底
  return new URL(origin).host === new URL(request.url).host;
}
