/* Генератор картинок.
   Работает только с локальным сервером ai_images.py (python ai_images.py),
   никаких внешних сайтов. */
'use strict';

const AI_API = 'http://127.0.0.1:5000';

const AI_STYLE_LIST = [
  ['photo', 'Фото'],
  ['art', 'Рисунок'],
  ['anime', 'Аниме'],
  ['3d', '3D'],
  ['none', 'Без стиля'],
];

const AI_IDEAS = [
  'рыжий кот спит на подоконнике, за окном дождь',
  'старый деревянный дом в горах, туман на рассвете',
  'чашка кофе на столе рядом с книгой, утренний свет',
  'собака бежит по пляжу на закате',
  'портрет пожилого рыбака, добрый взгляд, морщины',
  'ночная улица после дождя, свет витрин в лужах',
  'a red fox in a snowy forest, soft morning light',
];

let aiHistory = [];

function dataUrlToJpeg(src, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = src;
  });
}

function createAiImageWindow(initialPrompt = '') {
  const content = `
  <div class="gen">
    <div class="gen-side">
      <div class="gen-status" id="ai-status" data-state="off">
        <div class="gen-status-line"><span class="gen-dot"></span><span id="ai-status-text">Проверяю сервер...</span></div>
        <div class="gen-status-warn" id="ai-status-warn"></div>
      </div>

      <div class="gen-help" id="ai-help">
        Сервер не запущен. Открой консоль в папке проекта и выполни:
        <code>python ai_images.py</code>
        При первом запуске скачается модель (около 3 ГБ).
      </div>

      <div class="gen-field">
        <div class="gen-label">Стиль</div>
        <div class="gen-styles" id="ai-styles">
          ${AI_STYLE_LIST.map(([k, n], i) => `<button class="gen-style${i === 0 ? ' active' : ''}" data-style="${k}">${n}</button>`).join('')}
        </div>
      </div>

      <div class="gen-field">
        <div class="gen-label">Качество</div>
        <select class="gen-select" id="ai-quality">
          <option value="good">Нормальное (дольше)</option>
          <option value="fast">Черновик (быстрее)</option>
        </select>
      </div>

      <div class="gen-field">
        <div class="gen-label">
          <span>Что нарисовать</span>
          <button class="gen-link" id="ai-idea" type="button">случайная идея</button>
        </div>
        <textarea class="gen-textarea" id="ai-prompt-input" rows="4" placeholder="Например: собака на пляже"></textarea>
      </div>

      <button class="gen-go" id="ai-generate-btn">Нарисовать</button>
    </div>

    <div class="gen-main">
      <div class="gen-canvas" id="ai-canvas">
        <div class="gen-empty" id="ai-empty">Здесь появится картинка.<br>Можно писать по-русски или по-английски.</div>
        <div class="gen-busy" id="ai-busy" hidden>
          <div class="gen-spinner"></div>
          <div id="ai-busy-text">Рисую…</div>
        </div>
        <img class="gen-img" id="ai-img" alt="" hidden>
      </div>

      <div class="gen-bar" id="ai-bar" hidden>
        <span class="gen-meta" id="ai-meta"></span>
        <span class="gen-bar-btns">
          <button class="btn" id="ai-save">В Pictures</button>
          <button class="btn" id="ai-wall">На обои</button>
          <button class="btn" id="ai-dl">Скачать PNG</button>
        </span>
      </div>

      <div class="gen-hist" id="ai-hist"></div>
    </div>
  </div>`;

  const win = createWindow('aiimage', 'Генератор картинок', 820, 580, content);
  const $ = sel => win.querySelector(sel);

  const statusBox = $('#ai-status');
  const statusText = $('#ai-status-text');
  const statusWarn = $('#ai-status-warn');
  const helpBox = $('#ai-help');
  const promptEl = $('#ai-prompt-input');
  const goBtn = $('#ai-generate-btn');
  const emptyEl = $('#ai-empty');
  const busyEl = $('#ai-busy');
  const busyText = $('#ai-busy-text');
  const imgEl = $('#ai-img');
  const barEl = $('#ai-bar');
  const metaEl = $('#ai-meta');
  const histEl = $('#ai-hist');

  promptEl.value = initialPrompt;

  let style = 'photo';
  let serverReady = false;
  let generating = false;
  let current = null; // { data, seed }

  function setStatus(state, text, warn) {
    statusBox.dataset.state = state;
    statusText.textContent = text;
    statusWarn.textContent = warn || '';
    helpBox.hidden = state !== 'off';
  }

  async function pollStatus() {
    if (!document.body.contains(win)) return;
    let delay = 2000;
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 2500);
      const r = await fetch(AI_API + '/status', { signal: ctl.signal });
      clearTimeout(timer);
      const s = await r.json();
      serverReady = !!s.ready;
      if (s.ready) {
        setStatus('ready', 'Готово · ' + (s.model || '') + ' · ' + (s.device || ''), s.warn);
        delay = 8000;
      } else if (s.stage === 'error') {
        setStatus('error', s.message);
        delay = 5000;
      } else {
        setStatus('busy', s.message);
      }
    } catch (e) {
      serverReady = false;
      setStatus('off', 'Сервер не отвечает');
    }
    setTimeout(pollStatus, delay);
  }

  function showImage(item) {
    current = item;
    emptyEl.hidden = true;
    busyEl.hidden = true;
    imgEl.hidden = false;
    imgEl.src = item.data;
    barEl.hidden = false;
    metaEl.textContent = item.seconds + ' с · seed ' + item.seed;
    renderHistory();
  }

  function renderHistory() {
    histEl.innerHTML = '';
    aiHistory.forEach(item => {
      const b = document.createElement('button');
      b.className = 'gen-thumb' + (current && current.data === item.data ? ' active' : '');
      b.title = item.prompt;
      const im = document.createElement('img');
      im.src = item.data;
      im.alt = '';
      b.appendChild(im);
      b.addEventListener('click', () => showImage(item));
      histEl.appendChild(b);
    });
  }

  async function generate() {
    const prompt = promptEl.value.trim();
    if (generating) return;
    if (!prompt) { showToast('Генератор', 'Напиши, что нарисовать'); promptEl.focus(); return; }
    if (!serverReady) { showToast('Генератор', 'Сервер ещё не готов. Статус слева.'); return; }

    generating = true;
    goBtn.disabled = true;
    emptyEl.hidden = true;
    imgEl.hidden = true;
    barEl.hidden = true;
    busyEl.hidden = false;
    const t0 = Date.now();
    const tick = setInterval(() => {
      busyText.textContent = 'Рисую… ' + Math.floor((Date.now() - t0) / 1000) + ' с';
    }, 400);
    busyText.textContent = 'Рисую…';

    try {
      const r = await fetch(AI_API + '/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, style, quality: $('#ai-quality').value }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Ошибка сервера');
      const item = { data: d.image, seed: d.seed, seconds: d.seconds, prompt };
      aiHistory.unshift(item);
      if (aiHistory.length > 12) aiHistory.pop();
      showImage(item);
    } catch (err) {
      busyEl.hidden = true;
      if (current) { imgEl.hidden = false; barEl.hidden = false; } else { emptyEl.hidden = false; }
      const msg = err instanceof TypeError ? 'Нет связи с сервером. Запущен ли ai_images.py?' : err.message;
      showToast('Не получилось', msg);
    } finally {
      clearInterval(tick);
      generating = false;
      goBtn.disabled = false;
    }
  }

  $('#ai-styles').addEventListener('click', e => {
    const b = e.target.closest('.gen-style');
    if (!b) return;
    win.querySelectorAll('.gen-style').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    style = b.dataset.style;
  });

  $('#ai-idea').addEventListener('click', () => {
    promptEl.value = AI_IDEAS[Math.floor(Math.random() * AI_IDEAS.length)];
    promptEl.focus();
  });

  goBtn.addEventListener('click', generate);
  promptEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); generate(); }
  });

  $('#ai-save').addEventListener('click', async () => {
    if (!current) return;
    try {
      // PNG 512x512 слишком тяжёлый для localStorage, сохраняем как JPEG
      const jpg = await dataUrlToJpeg(current.data, 0.9);
      const name = 'img_' + current.seed + '.jpg';
      fsWriteFile('/home/pictures/' + name, jpg);
      showToast('Сохранено', '/home/pictures/' + name);
    } catch (e) {
      showToast('Ошибка', 'Не удалось сохранить файл');
    }
  });

  $('#ai-wall').addEventListener('click', () => {
    if (!current) return;
    const d = document.getElementById('desktop');
    d.style.background = 'url("' + current.data + '") center/cover no-repeat';
  });

  $('#ai-dl').addEventListener('click', () => {
    if (!current) return;
    const a = document.createElement('a');
    a.href = current.data;
    a.download = 'image-' + current.seed + '.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
  });

  renderHistory();
  if (aiHistory.length) showImage(aiHistory[0]);
  pollStatus();
}
