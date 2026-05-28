const WEBHOOK_URL = '';
const WEBHOOK_CREATE_PLAN = 'https://klmkfkg.app.n8n.cloud/webhook/create-plan';
const WEBHOOK_ADD_TASK = '';
const SHEETS_ID = '1-pTt898GCpypjWiNADyDnpotlWrYh75AiEMjFlWJicQ';
function getLocalDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;

// ─── ВСТРОЕННЫЕ SUBTYPES ───────────────────────────────────────────────────
const DEFAULT_SUBTYPES = [
  'speaking','listening','reading','writing',
  'sat','subject','gym','run','dance','pilates',
  'drawing','daily','language'
];

// ─── СОСТОЯНИЕ ────────────────────────────────────────────────────────────
let state = {
  tasks: [],
  planDate: '',
  completedCount: 0,
  planExists: false,
  currentView: 'day',        // day | week | month
  calendarOffset: 0,         // недель/месяцев от текущего
  allPlans: [],              // все DailyPlans из таблицы
  customSubtypes: JSON.parse(localStorage.getItem('customSubtypes') || '[]'),
  openDays: {}               // какие дни раскрыты в calendar view
};

// ─── INIT ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  updateDateTime();
  loadAllData();
});

function updateDateTime() {
  const days = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];
  const now = new Date();
  document.getElementById('day-name').textContent = days[now.getDay()];
  document.getElementById('date-str').textContent = now.toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'long', year: 'numeric'
  });
}

// ─── ЗАГРУЗКА ДАННЫХ ───────────────────────────────────────────────────────
async function loadAllData() {
  const main = document.getElementById('task-list');
  try {
    const url = `https://docs.google.com/spreadsheets/d/${SHEETS_ID}/gviz/tq?tqx=out:csv&sheet=DailyPlans&cachebust=${Date.now()}`;
    const res = await fetch(url, { cache: 'no-store' });

    // ИСПРАВЛЕНИЕ БАГ 2: проверяем что получили CSV, а не HTML
    const text = await res.text();

    if (text.trim().startsWith('<') || text.includes('<!DOCTYPE')) {
      main.innerHTML = `
        <div class="loading">
          ⚠️ Нет доступа к таблице.<br><br>
          Открой Google Sheets →<br>
          Поделиться → Все у кого есть ссылка → Читатель
        </div>`;
      return;
    }

    if (!res.ok) {
      main.innerHTML = `
        <div class="loading">
          ❌ Ошибка ${res.status}<br>
          Проверь SHEETS_ID в app.js
        </div>`;
      return;
    }

    state.allPlans = parseCSV(text);

    // Проверяем что данные реально распарсились
    if (state.allPlans.length === 0 && text.includes('plan_id')) {
      main.innerHTML = `
        <div class="loading">
          ⚠️ Таблица пустая или нет плана на сегодня.<br>
          Нажми + чтобы создать план вручную.
        </div>`;
      // Всё равно рендерим — покажет кнопку создания
    }

    renderCurrentView();

  } catch (e) {
    // ИСПРАВЛЕНИЕ БАГ 2: показываем реальную ошибку
    main.innerHTML = `
      <div class="loading">
        ❌ Ошибка загрузки:<br>${e.message}<br><br>
        Проверь интернет-соединение<br>
        и доступ к таблице.
      </div>`;
  }

// ─── VIEW ROUTER ───────────────────────────────────────────────────────────
function setView(view) {
  state.currentView   = view;
  state.calendarOffset = 0;
  document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.view-tab[data-view="${view}"]`).classList.add('active');
  renderCurrentView();
}

function renderCurrentView() {
  const main = document.getElementById('task-list');
  if (state.currentView === 'day')   renderDay(main);
  if (state.currentView === 'week')  renderCalendar(main, 'week');
  if (state.currentView === 'month') renderCalendar(main, 'month');
}

// ─── DAY VIEW ──────────────────────────────────────────────────────────────
function renderDay(container) {
  const today = new Date().toISOString().split('T')[0];
  const todayTasks = state.allPlans.filter(r => r.plan_date === today);

  if (todayTasks.length === 0) {
    state.planExists = false;
    container.innerHTML = `
      <div class="create-plan-wrap">
        <div class="create-hint">На сегодня ещё нет плана.<br>Нажми чтобы создать прямо сейчас.</div>
        <button class="create-plan-btn" id="create-btn" onclick="createPlan()">
          ✨ Создать план на сегодня
        </button>
        <div class="create-hint" style="font-size:12px">Дважды нажми если план не появился</div>
      </div>`;
    updateProgress(0, 0);
    return;
  }

  state.planExists = true;
  state.tasks = todayTasks.map(r => ({ ...r, status: r.plan_status || 'planned' }));
  state.planDate = today;

  const done = state.tasks.filter(t => t.status === 'done' || t.status === 'partial').length;
  updateProgress(done, state.tasks.length);
  container.innerHTML = state.tasks.map(renderTaskCard).join('');
}

// ─── CALENDAR VIEW ─────────────────────────────────────────────────────────
function renderCalendar(container, mode) {
  const now = new Date();
  let days = [];
  let title = '';

  if (mode === 'week') {
    // Неделя с offset
    const start = new Date(now);
    const dow = start.getDay() === 0 ? 6 : start.getDay() - 1; // пн=0
    start.setDate(start.getDate() - dow + state.calendarOffset * 7);
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    const endDay = days[6];
    title = `${days[0].toLocaleDateString('ru-RU',{day:'numeric',month:'short'})} — ${endDay.toLocaleDateString('ru-RU',{day:'numeric',month:'short'})}`;
  } else {
    // Месяц с offset
    const year  = now.getFullYear();
    const month = now.getMonth() + state.calendarOffset;
    const first = new Date(year, month, 1);
    const last  = new Date(year, month + 1, 0);
    for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) {
      days.push(new Date(d));
    }
    title = first.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  }

  const dayNames = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
  const todayStr = now.toISOString().split('T')[0];

  const rows = days.map(d => {
    const dateStr   = d.toISOString().split('T')[0];
    const dayTasks  = state.allPlans.filter(r => r.plan_date === dateStr);
    const doneCount = dayTasks.filter(r => r.plan_status === 'done' || r.plan_status === 'partial').length;
    const isToday   = dateStr === todayStr;
    const isOpen    = state.openDays[dateStr];

    let badge = '';
    if (dayTasks.length === 0) {
      badge = `<span class="day-badge empty">нет плана</span>`;
    } else {
      badge = `<span class="day-badge good">${doneCount}/${dayTasks.length}</span>`;
    }

    const taskRows = dayTasks.map(t => {
      const label  = t.selected_type ? `${t.task_name} — ${t.selected_type}` : t.task_name;
      const status = t.plan_status === 'done' ? '✅'
                   : t.plan_status === 'partial' ? '🟡'
                   : t.plan_status === 'skipped' ? '↪'
                   : '⬜';
      return `<div class="day-task-item">
        <span class="day-task-name">${label}</span>
        <span class="day-task-status">${status}</span>
      </div>`;
    }).join('');

    return `
      <div class="day-row ${isToday ? 'today' : ''}">
        <div class="day-header" onclick="toggleDay('${dateStr}')">
          <div class="day-header-left">
            <span class="day-num">${d.getDate()}</span>
            <span class="day-name-small">${dayNames[d.getDay()]}</span>
            ${isToday ? '<span class="tag" style="background:#fce4ec;color:#c2185b">сегодня</span>' : ''}
          </div>
          ${badge}
        </div>
        <div class="day-tasks ${isOpen ? 'open' : ''}" id="dt-${dateStr}">
          ${dayTasks.length > 0 ? taskRows : '<div style="color:var(--text-dim);font-size:13px;padding:4px 0">Нет задач</div>'}
        </div>
      </div>`;
  }).join('');

  container.innerHTML = `
    <div class="calendar-nav">
      <button class="cal-nav-btn" onclick="shiftCalendar(-1)">‹</button>
      <span class="cal-title">${title}</span>
      <button class="cal-nav-btn" onclick="shiftCalendar(1)">›</button>
    </div>
    <div class="week-grid">${rows}</div>`;
}

function toggleDay(dateStr) {
  state.openDays[dateStr] = !state.openDays[dateStr];
  const el = document.getElementById(`dt-${dateStr}`);
  if (el) el.classList.toggle('open', state.openDays[dateStr]);
}

function shiftCalendar(dir) {
  state.calendarOffset += dir;
  renderCurrentView();
}

// ─── CREATE PLAN ───────────────────────────────────────────────────────────
async function createPlan() {
  const btn = document.getElementById('create-btn');
  if (!btn) return;

  if (btn.dataset.clicked !== 'true') {
    btn.dataset.clicked = 'true';
    btn.innerHTML = '<span class="spinner"></span> Создаём план...';
    btn.disabled = true;

    try {
      // Шаг 1: читаем Tasks из таблицы
      const url = `https://docs.google.com/spreadsheets/d/${SHEETS_ID}/gviz/tq?tqx=out:csv&sheet=Tasks&cachebust=${Date.now()}`;
      const res = await fetch(url, { cache: 'no-store' });
      const text = await res.text();

      if (text.trim().startsWith('<')) {
        btn.innerHTML = '⚠️ Нет доступа к таблице';
        btn.disabled = false;
        return;
      }

      const tasks = parseCSV(text);
      const today = getLocalDate();

      // Шаг 2: считаем urgency прямо в браузере
      const dayKeys = ['sun','mon','tue','wed','thu','fri','sat'];
      const todayKey = dayKeys[new Date().getDay()];
      const isWeekend = todayKey === 'sat' || todayKey === 'sun';
      const maxTasks = isWeekend ? 3 : 5;

      const langTypeByDay = {
        mon: 'speaking', tue: 'listening',
        wed: 'reading', thu: 'writing',
        fri: null, sat: null, sun: null
      };
      const todayLangType = langTypeByDay[todayKey];

      function daysSince(dateStr) {
        if (!dateStr) return 999;
        const d = new Date(dateStr + 'T12:00:00');
        const t = new Date(today + 'T12:00:00');
        return Math.floor((t - d) / (1000 * 60 * 60 * 24));
      }

      function calcPct(days, maxGap) {
        return Math.round(100 * Math.exp(-days / (maxGap / 3)));
      }

      const activeTasks = tasks.filter(t => t.status === 'active');
      const languages = activeTasks.filter(t => t.subtype === 'language');
      const others = activeTasks.filter(t => t.subtype !== 'language');

      const results = [];

      // Выбираем один язык
      const langScored = languages.map(row => {
        let selectedType = todayLangType;
        if (!selectedType) {
          const types = ['speaking','listening','reading','writing'];
          let maxD = -1;
          types.forEach(t => {
            const d = daysSince(row[`last_done_${t}`]);
            if (d > maxD) { maxD = d; selectedType = t; }
          });
        }
        const days = daysSince(row[`last_done_${selectedType}`]);
        const pct = calcPct(days, parseInt(row.max_gap_days) || 5);
        const urgency = (100 - Math.max(0, pct)) + (parseInt(row.priority) || 1) * 10;
        return { ...row, selected_type: selectedType, percent: pct, urgency_score: urgency };
      });

      langScored.sort((a, b) => b.urgency_score - a.urgency_score);
      if (langScored[0]) results.push(langScored[0]);

      // Остальные задачи
      const otherScored = others
        .filter(row => {
          if (isWeekend && row.weekend_mode === 'skip') return false;
          const pref = row.preferred_days || 'any';
          if (pref !== 'any' && !pref.split(',').includes(todayKey)) return false;
          return true;
        })
        .map(row => {
          const days = daysSince(row.last_done_date);
          const pct = calcPct(days, parseInt(row.max_gap_days) || 30);
          const urgency = (100 - Math.max(0, pct)) + (parseInt(row.priority) || 1) * 10;
          return { ...row, selected_type: '', percent: pct, urgency_score: urgency };
        })
        .sort((a, b) => b.urgency_score - a.urgency_score);

      const catCounts = {};
      for (const t of otherScored) {
        catCounts[t.category] = (catCounts[t.category] || 0) + 1;
        if (catCounts[t.category] <= 2) results.push(t);
        if (results.length >= maxTasks) break;
      }

      // Шаг 3: записываем в DailyPlans через Apps Script
      const newRows = results.map(t => ({
        plan_id: `${today}_${t.id}`,
        plan_date: today,
        task_id: t.id,
        task_name: t.task_name,
        category: t.category,
        subtype: t.subtype,
        selected_type: t.selected_type,
        is_weekend_mode: isWeekend ? 'TRUE' : 'FALSE',
        percent_at_planning: t.percent,
        urgency_score: t.urgency_score,
        plan_status: 'planned',
        completed_at: ''
      }));

      await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_plan_rows', rows: newRows })
      });

      // Добавляем в локальный state сразу
      state.allPlans.push(...newRows);

      btn.innerHTML = '⏳ Готово — нажми ещё раз';
      btn.disabled = false;

    } catch (e) {
      btn.innerHTML = `⚠️ Ошибка: ${e.message}`;
      btn.disabled = false;
      btn.dataset.clicked = 'false';
    }
    return;
  }

  // Второе нажатие — просто рендерим из state
  btn.innerHTML = '<span class="spinner"></span> Загружаем...';
  btn.disabled = true;
  await new Promise(r => setTimeout(r, 1500));
  await loadAllData();
}
// ─── MARK TASK ─────────────────────────────────────────────────────────────
async function markTask(planId, taskId, status) {
  const task = state.tasks.find(t => t.plan_id === planId);
  if (!task) return;
  task.status = status;

  // Обновляем в allPlans тоже
  const ap = state.allPlans.find(r => r.plan_id === planId);
  if (ap) ap.plan_status = status;

  renderCurrentView();

  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plan_id: planId, task_id: taskId, status,
        completed_at: new Date().toISOString(),
        source: 'pwa_button'
      })
    });
  } catch (e) { console.error('Webhook error:', e); }
}

// ─── TASK CARD ─────────────────────────────────────────────────────────────
function renderTaskCard(task) {
  const isDone  = task.status === 'done' || task.status === 'partial';
  const label   = task.selected_type
    ? `${task.task_name} — ${task.selected_type}`
    : task.task_name;

  const catClass = {
    'языки':'lang','здоровье':'health','спорт':'sport',
    'школа':'school','хобби':'hobby','экономика':'econ'
  }[task.category] || '';

  const timeLabel = task.is_weekend_mode === 'TRUE' && task.min_time_weekend
    ? task.min_time_weekend : task.min_time_minutes;

  return `
    <div class="task-card ${isDone ? 'done' : ''}" id="card-${task.plan_id}">
      <div class="task-name ${isDone ? 'done-text' : ''}">${label}</div>
      <div class="task-meta">
        <span class="tag ${catClass}">${task.category}</span>
        ${timeLabel ? `<span class="tag">⏱ ${timeLabel} мин</span>` : ''}
        <span class="tag">${task.percent_at_planning || 0}%</span>
      </div>
      ${isDone
        ? `<div class="done-badge">${task.status === 'partial' ? '🟡 Частично' : '✅ Выполнено'}</div>`
        : `<div class="task-actions">
             <button class="btn btn-done"    onclick="markTask('${task.plan_id}','${task.task_id}','done')">✅ Сделано</button>
             <button class="btn btn-partial" onclick="markTask('${task.plan_id}','${task.task_id}','partial')">🟡 Частично</button>
             <button class="btn btn-skip"    onclick="markTask('${task.plan_id}','${task.task_id}','skipped')">↪ Перенести</button>
           </div>`
      }
    </div>`;
}

// ─── ПРОГРЕСС ─────────────────────────────────────────────────────────────
function updateProgress(done, total) {
  const pct = total > 0 ? Math.round(done / total * 100) : 0;
  document.getElementById('progress-fill').style.width = pct + '%';
  document.getElementById('progress-text').textContent = `${done} / ${total}`;
}

// ─── МОДАЛКА: ДОБАВИТЬ ЗАДАЧУ ──────────────────────────────────────────────
function openAddModal() {
  const allSubtypes = [...DEFAULT_SUBTYPES, ...state.customSubtypes];
  const chips = allSubtypes.map(s =>
    `<div class="subtype-chip" data-val="${s}" onclick="toggleSubtype(this)">${s}</div>`
  ).join('');

  document.getElementById('modal-overlay').innerHTML = `
    <div class="modal">
      <div class="modal-handle"></div>
      <h2>➕ Добавить задачу</h2>

      <div class="form-group">
        <label class="form-label">Название</label>
        <input class="form-input" id="f-name" placeholder="Например: Химия — тема ядра" />
      </div>

      <div class="form-group">
        <label class="form-label">Категория</label>
        <select class="form-input" id="f-category">
          <option value="языки">Языки</option>
          <option value="школа">Школа</option>
          <option value="экономика">Экономика</option>
          <option value="спорт">Спорт</option>
          <option value="здоровье">Здоровье</option>
          <option value="хобби">Хобби</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">Subtype</label>
        <div class="subtype-grid" id="subtype-grid">${chips}</div>
        <div class="new-subtype-row">
          <input class="new-subtype-input" id="new-subtype-input" placeholder="Создать свой subtype..." />
          <button class="new-subtype-btn" onclick="addCustomSubtype()">+ Добавить</button>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Дата</label>
        <input class="form-input" id="f-date" type="date"
          value="${new Date().toISOString().split('T')[0]}" />
      </div>

      <div class="form-group">
        <label class="form-label">Время (мин)</label>
        <input class="form-input" id="f-time" type="number" placeholder="30" />
      </div>

      <div class="modal-actions">
        <button class="btn-cancel" onclick="closeModal()">Отмена</button>
        <button class="btn-save"   onclick="saveTask()">Сохранить</button>
      </div>
    </div>`;

  document.getElementById('modal-overlay').classList.add('open');
}

function toggleSubtype(el) {
  document.querySelectorAll('.subtype-chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
}

function addCustomSubtype() {
  const input = document.getElementById('new-subtype-input');
  const val   = input.value.trim().toLowerCase();
  if (!val) return;

  if (!state.customSubtypes.includes(val)) {
    state.customSubtypes.push(val);
    localStorage.setItem('customSubtypes', JSON.stringify(state.customSubtypes));
  }

  const grid = document.getElementById('subtype-grid');
  const chip = document.createElement('div');
  chip.className = 'subtype-chip selected';
  chip.dataset.val = val;
  chip.textContent = val;
  chip.onclick = () => toggleSubtype(chip);

  document.querySelectorAll('.subtype-chip').forEach(c => c.classList.remove('selected'));
  grid.appendChild(chip);
  input.value = '';
}

async function saveTask() {
  const name     = document.getElementById('f-name').value.trim();
  const category = document.getElementById('f-category').value;
  const date     = document.getElementById('f-date').value;
  const time     = document.getElementById('f-time').value;
  const selected = document.querySelector('.subtype-chip.selected');
  const subtype  = selected ? selected.dataset.val : '';

  if (!name || !date) {
    alert('Заполни название и дату');
    return;
  }

  const planId = `manual_${date}_${Date.now()}`;

  // Добавляем локально сразу
  const newTask = {
    plan_id: planId, plan_date: date,
    task_id: `m_${Date.now()}`, task_name: name,
    category, subtype, selected_type: subtype,
    is_weekend_mode: 'FALSE',
    percent_at_planning: '100',
    urgency_score: '0',
    plan_status: 'planned',
    min_time_minutes: time || '',
    min_time_weekend: ''
  };

  state.allPlans.push(newTask);

  const today = new Date().toISOString().split('T')[0];
  if (date === today) {
    state.tasks.push({ ...newTask, status: 'planned' });
  }

  closeModal();
  renderCurrentView();

  // Отправляем в n8n
  try {
    await fetch(WEBHOOK_ADD_TASK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newTask, source: 'manual_add' })
    });
  } catch (e) { console.error('Add task webhook error:', e); }
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}

// ─── STATS ─────────────────────────────────────────────────────────────────
async function loadStats() {
  const el = document.getElementById('stats-content');
  el.innerHTML = '<div class="loading">Загружаем статистику...</div>';
  try {
    const url = `https://docs.google.com/spreadsheets/d/${SHEETS_ID}/gviz/tq?tqx=out:csv&sheet=Stats`;
    const res  = await fetch(url);
    const text = await res.text();
    const rows = parseCSV(text);

    if (rows.length === 0) {
      el.innerHTML = '<div class="loading">Статистика появится после первого дня.</div>';
      return;
    }

    const last7   = rows.slice(-7).reverse();
    const avgRate = Math.round(
      last7.reduce((s, r) => s + parseFloat(r.completion_rate || 0), 0) / last7.length
    );

    el.innerHTML = `
      <div class="stat-card">
        <h3>Последние 7 дней</h3>
        ${last7.map(r => `
          <div class="stat-row">
            <span>${r.stat_date}</span>
            <span class="stat-value ${parseFloat(r.completion_rate) >= 60 ? 'good' : 'bad'}">
              ${r.completion_rate}%
            </span>
          </div>`).join('')}
      </div>
      <div class="stat-card">
        <h3>Средний процент — 7 дней</h3>
        <div class="stat-row">
          <span>Выполнение</span>
          <span class="stat-value ${avgRate >= 60 ? 'good' : 'bad'}">${avgRate}%</span>
        </div>
      </div>
      <div class="stat-card">
        <h3>Категории — вчера</h3>
        ${renderCategoryStats(rows[rows.length - 1])}
      </div>`;
  } catch {
    el.innerHTML = '<div class="loading">Ошибка загрузки.</div>';
  }
}

function renderCategoryStats(row) {
  return [
    { key: 'lang_done',   label: ' Языки' },
    { key: 'school_done', label: ' Школа' },
    { key: 'sport_done',  label: ' Спорт' },
    { key: 'health_done', label: ' Здоровье' },
    { key: 'hobby_done',  label: ' Хобби' },
    { key: 'econ_done',   label: ' Экономика' }
  ].map(c => `
    <div class="stat-row">
      <span>${c.label}</span>
      <span class="stat-value ${row[c.key] === 'true' ? 'good' : 'bad'}">
        ${row[c.key] === 'true' ? '✅' : '❌'}
      </span>
    </div>`).join('');
}

// ─── NAV ───────────────────────────────────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`screen-${name}`).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  if (name === 'stats') loadStats();
}

// ─── CSV PARSER ────────────────────────────────────────────────────────────
function parseCSV(text) {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.trim().split('\n');

  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map(h => h.trim());

  return lines.slice(1)
    .filter(line => line.trim() !== '')
    .map(line => {
      const vals = parseCSVLine(line);
      const obj = {};

      headers.forEach((h, i) => {
        obj[h] = (vals[i] || '').trim();
      });

      return obj;
    });
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"' && insideQuotes && nextChar === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === ',' && !insideQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}
