// 每日接龙 · 前端逻辑（DaisyUI 版）：与 API 的契约不变（/api/*）
// 安全（plan §30）：用户内容一律 textContent 渲染，绝不使用 innerHTML。
const $ = (id: string) => document.getElementById(id) as HTMLElement;

// 管理员创建故事时的开篇草稿（测试阶段预填，管理员可在页面上修改）
const DEFAULT_OPENING = `黄色的灯光，打在泛黄的书页上，少女坐在沙发上，慢慢地看着手中的书。不知过了多久，少女右手托着的书页慢慢变少，最后只剩下书的精装封皮。合上书，少女站了起来，走在厚厚的地毯上，像幽灵一样在这大图书馆里游走。
对于铅字中毒者来说，只有翻开书页才能平静心中的那一团火焰，只有沉浸在书香才能少许安神。少女在图书馆中不断地游走，寻找中意的图书，即使每一次翻开书本，现实都会上演同样的闹剧。
对吧，只是在读书而已，不过是每个故事背后，都在现实中有所投射吧了。`;

interface Me { id: string; username: string; is_admin: boolean }
interface Segment { id: string; day: number; opened_at: string; closes_at: string; status: string }
interface Sub {
  id: string; content: string; character_count: number; vote_count: number;
  author: { id: string; username: string }; created_at: string; voted: boolean; is_mine: boolean;
}
interface Canon { day: number; content: string | null; vote_count: number | null; author: string | null }

const state: {
  me: Me | null;
  story: { id: string; title: string; opening: string; start_date: string | null; end_date: string | null } | null;
  segment: Segment | null; subs: Sub[]; canons: Canon[];
} = { me: null, story: null, segment: null, subs: [], canons: [] };

async function api(path: string, options: RequestInit = {}): Promise<any> {
  const res = await fetch(path, { headers: { 'content-type': 'application/json' }, credentials: 'same-origin', ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `请求失败（${res.status}）`);
  return data;
}

function banner(message: string) {
  const el = $('banner');
  el.textContent = message || '';
  el.hidden = !message;
}

const countChars = (text: string) => Array.from(text).length;

// 排期（UTC+8 业务日）；无排期 = 长期开放
const DAY_MS = 86_400_000;
const phaseOf = (): 'before' | 'running' | 'ended' => {
  const s = state.story;
  if (!s) return 'running';
  const now = Date.now();
  if (s.start_date && now < Date.parse(s.start_date + 'T00:00:00+08:00')) return 'before';
  if (s.end_date && now >= Date.parse(s.end_date + 'T00:00:00+08:00') + DAY_MS) return 'ended';
  return 'running';
};

/** Day 由开稿日期计算：开稿前 = Day 0；开稿日起逐日 +1；截止后冻结在截止那天。 */
const displayDay = (): number | null => {
  const s = state.story;
  const fallback = state.segment?.day ?? null;
  if (!s?.start_date) return fallback; // 无排期：沿用段号
  const startMs = Date.parse(s.start_date + 'T00:00:00+08:00');
  const now = Date.now();
  if (now < startMs) return 0;
  if (s.end_date) {
    const endOpenMs = Date.parse(s.end_date + 'T00:00:00+08:00');
    if (now >= endOpenMs + DAY_MS) return Math.round((endOpenMs - startMs) / DAY_MS) + 1;
  }
  return Math.floor((now - startMs) / DAY_MS) + 1;
};

/** Day 由开稿日期计算：开稿前 = Day 0；开稿日起逐日 +1；截止后冻结在截止那天。 */
const displayDay = (): number | null => {
  const s = state.story;
  const fallback = state.segment?.day ?? null;
  if (!s?.start_date) return fallback; // 无排期：沿用段号
  const startMs = Date.parse(s.start_date + 'T00:00:00+08:00');
  const now = Date.now();
  if (now < startMs) return 0;
  if (s.end_date) {
    const endOpenMs = Date.parse(s.end_date + 'T00:00:00+08:00');
    if (now >= endOpenMs + DAY_MS) return Math.round((endOpenMs - startMs) / DAY_MS) + 1;
  }
  return Math.floor((now - startMs) / DAY_MS) + 1;
};

/** Day 由开稿日期计算：开稿前 = Day 0；开稿日起逐日 +1；截止后冻结在截止那天。 */
const displayDay = (): number | null => {
  const s = state.story;
  const fallback = state.segment?.day ?? null;
  if (!s?.start_date) return fallback; // 无排期：沿用段号
  const startMs = Date.parse(s.start_date + 'T00:00:00+08:00');
  const now = Date.now();
  if (now < startMs) return 0;
  if (s.end_date) {
    const endOpenMs = Date.parse(s.end_date + 'T00:00:00+08:00');
    if (now >= endOpenMs + DAY_MS) return Math.round((endOpenMs - startMs) / DAY_MS) + 1;
  }
  return Math.floor((now - startMs) / DAY_MS) + 1;
};

/** Day 由开稿日期计算：开稿前 = Day 0；开稿日起逐日 +1；截止后冻结在截止那天。 */
const displayDay = (): number | null => {
  const s = state.story;
  const fallback = state.segment?.day ?? null;
  if (!s?.start_date) return fallback; // 无排期：沿用段号
  const startMs = Date.parse(s.start_date + 'T00:00:00+08:00');
  const now = Date.now();
  if (now < startMs) return 0;
  if (s.end_date) {
    const endOpenMs = Date.parse(s.end_date + 'T00:00:00+08:00');
    if (now >= endOpenMs + DAY_MS) return Math.round((endOpenMs - startMs) / DAY_MS) + 1;
  }
  return Math.floor((now - startMs) / DAY_MS) + 1;
};

// ---------- 渲染 ----------

function renderAuth() {
  const logged = Boolean(state.me);
  ($('login-form') as HTMLFormElement).hidden = logged;
  $('user-box').hidden = !logged;
  if (logged) $('user-name').textContent = state.me!.username + (state.me!.is_admin ? '（管理员）' : '');
  $('admin-card').hidden = !state.me?.is_admin;
  if (state.me?.is_admin) {
    const title = $('admin-title') as HTMLInputElement;
    const opening = $('admin-opening') as HTMLTextAreaElement;
    const start = $('admin-start') as HTMLInputElement;
    const end = $('admin-end') as HTMLInputElement;
    if (!title.value && !opening.value && !start.value && !end.value) {
      title.value = state.story?.title && state.story.title !== '每日接龙' ? state.story.title : '';
      opening.value = state.story?.opening || DEFAULT_OPENING;
      start.value = state.story?.start_date ?? '';
      end.value = state.story?.end_date ?? '';
    }
  }
}

async function adminSave() {
  try {
    const payload = JSON.stringify({
      title: ($('admin-title') as HTMLInputElement).value.trim(),
      opening: ($('admin-opening') as HTMLTextAreaElement).value,
      start_date: ($('admin-start') as HTMLInputElement).value,
      end_date: ($('admin-end') as HTMLInputElement).value,
    });
    if (state.story) {
      await api(`/api/admin/stories/${state.story.id}`, { method: 'PATCH', body: payload });
    } else {
      await api('/api/admin/stories', { method: 'POST', body: payload });
    }
    banner('');
    await loadAll();
  } catch (err) {
    banner((err as Error).message);
  }
}

function renderStory() {
  $('story-title').textContent = state.story ? state.story.title : '每日接龙';
  const box = $('story-text');
  box.textContent = '';
  if (!state.story) return;
  const add = (cls: string, text: string) => {
    const el = document.createElement('p');
    el.className = cls;
    el.textContent = text;
    box.appendChild(el);
    return el;
  };
  add('mt-2 text-sm tracking-widest opacity-60', '开篇');
  add('whitespace-pre-wrap leading-loose', state.story.opening);
  for (const canon of state.canons) {
    add('mt-6 text-sm tracking-widest opacity-60', `Day ${canon.day} Canon`);
    if (canon.content) {
      add('whitespace-pre-wrap leading-loose', canon.content);
      add('text-right text-xs opacity-60', `—— ${canon.author} · ${canon.vote_count} 票`);
    } else {
      add('text-sm italic opacity-50', '（本回合无人投稿）');
    }
  }
}

function roundOpen() {
  return Boolean(
    phaseOf() === 'running' &&
      state.segment &&
      state.segment.status === 'open' &&
      Date.now() >= Date.parse(state.segment.opened_at) &&
      Date.now() < Date.parse(state.segment.closes_at),
  );
}

function renderRound() {
  const seg = state.segment;
  const open = roundOpen();
  $('day-label').textContent = seg ? `Day ${seg.day}` : 'Day ?';
  $('status-line').textContent = '';
  if (seg) {
    const mk = (label: string) => {
      const b = document.createElement('span');
      b.className = 'badge badge-sm ml-1 ' + (open ? 'badge-success' : 'badge-ghost');
      b.textContent = `${label} ${open ? '✓' : '✕'}`;
      $('status-line').appendChild(b);
    };
    mk('投稿');
    mk('投票');
  }
  const s = state.story;
  $('schedule-line').textContent =
    s?.start_date || s?.end_date
      ? `排期：${s?.start_date ?? '即刻'} 00:00 → ${s?.end_date ?? '不限'} 24:00（UTC+8）`
      : '';
  $('compose').hidden = !open;
  const note = $('closed-note');
  note.hidden = open || !seg || phaseOf() === 'running';
  if (!note.hidden) {
    note.textContent =
      phaseOf() === 'before'
        ? `本故事将于 ${state.story!.start_date} 00:00（UTC+8）开稿。`
        : phaseOf() === 'ended'
          ? '本故事已完结，感谢参与这场共写。'
          : '本回合已结束，正在结算最终结果……';
  }
  const btn = $('submit-btn') as HTMLButtonElement;
  btn.disabled = !state.me;
  btn.textContent = state.me ? '提交续写' : '登录后可投稿';
}

function renderSubs() {
  const list = $('sub-list');
  list.textContent = '';
  $('empty-note').hidden = state.subs.length > 0 || !state.segment;
  const open = roundOpen();
  const spent = state.subs.some((s) => s.voted);
  for (const sub of state.subs) {
    const li = document.createElement('li');
    li.className = 'rounded-box bg-base-200 p-4' + (sub.is_mine ? ' ring-2 ring-primary' : '');
    const head = document.createElement('div');
    head.className = 'flex items-center justify-between text-xs opacity-70';
    const author = document.createElement('span');
    author.className = 'font-semibold';
    author.textContent = sub.author.username + (sub.is_mine ? '（我）' : '');
    const time = document.createElement('span');
    time.textContent = sub.created_at.replace('T', ' ').slice(0, 16) + ' UTC';
    head.appendChild(author);
    head.appendChild(time);
    const content = document.createElement('p');
    content.className = 'my-2 whitespace-pre-wrap leading-relaxed';
    content.textContent = sub.content;
    const foot = document.createElement('div');
    foot.className = 'flex items-center justify-end gap-2 text-sm';
    const votes = document.createElement('span');
    votes.className = 'badge badge-outline';
    votes.textContent = `${sub.vote_count} 票`;
    foot.appendChild(votes);
    if (state.me && !sub.is_mine) {
      const btn = document.createElement('button');
      btn.className = sub.voted ? 'btn btn-outline btn-error btn-sm' : 'btn btn-primary btn-sm';
      btn.textContent = sub.voted ? '撤票' : '投票';
      btn.disabled = !open || (!sub.voted && spent);
      btn.addEventListener('click', () => (sub.voted ? unvote(sub.id) : vote(sub.id)));
      foot.appendChild(btn);
    }
    if (state.me?.is_admin) {
      const del = document.createElement('button');
      del.className = 'btn btn-outline btn-error btn-sm';
      del.textContent = '删除';
      del.addEventListener('click', async () => {
        try {
          await api(`/api/admin/submissions/${sub.id}/remove`, { method: 'POST', body: '{}' });
          await loadAll();
        } catch (err) {
          banner((err as Error).message);
        }
      });
      foot.appendChild(del);
    }
    li.appendChild(head);
    li.appendChild(content);
    li.appendChild(foot);
    list.appendChild(li);
  }
}

function render() {
  renderAuth();
  renderStory();
  renderRound();
  renderSubs();
  tickCountdown();
}

// ---------- 数据 ----------

async function loadAll() {
  const stories: Array<{ id: string }> = await api('/api/stories');
  if (!stories.length) {
    banner('还没有故事，等待管理员创建第一篇。');
    return;
  }
  state.story = await api(`/api/stories/${stories[0].id}`);
  state.segment = (state.story as any)?.current_segment ?? null;
  const history = await api(`/api/stories/${stories[0].id}/history`);
  state.canons = history.canons;
  state.subs = state.segment ? await api(`/api/segments/${state.segment.id}/submissions`) : [];
  render();
}

async function refreshMe() {
  try {
    state.me = await api('/api/auth/me');
  } catch {
    state.me = null;
  }
  renderAuth();
}

async function vote(submissionId: string) {
  try {
    await api('/api/votes', { method: 'POST', body: JSON.stringify({ submission_id: submissionId }) });
    await loadAll();
  } catch (err) {
    banner((err as Error).message);
  }
}

/** 撤票（功能2）：撤回后可改投其他投稿。 */
async function unvote(submissionId: string) {
  try {
    await api(`/api/votes/${submissionId}`, { method: 'DELETE' });
    await loadAll();
  } catch (err) {
    banner((err as Error).message);
  }
}

async function submitDraft() {
  try {
    await api('/api/submissions', {
      method: 'POST',
      body: JSON.stringify({ segment_id: state.segment!.id, content: ($('content') as HTMLTextAreaElement).value }),
    });
    ($('content') as HTMLTextAreaElement).value = '';
    tickCounter();
    await loadAll();
  } catch (err) {
    banner((err as Error).message);
  }
}

// ---------- 计时 ----------

function tickCounter() {
  const n = countChars(($('content') as HTMLTextAreaElement).value);
  const el = $('char-count');
  el.textContent = `${n} / 300`;
  el.classList.toggle('text-error', n > 300);
}

function tickCountdown() {
  const el = $('countdown');
  const phase = phaseOf();
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  };
  if (phase === 'before') {
    const left = Date.parse(state.story!.start_date! + 'T00:00:00+08:00') - Date.now();
    el.textContent = `距离开稿：${fmt(Math.max(left, 0))}`;
    return;
  }
  if (phase === 'ended') {
    el.textContent = '本故事已完结';
    return;
  }
  if (!state.segment) {
    el.textContent = '距离本回合结束：--:--:--';
    return;
  }
  const left = Date.parse(state.segment.closes_at) - Date.now();
  if (left <= 0) {
    el.textContent = '本回合时间已到';
    return;
  }
  el.textContent = `距离本回合结束：${fmt(left)}`;
}

// ---------- 事件 ----------

$('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    state.me = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: ($('username') as HTMLInputElement).value, password: ($('password') as HTMLInputElement).value }),
    });
    banner('');
    renderAuth();
    await loadAll();
  } catch (err) {
    banner((err as Error).message);
  }
});

$('register-btn').addEventListener('click', async () => {
  try {
    state.me = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username: ($('username') as HTMLInputElement).value, password: ($('password') as HTMLInputElement).value }),
    });
    banner('');
    renderAuth();
    await loadAll();
  } catch (err) {
    banner((err as Error).message);
  }
});

$('logout-btn').addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST', body: '{}' });
  state.me = null;
  renderAuth();
  await loadAll();
});

$('submit-btn').addEventListener('click', submitDraft);
$('content').addEventListener('input', tickCounter);
$('admin-save-btn').addEventListener('click', adminSave);
$('admin-reset-btn').addEventListener('click', async () => {
  if (!confirm('确定一键清除全部活动数据？\n\n所有投稿、投票、回合记录将被清空，回合并按排期重建 Day 1；用户账号保留。\n此操作不可撤销。')) return;
  try {
    await api('/api/admin/reset', { method: 'POST', body: '{}' });
    banner('活动数据已清空，可以开启下一场活动。');
    await loadAll();
  } catch (err) {
    banner((err as Error).message);
  }
});
$('admin-reset-btn').addEventListener('click', async () => {
  if (!confirm('确定一键清除活动数据？\n\n将清空全部投稿、投票、回合并按排期重建 Day 1；用户账号保留。\n此操作不可撤销。')) return;
  try {
    await api('/api/admin/reset', { method: 'POST', body: '{}' });
    banner('活动数据已清空，可以开始下一场活动。');
    await loadAll();
  } catch (err) {
    banner((err as Error).message);
  }
});

setInterval(tickCountdown, 1000);
setInterval(loadAll, 30000); // 轻量轮询：30 秒刷新回合与投稿

(async function boot() {
  tickCounter();
  banner('');
  await refreshMe();
  try {
    await loadAll();
  } catch (err) {
    banner((err as Error).message);
  }
})();
