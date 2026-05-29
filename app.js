const WEBHOOK_CREATE_PLAN = 'https://klmkfkg.app.n8n.cloud/webhook/create-plan';
const WEBHOOK_URL = '';
const WEBHOOK_ADD_TASK = '';
const SHEETS_ID = '1-pTt898GCpypjWiNADyDnpotlWrYh75AiEMjFlWJicQ';

const DEFAULT_SUBTYPES = [
  'speaking','listening','reading','writing',
  'sat','subject','gym','run','dance','pilates',
  'drawing','daily','language'
];

let state = {
  tasks: [],
  allPlans: [],
  currentView: 'day',
  calendarOffset: 0,
  openDays: {},
  customSubtypes: JSON.parse(localStorage.getItem('customSubtypes') || '[]')
};

document.addEventListener('DOMContentLoaded', () => {
  updateDateTime();
  loadAllData();
});

function getLocalDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toISODate(value) {
  if (!value) return '';
  const clean = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  const ru = clean.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (ru) return `${ru[3]}-${ru[2].padStart(2,'0')}-${ru[1].padStart(2,'0')}`;
  const d = new Date(clean);
  if (!isNaN(d)) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  return clean;
}

function updateDateTime() {
  const days = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];
  const now = new Date();
  const dayEl  = document.getElementById('day-name');
  const dateEl = document.getElementById('date-str');
  if (dayEl)  dayEl.textContent  = days[now.getDay()];
  if (dateEl) dateEl.textContent = now.toLocaleDateString('ru-RU', { day:'numeric', month:'long', year:'numeric' });
}

// ─── ЗАГРУЗКА ──────────────────────────────────────────────
async function loadAllData() {
  const main = document.getElementById('task-list');
  try {
    const url = `https://docs.google.com/spreadsheets/d/${SHEETS_ID}/gviz/tq?tqx=out:csv&sheet=DailyPlans&cachebust=${Date.now()}`;
    const res  = await fetch(url, { cache: 'no-store' });
    const text = await res.text();

    if (text.includes('<html') || text.includes('<!DOCTYPE')) {
      if (main) main.innerHTML = `
        <div class="loading">
          ⚠️ Нет доступа к таблице.<br><br>
          Открой Google Sheets →<br>
          Поделиться → Все у кого есть ссылка → Читатель
        </div>`;
      return;
    }

    state.allPlans = parseCSV(text);
    renderCurrentView();

  } catch (e) {
    if (main) main.innerHTML = `<div class="loading">❌ Ошибка: ${e.message}</div>`;
  }
}

// ─── VIEW ROUTER ───────────────────────────────────────────
function setView(view) {
  state.currentView    = view;
  state.calendarOffset = 0;
  document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
  const tab = document.querySelector(`.view-tab[data-view="${view}"]`);
  if (tab) tab.classList.add('active');
  renderCurrentView();
}

function renderCurrentView() {
  const main = document.getElementById('task-list');
  if (!main) return;
  if (state.currentView === 'day')   renderDay(main);
  if (state.currentView === 'week')  renderCalendar(main, 'week');
  if (state.currentView === 'month') renderCalendar(main, 'month');
}

// ─── DAY VIEW ──────────────────────────────────────────────
function renderDay(container) {
  const today = getLocalDate();
  const todayTasks = state.allPlans.filter(row => toISODate(row.plan_date) === today);

  if (todayTasks.length === 0) {
    container.innerHTML = `
      <div class="create-plan-wrap">
        <div class="create-hint">На сегодня ещё нет плана.<br>Нажми, чтобы создать прямо сейчас.</div>
        <button class="create-plan-btn" id="create-btn" onclick="createPlan()">✨ Создать план</button>
      </div>`;
    updateProgress(0, 0);
    return;
  }

  state.tasks = todayTasks.map(t => ({ ...t, status: t.plan_status || 'planned' }));
  const done  = state.tasks.filter(t => t.status === 'done' || t.status === 'partial').length;
  updateProgress(done, state.tasks.length);
  container.innerHTML = state.tasks.map(renderTaskCard).join('');
}

// ─── CREATE PLAN ───────────────────────────────────────────
async function createPlan() {
  const btn = document.getElementById('create-btn');
  if (!btn) return;

  btn.innerHTML = '<span class="spinner"></span> Создаём план...';
  btn.disabled  = true;

  try {
    await fetch(WEBHOOK_CREATE_PLAN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create_plan', date: getLocalDate() })
    });

    btn.innerHTML = '<span class="spinner"></span> Загружаем план...';
    await new Promise(r => setTimeout(r, 2500));
    await loadAllData();

  } catch (e) {
    btn.innerHTML = '⚠️ Ошибка — попробуй ещё раз';
    btn.disabled  = false;
  }
}

// ─── TASK CARD ─────────────────────────────────────────────
function renderTaskCard(task) {
  const label  = task.selected_type ? `${task.task_name} — ${task.selected_type}` : task.task_name;
  const isDone = task.status === 'done' || task.status === 'partial';
  const catClass = {
    'языки':'lang','здоровье':'health','спорт':'sport',
    'школа':'school','хобби':'hobby','экономика':'econ'
  }[task.category] || '';

  return `
    <div class="task-card ${isDone ? 'done' : ''}">
      <div class="task-name ${isDone ? 'done-text' : ''}">${label}</div>
      <div class="task-meta">
        <span class="tag ${catClass}">${task.category || ''}</span>
        <span class="tag">${task.percent_at_planning || 0}%</span>
      </div>
      ${isDone
        ? `<div class="done-badge">${task.status === 'partial' ? '🟡 Частично' : '✅ Выполнено'}</div>`
        : `<div class="task-actions">
             <button class="btn btn-done"    onclick="markTask('${task.plan_id}','done')">✅ Сделано</button>
             <button class="btn btn-partial" onclick="markTask('${task.plan_id}','partial')">🟡 Частично</button>
             <button class="btn btn-skip"    onclick="markTask('${task.plan_id}','skipped')">↪ Перенести</button>
           </div>`
      }
    </div>`;
}

// ─── MARK TASK ─────────────────────────────────────────────
function markTask(planId, status) {
  const task = state.tasks.find(t => t.plan_id === planId);
  if (!task) return;
  task.status = status;
  const plan = state.allPlans.find(t => t.plan_id === planId);
  if (plan) plan.plan_status = status;
  renderCurrentView();
}

// ─── PROGRESS ──────────────────────────────────────────────
function updateProgress(done, total) {
  const pct  = total > 0 ? Math.round(done / total * 100) : 0;
  const fill = document.getElementById('progress-fill');
  const text = document.getElementById('progress-text');
  if (fill) fill.style.width   = pct + '%';
  if (text) text.textContent   = `${done} / ${total}`;
}

// ─── CALENDAR ──────────────────────────────────────────────
function renderCalendar(container, mode) {
  const now  = new Date();
  const days = [];
  let title  = '';

  if (mode === 'week') {
    const start  = new Date(now);
    const dow    = start.getDay() === 0 ? 6 : start.getDay() - 1;
    start.setDate(start.getDate() - dow + state.calendarOffset * 7);
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    title = `${days[0].toLocaleDateString('ru-RU',{day:'numeric',month:'short'})} — ${days[6].toLocaleDateString('ru-RU',{day:'numeric',month:'short'})}`;
  }

  if (mode === 'month') {
    const year  = now.getFullYear();
    const month = now.getMonth() + state.calendarOffset;
    const first = new Date(year, month, 1);
    const last  = new Date(year, month + 1, 0);
    for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) days.push(new Date(d));
    title = first.toLocaleDateString('ru-RU', { month:'long', year:'numeric' });
  }

  const today    = getLocalDate();
  const dayNames = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];

  const rows = days.map(d => {
    const dateStr  = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const dayTasks = state.allPlans.filter(r => toISODate(r.plan_date) === dateStr);
    const doneCount = dayTasks.filter(t => t.plan_status === 'done' || t.plan_status === 'partial').length;
    const isOpen   = state.openDays[dateStr];

    const taskRows = dayTasks.map(t => {
      const label  = t.selected_type ? `${t.task_name} — ${t.selected_type}` : t.task_name;
      const icon   = t.plan_status === 'done' ? '✅' : t.plan_status === 'partial' ? '🟡' : t.plan_status === 'skipped' ? '↪' : '⬜';
      return `<div class="day-task-item"><span class="day-task-name">${label}</span><span class="day-task-status">${icon}</span></div>`;
    }).join('');

    return `
      <div class="day-row ${dateStr === today ? 'today' : ''}">
        <div class="day-header" onclick="toggleDay('${dateStr}')">
          <div class="day-header-left">
            <span class="day-num">${d.getDate()}</span>
            <span class="day-name-small">${dayNames[d.getDay()]}</span>
          </div>
          ${dayTasks.length
            ? `<span class="day-badge good">${doneCount}/${dayTasks.length}</span>`
            : `<span class="day-badge empty">нет плана</span>`}
        </div>
        <div class="day-tasks ${isOpen ? 'open' : ''}" id="dt-${dateStr}">
          ${dayTasks.length ? taskRows : '<div style="color:var(--text-dim);font-size:13px;padding:4px 0">Нет задач</div>'}
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

// ─── MODAL ─────────────────────────────────────────────────
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
        <input class="form-input" id="f-name" placeholder="Например: Рисование" />
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
          <input class="new-subtype-input" id="new-subtype-input" placeholder="Новый subtype..." />
          <button class="new-subtype-btn" onclick="addCustomSubtype()">+ Добавить</button>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Дата</label>
        <input class="form-input" id="f-date" type="date" value="${getLocalDate()}" />
      </div>
      <div class="modal-actions">
        <button class="btn-cancel" onclick="closeModal()">Отмена</button>
        <button class="btn-save"   onclick="saveTask()">Сохранить</button>
      </div>
    </div>`;

  document.getElementById('modal-overlay').classList.add('open');
}

function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) overlay.classList.remove('open');
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
  openAddModal();
}

function saveTask() {
  const name     = document.getElementById('f-name').value.trim();
  const category = document.getElementById('f-category').value;
  const date     = document.getElementById('f-date').value;
  const selected = document.querySelector('.subtype-chip.selected');
  const subtype  = selected ? selected.dataset.val : '';

  if (!name || !date) { alert('Заполни название и дату'); return; }

  const newTask = {
    plan_id: `manual_${date}_${Date.now()}`,
    plan_date: date,
    task_id: `manual_${Date.now()}`,
    task_name: name,
    category, subtype,
    selected_type: subtype,
    is_weekend_mode: 'FALSE',
    percent_at_planning: '100',
    urgency_score: '0',
    plan_status: 'planned',
    completed_at: ''
  };

  state.allPlans.push(newTask);
  closeModal();
  renderCurrentView();
}

// ─── NAV ───────────────────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(`screen-${name}`);
  if (target) target.classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  if (event && event.target) event.target.classList.add('active');
  if (name === 'today') renderCurrentView();
  if (name === 'stats') loadStats();
}

async function loadStats() {
  const el = document.getElementById('stats-content');
  if (el) el.innerHTML = '<div class="loading">Статистика появится после первого дня</div>';
}

// ─── CSV ───────────────────────────────────────────────────
function parseCSV(text) {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines      = normalized.trim().split('\n');
  if (lines.length < 2) return [];
  const headers    = parseCSVLine(lines[0]);
  return lines.slice(1)
    .filter(line => line.trim() !== '')
    .map(line => {
      const values = parseCSVLine(line);
      const obj    = {};
      headers.forEach((h, i) => { obj[h.trim()] = (values[i] || '').trim(); });
      return obj;
    });
}

function parseCSVLine(line) {
  const result = [];
  let current  = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && inQuotes && line[i+1] === '"') { current += '"'; i++; }
    else if (c === '"') { inQuotes = !inQuotes; }
    else if (c === ',' && !inQuotes) { result.push(current); current = ''; }
    else { current += c; }
  }
  result.push(current);
  return result;
}
