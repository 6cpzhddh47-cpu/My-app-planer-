// CONFIG — сюда вставим URL вебхука n8n позже
const WEBHOOK_URL = 'YOUR_N8N_WEBHOOK_URL';
const SHEETS_ID = 'YOUR_GOOGLE_SHEETS_ID';

// Состояние приложения
let state = {
  tasks: [],
  planDate: '',
  completedCount: 0
};

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
  loadPlan();
  updateDateTime();
});

function updateDateTime() {
  const days = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];
  const now = new Date();
  document.getElementById('day-name').textContent = days[now.getDay()];
  document.getElementById('date-str').textContent = now.toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'long', year: 'numeric'
  });
}

async function loadPlan() {
  try {
    // Читаем DailyPlans из Google Sheets через публичный CSV
    const today = new Date().toISOString().split('T')[0];
    const url = `https://docs.google.com/spreadsheets/d/${SHEETS_ID}/gviz/tq?tqx=out:csv&sheet=DailyPlans`;
    
    const res = await fetch(url);
    const text = await res.text();
    const rows = parseCSV(text);
    
    // Фильтруем сегодняшние задачи
    state.tasks = rows
      .filter(r => r.plan_date === today)
      .map(r => ({ ...r, status: r.plan_status || 'planned' }));
    
    state.planDate = today;
    renderTasks();
  } catch (e) {
    document.getElementById('task-list').innerHTML = 
      '<div class="loading">Не удалось загрузить план.<br>Проверь настройки таблицы.</div>';
  }
}

function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
  return lines.slice(1).map(line => {
    const vals = line.match(/(".*?"|[^,]+)(?=,|$)/g) || [];
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = (vals[i] || '').replace(/"/g, '').trim();
    });
    return obj;
  });
}

function renderTasks() {
  const list = document.getElementById('task-list');
  
  if (state.tasks.length === 0) {
    list.innerHTML = '<div class="loading">План на сегодня пуст.<br>n8n отправит его в 08:00.</div>';
    return;
  }

  const done = state.tasks.filter(t => t.status === 'done' || t.status === 'partial').length;
  state.completedCount = done;
  updateProgress(done, state.tasks.length);

  list.innerHTML = state.tasks.map(task => renderTaskCard(task)).join('');
}

function renderTaskCard(task) {
  const isDone = task.status === 'done' || task.status === 'partial';
  const label = task.selected_type 
    ? `${task.task_name} — ${task.selected_type}` 
    : task.task_name;
  
  const catClass = {
    'языки': 'lang', 'здоровье': 'health', 'спорт': 'sport',
    'школа': 'school', 'хобби': 'hobby', 'экономика': 'econ'
  }[task.category] || '';

  const timeLabel = task.is_weekend_mode === 'TRUE' && task.min_time_weekend
    ? task.min_time_weekend : task.min_time_minutes;

  return `
    <div class="task-card ${isDone ? 'done' : ''}" id="card-${task.plan_id}">
      <div class="task-header">
        <div class="task-name ${isDone ? 'done-text' : ''}">${label}</div>
      </div>
      <div class="task-meta">
        <span class="tag ${catClass}">${task.category}</span>
        ${timeLabel ? `<span class="tag">⏱ ${timeLabel} мин</span>` : ''}
        <span class="tag">${task.percent_at_planning}%</span>
      </div>
      ${isDone 
        ? `<div class="done-badge">${task.status === 'partial' ? '🟡 Частично выполнено' : '✅ Выполнено'}</div>`
        : `<div class="task-actions">
            <button class="btn btn-done" onclick="markTask('${task.plan_id}','${task.task_id}','done')">✅ Сделано</button>
            <button class="btn btn-partial" onclick="markTask('${task.plan_id}','${task.task_id}','partial')">🟡 Частично</button>
            <button class="btn btn-skip" onclick="markTask('${task.plan_id}','${task.task_id}','skipped')">↪ Перенести</button>
          </div>`
      }
    </div>
  `;
}

async function markTask(planId, taskId, status) {
  // Обновляем UI сразу
  const task = state.tasks.find(t => t.plan_id === planId);
  if (!task) return;
  task.status = status;
  renderTasks();

  // Отправляем в n8n webhook
  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plan_id: planId,
        task_id: taskId,
        status: status,
        completed_at: new Date().toISOString(),
        source: 'pwa_button'
      })
    });
  } catch (e) {
    console.error('Webhook error:', e);
  }
}

function updateProgress(done, total) {
  const pct = total > 0 ? Math.round(done / total * 100) : 0;
  document.getElementById('progress-fill').style.width = pct + '%';
  document.getElementById('progress-text').textContent = `${done} / ${total}`;
}

async function loadStats() {
  const statsEl = document.getElementById('stats-content');
  statsEl.innerHTML = '<div class="loading">Загружаем статистику...</div>';

  try {
    const url = `https://docs.google.com/spreadsheets/d/${SHEETS_ID}/gviz/tq?tqx=out:csv&sheet=Stats`;
    const res = await fetch(url);
    const text = await res.text();
    const rows = parseCSV(text);
    
    if (rows.length === 0) {
      statsEl.innerHTML = '<div class="loading">Статистика появится после первого дня.</div>';
      return;
    }

    const last7 = rows.slice(-7).reverse();
    const avgRate = Math.round(
      last7.reduce((s, r) => s + parseFloat(r.completion_rate || 0), 0) / last7.length
    );

    statsEl.innerHTML = `
      <div class="stat-card">
        <h3>Последние 7 дней</h3>
        ${last7.map(r => `
          <div class="stat-row">
            <span>${r.stat_date}</span>
            <span class="stat-value ${parseFloat(r.completion_rate) >= 60 ? 'good' : 'bad'}">
              ${r.completion_rate}%
            </span>
          </div>
        `).join('')}
      </div>
      <div class="stat-card">
        <h3>Средний процент (7 дней)</h3>
        <div class="stat-row">
          <span>Выполнение</span>
          <span class="stat-value ${avgRate >= 60 ? 'good' : 'bad'}">${avgRate}%</span>
        </div>
      </div>
      <div class="stat-card">
        <h3>Категории (вчера)</h3>
        ${rows.length > 0 ? renderCategoryStats(rows[rows.length-1]) : ''}
      </div>
    `;
  } catch (e) {
    statsEl.innerHTML = '<div class="loading">Ошибка загрузки статистики.</div>';
  }
}

function renderCategoryStats(row) {
  const cats = [
    { key: 'lang_done', label: 'Языки' },
    { key: 'school_done', label: 'Школа' },
    { key: 'sport_done', label: 'Спорт' },
    { key: 'health_done', label: 'Здоровье' },
    { key: 'hobby_done', label: 'Хобби' },
    { key: 'econ_done', label: 'Экономика' }
  ];
  return cats.map(c => `
    <div class="stat-row">
      <span>${c.label}</span>
      <span class="stat-value ${row[c.key] === 'true' ? 'good' : 'bad'}">
        ${row[c.key] === 'true' ? '✅' : '❌'}
      </span>
    </div>
  `).join('');
}

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`screen-${name}`).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  if (name === 'stats') loadStats();
}
