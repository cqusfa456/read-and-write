// 每日接龙 · 前端（plan §32–§35：HTML + CSS + Vanilla JS，无框架）
// 安全（plan §30）：用户内容一律 textContent 渲染，绝不使用 innerHTML。
const $ = (id) => document.getElementById(id);

const state = {
  me: null,
  story: null,
  segment: null,
  subs: [],
  canons: [],
};

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `请求失败（${res.status}）`);
  return data;
}

function banner(message) {
  const el = $('banner');
  el.textContent = message || '';
  el.hidden = !message;
}

function countChars(text) {
  return Array.from(text).length;
}

// ---------- 渲染 ----------

function renderAuth() {
  const logged = Boolean(state.me);
  $('login-form').hidden = logged;
  $('user-box').hidden = !logged;
  if (logged) $('user-name').textContent = state.me.username + (state.me.is_admin ? '（管理员）' : '');
}

function renderStory() {
  $('story-title').textContent = state.story ? state.story.title : '每日接龙';
  const box = $('story-text');
  box.textContent = '';
  if (!state.story) return;
  const opening = document.createElement('p');
  opening.className = 'canon-day';
  opening.textContent = '开篇';
  box.appendChild(opening);
  const openingText = document.createElement('p');
  openingText.className = 'sub-content';
  openingText.textContent = state.story.opening;
  box.appendChild(openingText);
  for (const canon of state.canons) {
    const day = document.createElement('span');
    day.className = 'canon-day';
    day.textContent = `Day ${canon.day} Canon`;
    box.appendChild(day);
    if (canon.content) {
      const text = document.createElement('p');
      text.className = 'sub-content';
      text.textContent = canon.content;
      box.appendChild(text);
      const by = document.createElement('span');
      by.className = 'canon-author';
      by.textContent = `—— ${canon.author} · ${canon.vote_count} 票`;
      box.appendChild(by);
    } else {
      const skip = document.createElement('p');
      skip.className = 'note';
      skip.textContent = '（本回合无人投稿）';
      box.appendChild(skip);
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
  $('status-line').textContent = seg ? `投稿 ${open ? '✓' : '✕'}　投票 ${open ? '✓' : '✕'}` : '';
  $('compose').hidden = !open;
  $('closed-note').hidden = open || !seg;
  $('submit-btn').disabled = !state.me;
  if (!state.me) $('submit-btn').textContent = '登录后可投稿';
  else $('submit-btn').textContent = '提交续写';
}

function renderSubs() {
  const list = $('sub-list');
  list.textContent = '';
  $('empty-note').hidden = state.subs.length > 0 || !state.segment;
  const open = roundOpen();
  const spent = state.subs.some((s) => s.voted);
  for (const sub of state.subs) {
    const li = document.createElement('li');
    li.className = 'sub-item' + (sub.is_mine ? ' mine' : '');
    const head = document.createElement('div');
    head.className = 'sub-head';
    const author = document.createElement('span');
    author.textContent = sub.author.username + (sub.is_mine ? '（我）' : '');
    const time = document.createElement('span');
    time.textContent = sub.created_at.replace('T', ' ').slice(0, 16) + ' UTC';
    head.appendChild(author);
    head.appendChild(time);
    const content = document.createElement('p');
    content.className = 'sub-content';
    content.textContent = sub.content;
    const foot = document.createElement('div');
    foot.className = 'sub-foot';
    const votes = document.createElement('span');
    votes.textContent = `${sub.vote_count} 票`;
    foot.appendChild(votes);
    if (state.me && !sub.is_mine) {
      const btn = document.createElement('button');
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
  const stories = await api('/api/stories');
  if (!stories.length) {
    banner('还没有故事，等待管理员创建第一篇。');
    return;
  }
  state.story = await api(`/api/stories/${stories[0].id}`);
  state.segment = state.story.current_segment;
  const history = await api(`/api/stories/${stories[0].id}/history`);
  state.canons = history.canons;
  if (state.segment) {
    state.subs = await api(`/api/segments/${state.segment.id}/submissions`);
  } else {
    state.subs = [];
  }
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

async function vote(submissionId) {
  try {
    await api('/api/votes', { method: 'POST', body: JSON.stringify({ submission_id: submissionId }) });
    await loadAll();
  } catch (err) {
    banner(err.message);
  }
}

async function submitDraft() {
  const content = $('content').value;
  try {
    await api('/api/submissions', {
      method: 'POST',
      body: JSON.stringify({ segment_id: state.segment.id, content }),
    });
    $('content').value = '';
    tickCounter();
    await loadAll();
  } catch (err) {
    banner(err.message);
  }
}

// ---------- 计时 ----------

function tickCounter() {
  const n = countChars($('content').value);
  const el = $('char-count');
  el.textContent = `${n} / 300`;
  el.classList.toggle('over', n > 300);
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
  const pad = (n) => String(n).padStart(2, '0');
  el.textContent = `距离本回合结束：${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

// ---------- 事件 ----------

$('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    state.me = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: $('username').value, password: $('password').value }),
    });
    banner('');
    await loadAll();
  } catch (err) {
    banner(err.message);
  }
});

$('register-btn').addEventListener('click', async () => {
  try {
    state.me = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username: $('username').value, password: $('password').value }),
    });
    banner('');
    await loadAll();
  } catch (err) {
    banner(err.message);
  }
});

$('logout-btn').addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST', body: '{}' });
  state.me = null;
  await loadAll();
});

$('submit-btn').addEventListener('click', submitDraft);
$('content').addEventListener('input', tickCounter);

setInterval(tickCountdown, 1000);
setInterval(loadAll, 30000); // 轻量轮询：30 秒刷新回合与投稿

(async function boot() {
  tickCounter();
  await refreshMe();
  try {
    await loadAll();
  } catch (err) {
    banner(err.message);
  }
})();
