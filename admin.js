/* ══════════════════════════════════════════════════
   ⚙️  CONFIG — DEBE COINCIDIR CON app.js
   ══════════════════════════════════════════════════ */
const APP_NAME = 'TurnoYa';

const SB_URL = 'https://krxkbpwbkymjasezwvjj.supabase.co';
const SB_KEY = 'sb_publishable_BwDGv_CKHYSHvKxyuvdTLA_ImbVP23-';

const SPORTS = {
  s1: {
    name:   'Pádel',
    icon:   '🏸',
    courts: ['Cancha A', 'Cancha B', 'Cancha C']
  },
  s2: {
    name:   'Fútbol',
    icon:   '⚽',
    courts: ['Cancha F8', 'Cancha F6', 'Cancha F5']
  },
};

const SLOTS = Array.from({ length: 16 }, (_, i) => `${String(6 + i).padStart(2, '0')}:00`);
/* ══════════════════════════════════════════════════ */

function fmt(d)   { return d.toISOString().split('T')[0]; }
function today()  { return fmt(new Date()); }
function weekEnd(){ const d = new Date(); d.setDate(d.getDate() + (6 - d.getDay())); return fmt(d); }

function escapeHTML(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[&<>'"]/g,
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

/* ── TOAST ───────────────────────────────────────── */
function showToast(msg, type = 'success') {
  const toast = document.getElementById('admin-toast');
  toast.textContent = msg;
  toast.className = `toast toast-${type} show`;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.remove('show'), 3200);
}

/* ── SUPABASE FETCH CON AUTH ────────────────────── */
function getHeaders() {
  const adminToken = localStorage.getItem('app_admin_token');
  return {
    apikey: SB_KEY,
    Authorization: `Bearer ${adminToken ? adminToken : SB_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation'
  };
}

async function sbGet(table, qs = '') {
  const r = await fetch(`${SB_URL}/rest/v1/${table}?${qs}`, { headers: getHeaders() });
  return r.json();
}
async function sbPost(table, data) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data)
  });
  return r.json();
}
async function sbPatch(table, id, data) {
  await fetch(`${SB_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify(data)
  });
}
async function sbDelete(table, id) {
  await fetch(`${SB_URL}/rest/v1/${table}?id=eq.${id}`, { method: 'DELETE', headers: getHeaders() });
}
async function sbDeleteWhere(table, filter) {
  await fetch(`${SB_URL}/rest/v1/${table}?${filter}`, { method: 'DELETE', headers: getHeaders() });
}

/* ── LOGIN ─────────────────────────────────────── */
async function doLogin() {
  const email    = document.getElementById('email-input').value.trim();
  const password = document.getElementById('pwd-input').value;
  const errorEl  = document.getElementById('login-error');
  const btn      = document.querySelector('.login-btn');

  if (!email || !password) return;

  btn.textContent = 'CARGANDO...';
  btn.disabled    = true;

  try {
    const res = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: SB_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();

    if (data.error) {
      errorEl.textContent = 'Credenciales incorrectas';
      errorEl.style.display = 'block';
    } else {
      localStorage.setItem('app_admin_token', data.access_token);
      errorEl.style.display = 'none';
      document.getElementById('login-screen').style.display = 'none';
      document.getElementById('admin-panel').style.display  = 'block';
      initAdmin();
    }
  } catch (err) {
    errorEl.textContent = 'Error de red';
    errorEl.style.display = 'block';
  }

  btn.textContent = 'INGRESAR';
  btn.disabled    = false;
}

function doLogout() {
  localStorage.removeItem('app_admin_token');
  document.getElementById('admin-panel').style.display  = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('pwd-input').value = '';
  document.getElementById('login-error').style.display = 'none';
}

/* ── TABS ───────────────────────────────────────── */
function switchTab(tab) {
  ['turnos', 'bloqueos', 'exportar'].forEach(t => {
    document.getElementById('tab-' + t).classList.toggle('hidden', t !== tab);
  });
  document.querySelectorAll('.tab-btn').forEach((btn, i) => {
    btn.classList.toggle('active', ['turnos', 'bloqueos', 'exportar'][i] === tab);
  });
  if (tab === 'bloqueos') renderBloqueos();
}

/* ── INIT ───────────────────────────────────────── */
async function initAdmin() {
  await renderStats();
  await renderTurnos();
  initBlockForm();
  setInterval(async () => {
    const dot = document.getElementById('live-dot');
    if (dot) dot.classList.add('pulse');
    await renderStats();
    await renderTurnos();
    if (dot) setTimeout(() => dot.classList.remove('pulse'), 800);
  }, 30000);
}

/* ── STATS ──────────────────────────────────────── */
async function renderStats() {
  const bks = await sbGet('bookings');
  if (!Array.isArray(bks)) { document.getElementById('stats-grid').innerHTML = ''; return; }
  const t      = today();
  const hoy    = bks.filter(b => b.date === t).length;
  const semana = bks.filter(b => b.date >= t && b.date <= weekEnd()).length;

  // Stats por servicio (dinámico desde CONFIG)
  const serviceStats = Object.entries(SPORTS).map(([key, s]) => {
    const count = bks.filter(b => b.sport === key && b.date >= t).length;
    return [s.name, count, 'próximos'];
  });

  document.getElementById('stats-grid').innerHTML =
    [['Hoy', hoy, 'reservas hoy'], ['Esta semana', semana, 'reservas totales'], ...serviceStats]
    .map(([l, v, s]) => `<div class="stat-card"><div class="stat-label">${l}</div><div class="stat-value">${v}</div><div class="stat-sub">${s}</div></div>`)
    .join('');
}

/* ── TURNOS ─────────────────────────────────────── */
let allBookings  = [];
let currentView  = 'lista';
let calStartDate = null;

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function isMobile() { return window.innerWidth <= 768; }

function initCalStart() {
  const now = new Date();
  const d   = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (isMobile()) {
    calStartDate = d;
  } else {
    const dow = d.getDay();
    d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
    calStartDate = d;
  }
}

function getCalDays() {
  if (!calStartDate) initCalStart();
  const count = isMobile() ? 3 : 7;
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(calStartDate);
    d.setDate(calStartDate.getDate() + i);
    return d;
  });
}

function switchView(view) {
  currentView = view;
  document.getElementById('view-lista').style.display      = view === 'lista'      ? 'block' : 'none';
  document.getElementById('view-calendario').style.display = view === 'calendario' ? 'block' : 'none';
  document.getElementById('btn-vista-lista').classList.toggle('active', view === 'lista');
  document.getElementById('btn-vista-cal').classList.toggle('active',   view === 'calendario');
  if (view === 'calendario') renderCalendar();
}

function moveCalendar(dir) {
  if (!calStartDate) initCalStart();
  const step = isMobile() ? 3 : 7;
  calStartDate.setDate(calStartDate.getDate() + dir * step);
  renderCalendar();
}

function goCalendarToday() { initCalStart(); renderCalendar(); }

function renderCalendar() {
  const days        = getCalDays();
  const colCount    = days.length;
  const todayStr    = today();
  const nowHour     = `${String(new Date().getHours()).padStart(2, '0')}:00`;
  const sportFilter = document.getElementById('filter-sport').value;

  const first = days[0], last = days[colCount - 1];
  const sameMonth = first.getMonth() === last.getMonth();
  document.getElementById('cal-week-label').textContent =
    `${first.getDate()} ${first.toLocaleDateString('es-AR', { month: 'short' })}` +
    (sameMonth ? '' : ` ${first.toLocaleDateString('es-AR', { month: 'short' })}`) +
    ` – ${last.getDate()} ${last.toLocaleDateString('es-AR', { month: 'short', year: 'numeric' })}`;

  const lookup = {};
  allBookings.forEach(b => {
    if (sportFilter && b.sport !== sportFilter) return;
    const key = `${b.date}|${b.time}`;
    if (!lookup[key]) lookup[key] = [];
    lookup[key].push(b);
  });

  const timeColW = isMobile() ? '44px' : '52px';
  document.getElementById('cal-grid').style.gridTemplateColumns =
    `${timeColW} repeat(${colCount}, minmax(0, 1fr))`;

  let html = `<div class="cal-corner"></div>`;
  days.forEach(d => {
    const ds      = fmt(d);
    const isToday = ds === todayStr;
    html += `<div class="cal-day-header${isToday ? ' cal-today-header' : ''}">
      <span class="cal-day-name">${DAY_NAMES[d.getDay()]}</span>
      <span class="cal-day-num${isToday ? ' cal-today-num' : ''}">${d.getDate()}</span>
    </div>`;
  });

  SLOTS.forEach(slot => {
    html += `<div class="cal-time-label">${slot}</div>`;
    days.forEach(d => {
      const ds   = fmt(d);
      const bks  = lookup[`${ds}|${slot}`] || [];
      const past = ds < todayStr || (ds === todayStr && slot < nowHour);
      html += `<div class="cal-cell${past ? ' cal-past' : ''}">`;
      bks.forEach(b => {
        html += `<div class="cal-card cal-card-${b.sport}" onclick="openEditModal('${b.id}')" title="${b.name} · ${b.court}">
          <span class="cal-card-court">${b.court.replace('Espacio ', '')}</span>
          <span class="cal-card-name">${escapeHTML(b.name.split(' ')[0])}</span>
        </div>`;
      });
      html += `</div>`;
    });
  });

  document.getElementById('cal-grid').innerHTML = html;
}

async function renderTurnos() {
  document.getElementById('turnos-body').innerHTML =
    Array(5).fill(0).map(() => `<div class="table-row cols-bookings skel-row">
      ${Array(6).fill(0).map((_, i) => `<span><div class="skel" style="height:14px;border-radius:6px;width:${[40,55,70,60,80,50][i]}%"></div></span>`).join('')}
      <span></span>
    </div>`).join('');
  allBookings = await sbGet('bookings', 'order=date,time');
  if (!Array.isArray(allBookings)) allBookings = [];
  filterAndRenderTurnos();
}

function filterAndRenderTurnos() {
  const sport    = document.getElementById('filter-sport').value;
  const period   = document.getElementById('filter-period').value;
  const search   = document.getElementById('filter-search').value.toLowerCase();
  const hourFrom = document.getElementById('filter-hour-from').value;
  const hourTo   = document.getElementById('filter-hour-to').value;
  const t        = today();

  let bks = [...allBookings];
  if (sport)              bks = bks.filter(b => b.sport === sport);
  if (period === 'today') bks = bks.filter(b => b.date === t);
  if (period === 'week')  bks = bks.filter(b => b.date >= t && b.date <= weekEnd());
  if (search)             bks = bks.filter(b => b.name.toLowerCase().includes(search) || (b.phone || '').includes(search));
  if (hourFrom)           bks = bks.filter(b => b.time >= hourFrom);
  if (hourTo)             bks = bks.filter(b => b.time <= hourTo);

  const countEl = document.getElementById('turnos-count');
  if (countEl) countEl.textContent = bks.length ? `Mostrando ${bks.length} reserva${bks.length !== 1 ? 's' : ''}` : '';

  if (currentView === 'calendario') renderCalendar();

  const body = document.getElementById('turnos-body');
  if (!bks.length) {
    body.innerHTML = '<div class="empty-table"><span>📋</span>No hay reservas con esos filtros.</div>';
    return;
  }

  body.innerHTML = bks.map(b => {
    const s    = SPORTS[b.sport] || { name: b.sport };
    const dt   = new Date(b.date + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
    const past = b.date < t;
    return `<div class="table-row cols-bookings" style="opacity:${past ? .55 : 1}">
      <span style="font-weight:700;font-size:14px">${b.time}</span>
      <span style="font-size:13px;text-transform:capitalize">${dt}</span>
      <span><span class="pill pill-${b.sport}">${s.name}</span></span>
      <span style="font-size:13px;color:var(--muted)">${b.court}</span>
      <span style="font-size:14px;font-weight:600">${escapeHTML(b.name)}${b.notes ? ' <span class="notes-dot" title="' + escapeHTML(b.notes) + '">📝</span>' : ''}</span>
      <span class="hide-mobile" style="font-size:13px;color:var(--muted)">${escapeHTML(b.phone || '')}</span>
      <span style="display:flex;gap:6px">
        <button class="icon-btn edit"   onclick="openEditModal('${b.id}')" title="Editar">✏️</button>
        <button class="icon-btn delete" onclick="deleteBooking('${b.id}')" title="Eliminar">🗑</button>
      </span>
    </div>`;
  }).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  // Título
  document.title = `Admin · ${APP_NAME}`;

  // Auto-login si hay sesión guardada
  const token = localStorage.getItem('app_admin_token');
  if (token) {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('admin-panel').style.display  = 'block';
    initAdmin();
  }

  // Poblar filtro de servicios dinámicamente desde CONFIG
  const sportFilter = document.getElementById('filter-sport');
  sportFilter.innerHTML = '<option value="">Todos los servicios</option>' +
    Object.entries(SPORTS).map(([k, s]) => `<option value="${k}">${s.name}</option>`).join('');

  // Poblar selects de rango horario
  const slotOptions = SLOTS.map(s => `<option value="${s}">${s}</option>`).join('');
  document.getElementById('filter-hour-from').innerHTML += slotOptions;
  document.getElementById('filter-hour-to').innerHTML   += slotOptions;

  document.getElementById('filter-sport').addEventListener('change',     filterAndRenderTurnos);
  document.getElementById('filter-period').addEventListener('change',    filterAndRenderTurnos);
  document.getElementById('filter-search').addEventListener('input',     filterAndRenderTurnos);
  document.getElementById('filter-hour-from').addEventListener('change', filterAndRenderTurnos);
  document.getElementById('filter-hour-to').addEventListener('change',   filterAndRenderTurnos);

  window.addEventListener('resize', () => {
    if (currentView === 'calendario') { initCalStart(); renderCalendar(); }
  });
});

async function deleteBooking(id) {
  if (!confirm('¿Eliminás esta reserva?')) return;
  await sbDelete('bookings', id);
  allBookings = allBookings.filter(b => b.id !== id);
  filterAndRenderTurnos();
  renderStats();
  showToast('Reserva eliminada');
}

/* ── EDIT MODAL ─────────────────────────────────── */
let editingId = null;

function openEditModal(id) {
  const b = allBookings.find(x => x.id === id);
  if (!b) return;
  editingId = id;

  document.getElementById('edit-name').value  = b.name;
  document.getElementById('edit-phone').value = b.phone || '';
  document.getElementById('edit-notes').value = b.notes || '';

  const timeSel = document.getElementById('edit-time');
  timeSel.innerHTML = SLOTS.map(s => `<option value="${s}" ${s === b.time ? 'selected' : ''}>${s}</option>`).join('');

  document.getElementById('edit-modal').style.display = 'flex';
}

function closeModal(e) {
  if (e.target.id === 'edit-modal') {
    document.getElementById('edit-modal').style.display = 'none';
  }
}

async function saveEdit() {
  const name  = document.getElementById('edit-name').value.trim();
  const phone = document.getElementById('edit-phone').value.trim();
  const time  = document.getElementById('edit-time').value;
  const notes = document.getElementById('edit-notes').value.trim();
  if (!name) { alert('El nombre no puede estar vacío.'); return; }

  const btn = document.querySelector('.modal-save');
  btn.textContent = 'GUARDANDO...';
  btn.disabled = true;

  await sbPatch('bookings', editingId, { name, phone, time, notes });

  const idx = allBookings.findIndex(b => b.id === editingId);
  if (idx > -1) { allBookings[idx] = { ...allBookings[idx], name, phone, time, notes }; }

  document.getElementById('edit-modal').style.display = 'none';
  btn.textContent = 'GUARDAR';
  btn.disabled    = false;
  filterAndRenderTurnos();
}

/* ── BLOQUEOS ───────────────────────────────────── */
function initBlockForm() {
  updateCourtSelect();
  document.getElementById('bl-date').value = today();
  document.getElementById('bl-time').innerHTML = SLOTS.map(s => `<option value="${s}">${s}</option>`).join('');

  // Poblar select de servicios en el form de bloqueo
  document.getElementById('bl-sport').innerHTML =
    Object.entries(SPORTS).map(([k, s]) => `<option value="${k}">${s.name}</option>`).join('');
  updateCourtSelect();
}

function updateCourtSelect() {
  const sport  = document.getElementById('bl-sport').value;
  const courts = SPORTS[sport]?.courts || [];
  document.getElementById('bl-court').innerHTML = courts.map(c => `<option value="${c}">${c}</option>`).join('');
}

async function addBlock() {
  const sport = document.getElementById('bl-sport').value;
  const court = document.getElementById('bl-court').value;
  const date  = document.getElementById('bl-date').value;
  const time  = document.getElementById('bl-time').value;
  if (!date) { showToast('Seleccioná una fecha', 'error'); return; }
  await sbPost('blocks', { id: crypto.randomUUID(), sport, court, date, time });
  renderBloqueos();
  showToast('Horario bloqueado');
}

async function renderBloqueos() {
  document.getElementById('bloqueos-body').innerHTML = '<div class="loading">Cargando...</div>';
  const blocks = await sbGet('blocks', 'order=date,time');
  if (!Array.isArray(blocks) || !blocks.length) {
    document.getElementById('bloqueos-body').innerHTML = '<div class="empty-table"><span>🚫</span>No hay horarios bloqueados.</div>';
    return;
  }
  document.getElementById('bloqueos-body').innerHTML = blocks.map(b => {
    const s  = SPORTS[b.sport] || { name: b.sport };
    const dt = new Date(b.date + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
    return `<div class="table-row" style="grid-template-columns:80px 120px 1fr 1fr 60px">
      <span style="font-weight:700">${b.time}</span>
      <span style="font-size:13px">${dt}</span>
      <span><span class="pill pill-${b.sport}">${s.name}</span></span>
      <span style="font-size:13px;color:var(--muted)">${b.court}</span>
      <span><button class="icon-btn delete" onclick="deleteBlock('${b.id}')" title="Quitar bloqueo">🗑</button></span>
    </div>`;
  }).join('');
}

async function deleteBlock(id) {
  if (!confirm('¿Quitás el bloqueo?')) return;
  await sbDelete('blocks', id);
  renderBloqueos();
  showToast('Bloqueo eliminado');
}

/* ── EXPORT ─────────────────────────────────────── */
async function exportCSV(mode) {
  let bks = await sbGet('bookings', 'order=date,time');
  if (!Array.isArray(bks) || !bks.length) { alert('No hay reservas para exportar.'); return; }
  if (mode === 'today') bks = bks.filter(b => b.date === today());
  if (!bks.length) { alert('No hay reservas para hoy.'); return; }

  const header = ['Fecha', 'Hora', 'Servicio', 'Espacio', 'Titular', 'Teléfono', 'Email'].join(',');
  const rows   = bks.map(b => [
    b.date, b.time,
    (SPORTS[b.sport] || { name: b.sport }).name,
    b.court, `"${b.name}"`, b.phone || '', b.email || ''
  ].join(','));

  const csv  = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `reservas-${today()}.csv`; a.click();
  URL.revokeObjectURL(url);
  showToast(`CSV descargado · ${bks.length} reservas`);
}

async function clearPast() {
  const bks = await sbGet('bookings', `date=lt.${today()}`);
  if (!Array.isArray(bks) || !bks.length) { alert('No hay reservas pasadas.'); return; }
  if (!confirm(`¿Eliminás ${bks.length} reserva${bks.length > 1 ? 's' : ''} pasada${bks.length > 1 ? 's' : ''}? No se puede deshacer.`)) return;
  await sbDeleteWhere('bookings', `date=lt.${today()}`);
  renderStats();
  renderTurnos();
  showToast('Reservas pasadas eliminadas');
}
