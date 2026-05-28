const WEBHOOK_URL = '';
const WEBHOOK_CREATE_PLAN = 'https://klmkfkg.app.n8n.cloud/webhook/create-plan';
const WEBHOOK_ADD_TASK = '';

const SHEETS_ID = '1-pTt898GCpypjWiNADyDnpotlWrYh75AiEMjFlWJicQ';

// ─── HELPERS ───────────────────────────────────────────────────────────────

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

  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return clean;
  }

  const ru = clean.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);

  if (ru) {
    const day = ru[1].padStart(2, '0');
    const month = ru[2].padStart(2, '0');
    const year = ru[3];

    return `${year}-${month}-${day}`;
  }

  const d = new Date(clean);

  if (!isNaN(d)) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  return clean;
}

// ─── STATE ─────────────────────────────────────────────────────────────────

let state = {
  tasks: [],
  allPlans: [],
  currentView: 'day',
  calendarOffset: 0,
  openDays: {}
};

// ─── INIT ──────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  updateDateTime();
  loadAllData();
});

// ─── DATE HEADER ───────────────────────────────────────────────────────────

function updateDateTime() {
  const days = [
    'Воскресенье',
    'Понедельник',
    'Вторник',
    'Среда',
    'Четверг',
    'Пятница',
    'Суббота'
  ];

  const now = new Date();

  const dayEl = document.getElementById('day-name');
  const dateEl = document.getElementById('date-str');

  if (dayEl) {
    dayEl.textContent = days[now.getDay()];
  }

  if (dateEl) {
    dateEl.textContent = now.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }
}

// ─── LOAD DATA ─────────────────────────────────────────────────────────────

async function loadAllData() {
  const main = document.getElementById('task-list');

  try {
    if (main) {
      main.innerHTML = `
        <div class="loading">
          Загрузка...
        </div>
      `;
    }

    const url =
      `https://docs.google.com/spreadsheets/d/${SHEETS_ID}/gviz/tq?tqx=out:csv&sheet=DailyPlans&cachebust=${Date.now()}`;

    const res = await fetch(url, {
      cache: 'no-store'
    });

    const text = await res.text();

    console.log(text);

    // HTML вместо CSV
    if (
      text.includes('<html') ||
      text.includes('<!DOCTYPE html>')
    ) {
      if (main) {
        main.innerHTML = `
          <div class="loading">
            ⚠️ Таблица не отдала CSV.<br><br>
            Проверь:<br>
            1. SHEETS_ID<br>
            2. Название листа DailyPlans<br>
            3. Доступ "Читатель"
          </div>
        `;
      }

      return;
    }

    if (!res.ok) {
      if (main) {
        main.innerHTML = `
          <div class="loading">
            ❌ Ошибка ${res.status}
          </div>
        `;
      }

      return;
    }

    state.allPlans = parseCSV(text);

    console.log(state.allPlans);

    renderCurrentView();

  } catch (e) {
    console.error(e);

    if (main) {
      main.innerHTML = `
        <div class="loading">
          ❌ Ошибка загрузки:<br>
          ${e.message}
        </div>
      `;
    }
  }
}

// ─── VIEW ROUTER ───────────────────────────────────────────────────────────

function renderCurrentView() {
  const main = document.getElementById('task-list');

  if (!main) return;

  if (state.currentView === 'day') {
    renderDay(main);
  }

  if (state.currentView === 'week') {
    renderCalendar(main, 'week');
  }

  if (state.currentView === 'month') {
    renderCalendar(main, 'month');
  }
}

// ─── DAY VIEW ──────────────────────────────────────────────────────────────

function renderDay(container) {
  const today = getLocalDate();

  const todayTasks = state.allPlans.filter(row => {
    return toISODate(row.plan_date) === today;
  });

  console.log('TODAY TASKS', todayTasks);

  if (todayTasks.length === 0) {
    container.innerHTML = `
      <div class="create-plan-wrap">
        <div class="create-hint">
          На сегодня ещё нет плана
        </div>

        <button
          class="create-plan-btn"
          id="create-btn"
          onclick="createPlan()"
        >
          ✨ Создать план
        </button>
      </div>
    `;

    updateProgress(0, 0);

    return;
  }

  state.tasks = todayTasks.map(t => ({
    ...t,
    status: t.plan_status || 'planned'
  }));

  const done = state.tasks.filter(t => {
    return (
      t.status === 'done' ||
      t.status === 'partial'
    );
  }).length;

  updateProgress(done, state.tasks.length);

  container.innerHTML = state.tasks
    .map(renderTaskCard)
    .join('');
}

// ─── CREATE PLAN ───────────────────────────────────────────────────────────

async function createPlan() {
  const btn = document.getElementById('create-btn');

  if (!btn) return;

  btn.innerHTML = '⏳ Создаём...';
  btn.disabled = true;

  try {
    await fetch(WEBHOOK_CREATE_PLAN, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'create_plan',
        date: getLocalDate()
      })
    });

    btn.innerHTML = '⏳ Загружаем...';

    await new Promise(r => setTimeout(r, 2000));

    await loadAllData();

  } catch (e) {
    console.error(e);

    btn.innerHTML = '⚠️ Ошибка';
    btn.disabled = false;
  }
}

// ─── TASK CARD ─────────────────────────────────────────────────────────────

function renderTaskCard(task) {
  const label = task.selected_type
    ? `${task.task_name} — ${task.selected_type}`
    : task.task_name;

  const done =
    task.status === 'done' ||
    task.status === 'partial';

  return `
    <div class="task-card ${done ? 'done' : ''}">
      <div class="task-name">
        ${label}
      </div>

      <div class="task-meta">
        <span class="tag">${task.category}</span>
        <span class="tag">
          ${task.percent_at_planning || 0}%
        </span>
      </div>

      ${
        done
          ? `<div class="done-badge">✅ Выполнено</div>`
          : `
            <div class="task-actions">
              <button
                class="btn btn-done"
                onclick="markTask('${task.plan_id}','done')"
              >
                ✅ Сделано
              </button>

              <button
                class="btn btn-partial"
                onclick="markTask('${task.plan_id}','partial')"
              >
                🟡 Частично
              </button>

              <button
                class="btn btn-skip"
                onclick="markTask('${task.plan_id}','skipped')"
              >
                ↪ Перенести
              </button>
            </div>
          `
      }
    </div>
  `;
}

// ─── MARK TASK ─────────────────────────────────────────────────────────────

async function markTask(planId, status) {
  const task = state.tasks.find(t => t.plan_id === planId);

  if (!task) return;

  task.status = status;

  const plan = state.allPlans.find(t => t.plan_id === planId);

  if (plan) {
    plan.plan_status = status;
  }

  renderCurrentView();
}

// ─── PROGRESS ──────────────────────────────────────────────────────────────

function updateProgress(done, total) {
  const pct =
    total > 0
      ? Math.round((done / total) * 100)
      : 0;

  const fill = document.getElementById('progress-fill');
  const text = document.getElementById('progress-text');

  if (fill) {
    fill.style.width = pct + '%';
  }

  if (text) {
    text.textContent = `${done} / ${total}`;
  }
}

// ─── CALENDAR ──────────────────────────────────────────────────────────────

function renderCalendar(container, mode) {
  container.innerHTML = `
    <div class="loading">
      Календарь скоро появится
    </div>
  `;
}

// ─── CSV PARSER ────────────────────────────────────────────────────────────

function parseCSV(text) {
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  const lines = normalized
    .trim()
    .split('\n');

  if (lines.length < 2) {
    return [];
  }

  const headers = parseCSVLine(lines[0]);

  return lines
    .slice(1)
    .filter(line => line.trim() !== '')
    .map(line => {
      const values = parseCSVLine(line);

      const obj = {};

      headers.forEach((header, index) => {
        obj[header.trim()] =
          (values[index] || '').trim();
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

    if (
      char === '"' &&
      insideQuotes &&
      nextChar === '"'
    ) {
      current += '"';
      i++;

    } else if (char === '"') {
      insideQuotes = !insideQuotes;

    } else if (
      char === ',' &&
      !insideQuotes
    ) {
      result.push(current);
      current = '';

    } else {
      current += char;
    }
  }

  result.push(current);

  return result;
}
```
