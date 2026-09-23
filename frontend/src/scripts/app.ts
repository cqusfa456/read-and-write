// 每日接龙 · 前端逻辑（DaisyUI 版）：与 API 的契约不变（/api/*）
// 安全（plan §30）：用户内容一律 textContent 渲染，绝不使用 innerHTML。
const $ = (id: string) => document.getElementById(id) as HTMLElement;

interface Me { id: string; username: string; is_admin: boolean }
interface Segment { id: string; day: number; closes_at: string; status: string }
interface Sub {
  id: string; content: string; character_count: number; vote_count: number;
  author: { id: string; username: string }; created_at: string; voted: boolean; is_mine: boolean;
}
interface Canon { day: number; content: string | null; vote_count: number | null; author: string | null }

const state: { me: Me | null; story: { title: string; opening: string } | null; segment: Segment | null; subs: Sub[]; canons: Canon[] } = {
  me: null, story: null, segment: null, subs: [], canons: [],
};

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

// ---------- 渲染 ----------

function renderAuth() {
  const logged = Boolean(state.me);
  ($('login-form') as HTMLFormElement).hidden = logged;
  $('user-box').hidden = !logged;
  if (logged) $('user-name').textContent = state.me!.username + (state.me!.is_admin ? '（管理员）' : '');
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
  return Boolean(state.segment && state.segment.status === 'open' && Date.now() < Date.parse(state.segment.closes_at));
}

function renderRound() {
  const seg = state.segment;
  const open = roundOpen();
  $('day-label').textContent = seg ? `Day ${seg.day}` : 'Day ?';
  $('status-line').textContent = '';
  if (seg) {
    const mk = (ok: boolean, label: string) => {
      const b = document.createElement('span');
      b.className = 'badge badge-sm ml-1 ' + (ok ? 'badge-success' : 'badge-ghost');
      b.textContent = `${label} ${open ? '✓' : '✕'}`;
      $('status-line').appendChild(b);
    };
    mk(open, '投稿');
    mk(open, '投票');
  }
  $('compose').hidden = !open;
  $('closed-note').hidden = open || !seg;
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
      btn.className = 'btn btn-primary btn-sm';
      btn.textContent = sub.voted ? '已投票' : '投票';
      btn.disabled = !open || sub.voted || spent;
      btn.addEventListener('click', () => vote(sub.id));
      foot.appendChild(btn);
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
  if (!state.segment) {
    el.textContent = '距离本回合结束：--:--:--';
    return;
  }
  const left = Date.parse(state.segment.closes_at) - Date.now();
  if (left <= 0) {
    el.textContent = '本回合时间已到';
    return;
  }
  const s = Math.floor(left / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  el.textContent = `距离本回合结束：${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
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
