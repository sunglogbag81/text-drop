const $ = (id) => document.getElementById(id);
const title = $('title');
const text = $('text');
const counter = $('counter');
const upload = $('upload');
const result = $('result');
const items = $('items');
const template = $('item-template');
const viewer = $('viewer');
const viewerTitle = $('viewer-title');
const viewerMeta = $('viewer-meta');
const viewerText = $('viewer-text');
const deleteToken = $('deleteToken');
let activeId = null;

function bytes(value) {
  return new Blob([value]).size;
}

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function fmtDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function toast(html, type = 'ok') {
  result.className = `card result ${type}`;
  result.innerHTML = html;
  result.classList.remove('hidden');
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error || res.statusText), { body, status: res.status });
  return body;
}

async function loadItems() {
  items.innerHTML = '<p class="meta">불러오는 중…</p>';
  try {
    const { items: list } = await api('/api/texts');
    if (!list.length) {
      items.innerHTML = '<p class="meta">아직 올린 글이 없습니다.</p>';
      return;
    }
    items.innerHTML = '';
    for (const item of list) {
      const node = template.content.firstElementChild.cloneNode(true);
      node.querySelector('h3').textContent = item.title || 'Untitled';
      const expiry = item.expiresAt ? ` · ${fmtDate(item.expiresAt)} 자동 삭제` : '';
      node.querySelector('.meta').textContent = `${fmtBytes(item.textBytes)} · ${fmtDate(item.updatedAt)}${expiry}`;
      node.querySelector('.open').addEventListener('click', () => openItem(item.id));
      items.append(node);
    }
  } catch (error) {
    items.innerHTML = `<p class="meta">목록을 불러오지 못했습니다: ${error.message}</p>`;
  }
}

async function openItem(id) {
  const item = await api(`/api/texts/${encodeURIComponent(id)}`);
  activeId = id;
  viewerTitle.textContent = item.title || 'Untitled';
  viewerMeta.textContent = `${fmtBytes(item.textBytes)} · ${fmtDate(item.updatedAt)}`;
  viewerText.value = item.text;
  deleteToken.value = localStorage.getItem(`deleteToken:${id}`) || '';
  viewer.showModal();
}

text.addEventListener('input', () => {
  counter.textContent = `${text.value.length.toLocaleString('ko-KR')}자 · ${fmtBytes(bytes(text.value))}`;
});

upload.addEventListener('click', async () => {
  upload.disabled = true;
  try {
    const payload = {
      title: title.value,
      text: text.value,
      ttlHours: Number($('ttlHours').value),
      adminKey: $('adminKey').value,
    };
    const item = await api('/api/texts', { method: 'POST', body: JSON.stringify(payload) });
    localStorage.setItem(`deleteToken:${item.id}`, item.deleteToken);
    const url = new URL(`/?id=${encodeURIComponent(item.id)}`, location.href).href;
    toast(`
      <h2>업로드 완료</h2>
      <p><a href="${url}">${url}</a></p>
      <p class="meta">삭제 토큰은 이 화면을 벗어나면 다시 볼 수 없습니다. 이 브라우저에는 자동 저장했습니다.</p>
      <span class="token">${item.deleteToken}</span>
      <div class="row wrap actions">
        <button class="primary" id="copyLink">링크 복사</button>
        <button class="ghost" id="openNow">방금 올린 글 열기</button>
      </div>
    `);
    $('copyLink').addEventListener('click', () => navigator.clipboard.writeText(url));
    $('openNow').addEventListener('click', () => openItem(item.id));
    title.value = '';
    text.value = '';
    text.dispatchEvent(new Event('input'));
    await loadItems();
  } catch (error) {
    toast(`<h2>업로드 실패</h2><p>${error.message}</p>`, 'error');
  } finally {
    upload.disabled = false;
  }
});

$('refresh').addEventListener('click', loadItems);
$('close').addEventListener('click', () => viewer.close());
$('copy').addEventListener('click', async () => {
  await navigator.clipboard.writeText(viewerText.value);
  $('copy').textContent = '복사됨';
  setTimeout(() => $('copy').textContent = '전체 복사', 1200);
});
$('share').addEventListener('click', async () => {
  await navigator.clipboard.writeText(new URL(`/?id=${encodeURIComponent(activeId)}`, location.href).href);
  $('share').textContent = '링크 복사됨';
  setTimeout(() => $('share').textContent = '링크 복사', 1200);
});
$('delete').addEventListener('click', async () => {
  if (!activeId) return;
  if (!confirm('정말 삭제할까요?')) return;
  try {
    await api(`/api/texts/${encodeURIComponent(activeId)}`, {
      method: 'DELETE',
      body: JSON.stringify({ deleteToken: deleteToken.value, adminKey: $('adminKey').value }),
    });
    localStorage.removeItem(`deleteToken:${activeId}`);
    viewer.close();
    await loadItems();
    toast('<h2>삭제 완료</h2><p class="meta">서버에서 글을 지웠습니다.</p>');
  } catch (error) {
    alert(`삭제 실패: ${error.message}`);
  }
});

const params = new URLSearchParams(location.search);
const initialId = params.get('id');
loadItems().then(() => {
  if (initialId) openItem(initialId).catch(() => toast('<h2>글을 찾을 수 없습니다</h2><p class="meta">삭제됐거나 만료됐을 수 있습니다.</p>', 'error'));
});
text.dispatchEvent(new Event('input'));
