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
const STORE_KEY = 'text-drop-links:v2';
let active = null;

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
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function toast(html, type = 'ok') {
  result.className = `card result ${type}`;
  result.innerHTML = html;
  result.classList.remove('hidden');
}

function base64UrlFromBytes(uint8) {
  let binary = '';
  for (let i = 0; i < uint8.length; i += 0x8000) {
    binary += String.fromCharCode(...uint8.subarray(i, i + 0x8000));
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function bytesFromBase64Url(value) {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '==='.slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
}

async function gzip(textValue) {
  if (!('CompressionStream' in window)) {
    return `plain.${base64UrlFromBytes(new TextEncoder().encode(textValue))}`;
  }
  const stream = new Blob([textValue]).stream().pipeThrough(new CompressionStream('gzip'));
  const data = await new Response(stream).arrayBuffer();
  return `gz.${base64UrlFromBytes(new Uint8Array(data))}`;
}

async function gunzip(payload) {
  const [mode, data] = payload.split('.', 2);
  const raw = bytesFromBase64Url(data || '');
  if (mode === 'plain') return new TextDecoder().decode(raw);
  if (mode !== 'gz') throw new Error('지원하지 않는 링크 형식입니다.');
  if (!('DecompressionStream' in window)) throw new Error('이 브라우저는 압축 해제를 지원하지 않습니다. 최신 Chrome/Edge/Safari/Firefox를 써주세요.');
  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).text();
}

async function pack(item) {
  return gzip(JSON.stringify(item));
}

async function unpack(payload) {
  return JSON.parse(await gunzip(payload));
}

function cleanUrl() {
  return `${location.origin}${location.pathname}`;
}

function makeLink(payload) {
  return `${cleanUrl()}#d=${payload}`;
}

function loadSaved() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveSaved(list) {
  localStorage.setItem(STORE_KEY, JSON.stringify(list.slice(0, 50)));
}

function upsertSaved(entry) {
  const list = loadSaved().filter((item) => item.id !== entry.id);
  list.unshift(entry);
  saveSaved(list);
}

function removeSaved(id) {
  saveSaved(loadSaved().filter((item) => item.id !== id));
}

function isExpired(item) {
  return item.expiresAt && Date.now() > Date.parse(item.expiresAt);
}

function renderItems() {
  const list = loadSaved().filter((item) => !isExpired(item));
  saveSaved(list);
  if (!list.length) {
    items.innerHTML = '<p class="meta">아직 이 브라우저에 저장한 링크가 없습니다.</p>';
    return;
  }
  items.innerHTML = '';
  for (const item of list) {
    const node = template.content.firstElementChild.cloneNode(true);
    node.querySelector('h3').textContent = item.title || 'Untitled';
    const expiry = item.expiresAt ? ` · ${fmtDate(item.expiresAt)} 만료 표시` : '';
    node.querySelector('.meta').textContent = `${fmtBytes(item.textBytes)} · ${fmtDate(item.updatedAt)}${expiry}`;
    node.querySelector('.open').addEventListener('click', async () => openPayload(item.payload));
    items.append(node);
  }
}

async function openPayload(payload) {
  const item = await unpack(payload);
  if (isExpired(item)) {
    toast('<h2>만료된 링크입니다</h2><p class="meta">링크에 설정된 만료 시간이 지났습니다.</p>', 'error');
    return;
  }
  active = { ...item, payload };
  viewerTitle.textContent = item.title || 'Untitled';
  const expiry = item.expiresAt ? ` · ${fmtDate(item.expiresAt)} 만료 표시` : '';
  viewerMeta.textContent = `${fmtBytes(bytes(item.text || ''))} · ${fmtDate(item.updatedAt)}${expiry}`;
  viewerText.value = item.text || '';
  upsertSaved({
    id: item.id,
    title: item.title,
    textBytes: bytes(item.text || ''),
    updatedAt: item.updatedAt,
    expiresAt: item.expiresAt,
    payload,
  });
  renderItems();
  viewer.showModal();
}

text.addEventListener('input', () => {
  counter.textContent = `${text.value.length.toLocaleString('ko-KR')}자 · ${fmtBytes(bytes(text.value))}`;
});

upload.addEventListener('click', async () => {
  upload.disabled = true;
  try {
    if (!text.value.trim()) throw new Error('내용이 비어 있습니다.');
    const ttl = Number($('ttlHours').value);
    const now = new Date().toISOString();
    const item = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title: title.value.trim().slice(0, 120) || 'Untitled',
      text: text.value,
      createdAt: now,
      updatedAt: now,
      expiresAt: Number.isFinite(ttl) && ttl > 0 ? new Date(Date.now() + ttl * 60 * 60 * 1000).toISOString() : null,
    };
    const payload = await pack(item);
    const url = makeLink(payload);
    upsertSaved({ id: item.id, title: item.title, textBytes: bytes(item.text), updatedAt: item.updatedAt, expiresAt: item.expiresAt, payload });
    toast(`
      <h2>링크 생성 완료</h2>
      <p><a href="${url}">${url}</a></p>
      <p class="meta">링크 길이: ${url.length.toLocaleString('ko-KR')}자 · 내용은 서버가 아니라 링크 안에 들어 있습니다.</p>
      <div class="row wrap actions">
        <button class="primary" id="copyLink">링크 복사</button>
        <button class="ghost" id="openNow">방금 만든 링크 열기</button>
      </div>
    `);
    $('copyLink').addEventListener('click', async () => {
      await navigator.clipboard.writeText(url);
      $('copyLink').textContent = '복사됨';
    });
    $('openNow').addEventListener('click', () => openPayload(payload));
    title.value = '';
    text.value = '';
    text.dispatchEvent(new Event('input'));
    renderItems();
  } catch (error) {
    toast(`<h2>링크 생성 실패</h2><p>${error.message}</p>`, 'error');
  } finally {
    upload.disabled = false;
  }
});

$('refresh').addEventListener('click', renderItems);
$('close').addEventListener('click', () => viewer.close());
$('copy').addEventListener('click', async () => {
  await navigator.clipboard.writeText(viewerText.value);
  $('copy').textContent = '복사됨';
  setTimeout(() => $('copy').textContent = '전체 복사', 1200);
});
$('share').addEventListener('click', async () => {
  await navigator.clipboard.writeText(makeLink(active.payload));
  $('share').textContent = '링크 복사됨';
  setTimeout(() => $('share').textContent = '링크 복사', 1200);
});
$('delete').addEventListener('click', () => {
  if (!active) return;
  removeSaved(active.id);
  viewer.close();
  renderItems();
  toast('<h2>삭제 완료</h2><p class="meta">현재 브라우저의 저장 목록에서 제거했습니다.</p>');
});

renderItems();
text.dispatchEvent(new Event('input'));
const params = new URLSearchParams(location.hash.slice(1));
const initialPayload = params.get('d');
if (initialPayload) {
  openPayload(initialPayload).catch((error) => toast(`<h2>링크를 열 수 없습니다</h2><p>${error.message}</p>`, 'error'));
}
