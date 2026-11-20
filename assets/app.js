// ===== Конфиг =====
const SITE = {
  owner: 'zelikovpavel556-commits',
  repo: 'zelikovpavel556-commits.github.io',
  branch: 'main',
  file: 'news.json',
};

// SHA-256 хеш пароля «T7se~3(rZ» (сам пароль в коде НЕ хранится)
const ADMIN_HASH = 'e4cd661b6931d052a88fb3c5391408f833c741f773bdc15dec0be4905e3792c4';

const state = {
  posts: [],
  editingId: null,
};

// ===== Утилиты =====
function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function b64encode(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

async function sha256Hex(text) {
  try {
    if (window.crypto && window.crypto.subtle) {
      const buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch (e) {
    // fallthrough to simple hash
  }
  // fallback для небезопасных контекстов (локально)
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (
    (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0')
  );
}

function hexEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function formatDate(value) {
  const d = new Date(value + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return value;
  try {
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch (e) {
    return value;
  }
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ===== Загрузка новостей =====
async function loadPosts() {
  const url = `https://raw.githubusercontent.com/${SITE.owner}/${SITE.repo}/${SITE.branch}/${SITE.file}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Не удалось загрузить новости (HTTP ' + res.status + ')');
  const data = await res.json();
  state.posts = Array.isArray(data) ? data : data.posts || [];
  renderPosts();
}

function renderPosts() {
  const container = document.getElementById('posts');
  container.innerHTML = '';
  const posts = [...state.posts].sort((a, b) =>
    String(b.date || '').localeCompare(String(a.date || ''))
  );
  if (!posts.length) {
    container.innerHTML = '<div class="empty">Пока нет новостей.<br>Зайдите позже!</div>';
    return;
  }
  for (const p of posts) {
    const card = document.createElement('article');
    card.className = 'post';
    const paragraphs = String(p.text || '')
      .split(/\n\s*\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => '<p>' + esc(s) + '</p>')
      .join('');
    card.innerHTML =
      '<div class="post-date">' +
      esc(formatDate(p.date)) +
      '</div>' +
      '<h2 class="post__title">' +
      esc(p.title) +
      '</h2>' +
      '<div class="post-text">' +
      (paragraphs || '<p>—</p>') +
      '</div>';
    container.appendChild(card);
  }
}

// ===== Работа с GitHub API (сохранение news.json) =====
async function githubPutContent(content, message, token) {
  const url = 'https://api.github.com/repos/' + SITE.owner + '/' + SITE.repo + '/contents/' + SITE.file + '?ref=' + SITE.branch;
  const headers = {
    'Authorization': 'Bearer ' + token,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const getRes = await fetch(url, { headers: headers });
  let sha;
  if (getRes.ok) {
    const meta = await getRes.json();
    sha = meta.sha;
  }
  const body = { message: message, content: b64encode(content) };
  if (sha) body.sha = sha;
  const putRes = await fetch(url, {
    method: 'PUT',
    headers: headers,
    body: JSON.stringify(body),
  });
  if (!putRes.ok) {
    let msg = 'Ошибка сохранения в GitHub';
    try {
      const err = await putRes.json();
      if (err && err.message) msg = err.message;
    } catch (e) {}
    throw new Error(msg);
  }
}

// ===== Админка: вход =====
async function verifyAdminPassword(pw) {
  const hash = await sha256Hex(pw);
  return hexEqual(hash, ADMIN_HASH);
}

// ===== Админка: список постов =====
function loadAdminList() {
  const container = document.getElementById('adminList');
  container.innerHTML = '';
  const posts = [...state.posts].sort((a, b) =>
    String(b.date || '').localeCompare(String(a.date || ''))
  );
  if (!posts.length) {
    container.innerHTML = '<div class="empty">Пока нет новостей.</div>';
    return;
  }
  for (const p of posts) {
    const item = document.createElement('div');
    item.className = 'admin-list-item';
    item.innerHTML =
      '<div class="admin-list-item__head">' +
      '<span class="admin-list-item__title">' + esc(p.title) + '</span>' +
      '<span class="admin-list-item__date">' + esc(formatDate(p.date)) + '</span>' +
      '</div>' +
      '<p class="admin-list-item__text">' + esc(p.text) + '</p>' +
      '<div class="admin-list-item__actions">' +
      '<button type="button" class="mini-btn" data-action="edit" data-id="' + esc(p.id) + '">Редактировать</button>' +
      '<button type="button" class="mini-btn mini-btn--danger" data-action="delete" data-id="' + esc(p.id) + '">Удалить</button>' +
      '</div>';
    container.appendChild(item);
  }

  container.querySelectorAll('.mini-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      const action = btn.getAttribute('data-action');
      if (action === 'delete') {
        const token = document.getElementById('adminToken').value.trim();
        if (!token) {
          document.getElementById('postStatus').textContent = 'Сначала вставьте GitHub token.';
          return;
        }
        const next = state.posts.filter((p) => p.id !== id);
        try {
          await githubPutContent(JSON.stringify({ posts: next }, null, 2), 'Delete news', token);
          state.posts = next;
          await loadPosts();
          loadAdminList();
        } catch (err) {
          document.getElementById('postStatus').textContent = 'Ошибка: ' + err.message;
        }
        return;
      }
      // edit
      const post = state.posts.find((p) => p.id === id);
      if (!post) return;
      state.editingId = id;
      document.getElementById('postTitle').value = post.title;
      document.getElementById('postDate').value = post.date;
      document.getElementById('postText').value = post.text;
      document.getElementById('postFormTitle').textContent = 'Редактировать новость';
      document.getElementById('postSave').textContent = 'Обновить';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

// ===== Админка: сохранение / обновление формы =====
function resetPostForm() {
  const form = document.getElementById('postForm');
  form.reset();
  state.editingId = null;
  document.getElementById('postFormTitle').textContent = 'Новая новость';
  document.getElementById('postSave').textContent = 'Опубликовать';
}

// ===== Год в футере =====
document.getElementById('year').textContent = new Date().getFullYear();

// ===== Инициализация =====

const adminToggle = document.getElementById('adminToggle');
const adminClose = document.getElementById('adminClose');
const admin = document.getElementById('admin');
const adminAuthForm = document.getElementById('adminAuthForm');
const adminStatus = document.getElementById('adminStatus');
const adminArea = document.getElementById('adminArea');
const postForm = document.getElementById('postForm');
const postStatus = document.getElementById('postStatus');
const postFormTitle = document.getElementById('postFormTitle');
const postSave = document.getElementById('postSave');

adminToggle.addEventListener('click', () => {
  admin.hidden = false;
  adminArea.hidden = true;
  adminAuthForm.reset();
  adminStatus.textContent = '';
});

adminClose.addEventListener('click', () => {
  admin.hidden = true;
  adminArea.hidden = true;
  resetPostForm();
  adminStatus.textContent = '';
});

adminAuthForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const pw = document.getElementById('adminPassword').value;
  const ok = await verifyAdminPassword(pw);
  if (ok) {
    adminArea.hidden = false;
    adminStatus.textContent = '';
    document.getElementById('adminPassword').value = '';
    loadAdminList();
  } else {
    adminStatus.textContent = 'Неверный пароль';
  }
});

postForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const token = document.getElementById('adminToken').value.trim();
  const statusEl = document.getElementById('postStatus');
  const title = document.getElementById('postTitle').value.trim();
  const date = document.getElementById('postDate').value;
  const text = document.getElementById('postText').value.trim();
  if (!token) {
    statusEl.textContent = 'Сначала вставьте GitHub token.';
    return;
  }
  if (!title || !date || !text) {
    statusEl.textContent = 'Заполните все поля.';
    return;
  }
  const post = { id: state.editingId || date + '-' + slugify(title), title, date, text };
  const next = state.editingId
    ? state.posts.map((p) => (p.id === state.editingId ? post : p))
    : [post, ...state.posts];
  try {
    await githubPutContent(JSON.stringify({ posts: next }, null, 2), state.editingId ? 'Update news' : 'Add news', token);
    state.posts = next;
    resetPostForm();
    await loadPosts();
    loadAdminList();
    statusEl.textContent = 'Новость опубликована!';
  } catch (err) {
    statusEl.textContent = 'Ошибка: ' + err.message;
  }
});

document.getElementById('postCancel').addEventListener('click', () => {
  resetPostForm();
  document.getElementById('postStatus').textContent = '';
});

loadPosts().catch((err) => {
  document.getElementById('posts').innerHTML = '<div class="empty">Не удалось загрузить новости.<br>' + esc(err.message) + '</div>';
});

loadAdminList();
