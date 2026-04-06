/* ══════════════════════════════════════════════════
   ⚙️  CONFIG — EDITÁ ESTO PARA TU NEGOCIO
   ══════════════════════════════════════════════════ */
const APP_NAME    = 'TurnoYa';                  // Nombre que aparece en la app
const APP_ADDRESS = 'Tu dirección, Ciudad';      // Dirección visible al usuario
const APP_MAPS_URL = 'https://maps.google.com/?q=Tu+Negocio'; // Link de Google Maps

const CANCEL_LIMIT_HOURS = 2; // mínimo de horas de anticipación para cancelar

// Supabase
const SB_URL = 'https://krxkbpwbkymjasezwvjj.supabase.co';
const SB_KEY = 'sb_publishable_BwDGv_CKHYSHvKxyuvdTLA_ImbVP23-';

// Horarios de apertura (para el indicador abierto/cerrado)
const HORARIOS = {
  weekdays: { open: 8, close: 22 }, // Lunes a Viernes
  saturday: { open: 8, close: 20 }, // Sábados
  sunday:   { open: 9, close: 18 }, // Domingos
};

// Servicios / Espacios / Canchas disponibles
// Podés agregar o quitar servicios, cambiar nombres, íconos y espacios.
const SPORTS = {
  s1: {
    name:        'Pádel',
    icon:        '🏸',
    courts:      ['Cancha A', 'Cancha B', 'Cancha C'],
    duration:    60,
    tag:         '3 canchas · 60 min · Cubierto',
    accent:      'var(--green)',
    accentLight: 'var(--glight)',
    accentClass: 'accent-s1'
  },
  s2: {
    name:        'Fútbol',
    icon:        '⚽',
    courts:      ['Cancha F8', 'Cancha F6', 'Cancha F5'],
    duration:    60,
    tag:         '3 canchas · 60 min · Césped sintético',
    accent:      'var(--blue)',
    accentLight: 'var(--bluelight)',
    accentClass: 'accent-s2'
  },
};

// Turnos disponibles: 06:00 a 21:00 (16 slots de 1h)
const SLOTS = Array.from({ length: 16 }, (_, i) => `${String(6 + i).padStart(2, '0')}:00`);
/* ══════════════════════════════════════════════════ */

const sb = supabase.createClient(SB_URL, SB_KEY);

/* ── SESSION MANAGEMENT ──────────────────────────── */
sb.auth.onAuthStateChange((event, session) => {
  if (session?.access_token) {
    localStorage.setItem('app_client_token', session.access_token);
  } else if (event === 'SIGNED_OUT') {
    localStorage.removeItem('app_client_token');
  }
});

sb.auth.getSession().then(({ data }) => {
  if (data.session?.access_token) {
    localStorage.setItem('app_client_token', data.session.access_token);
  }
});

/* ── XSS PROTECTION ──────────────────────────────── */
function escapeHTML(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[&<>'"]/g, tag => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[tag] || tag));
}

/* ── TOAST ───────────────────────────────────────── */
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast toast-${type} show`;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.remove('show'), 3200);
}

/* ── SUPABASE HELPERS ────────────────────────────── */
function getClientHeaders() {
  const token = localStorage.getItem('app_client_token');
  return {
    apikey: SB_KEY,
    Authorization: `Bearer ${token ? token : SB_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation'
  };
}

function handleSessionExpired() {
  localStorage.removeItem('app_client_token');
  showToast('Tu sesión expiró. Iniciá sesión de nuevo.', 'error');
  setTimeout(() => goTo('view-login'), 1200);
}

async function sbGet(table, filters = '') {
  const res = await fetch(`${SB_URL}/rest/v1/${table}?${filters}`, { headers: getClientHeaders() });
  if (res.status === 401) { handleSessionExpired(); return []; }
  return res.json();
}

async function sbPost(table, data) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: getClientHeaders(),
    body: JSON.stringify(data)
  });
  if (res.status === 401) { handleSessionExpired(); throw new Error('session_expired'); }
  return res.json();
}

async function sbDelete(table, id) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'DELETE',
    headers: getClientHeaders()
  });
  if (res.status === 401) { handleSessionExpired(); }
}

/* ── STATE ─────────────────────────────────────────── */
let currentSport = null;
let selectedDate = new Date();
let wkStart      = getMonday(new Date());
let pendingSlot  = null;
let bookings     = [];
let blocks       = [];
let lastBooking  = null;

function fmt(d)  { return d.toISOString().split('T')[0]; }
function today() { return fmt(new Date()); }
function getMonday(d) { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }

/* ── LOAD DATA ───────────────────────────────────── */
async function loadAll() {
  try {
    [bookings, blocks] = await Promise.all([
      sbGet('bookings', 'order=date,time'),
      sbGet('blocks')
    ]);
    if (!Array.isArray(bookings)) bookings = [];
    if (!Array.isArray(blocks))   blocks   = [];
  } catch (e) {
    bookings = []; blocks = [];
  }
  updateHomeCount();
}
loadAll();
updateClubStatus();

/* ── ROUTING ─────────────────────────────────────── */
function goTo(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
  if (id === 'view-home')       { updateHomeCount(); updateClubStatus(); }
  if (id === 'view-mis-turnos') renderBookings();
}

/* ── HOME ─────────────────────────────────────────── */
function getAvailableCount(sport) {
  if (!Array.isArray(bookings) || !Array.isArray(blocks)) return null;
  const s        = SPORTS[sport];
  const todayStr = today();
  const nowHour  = new Date().getHours();
  let count = 0;
  SLOTS.forEach(time => {
    if (parseInt(time) <= nowHour) return;
    s.courts.forEach(court => {
      const taken =
        bookings.some(b => b.court === court && b.time === time && b.date === todayStr && b.sport === sport) ||
        blocks.some(b  => b.court === court && b.time === time && b.date === todayStr && b.sport === sport);
      if (!taken) count++;
    });
  });
  return count;
}

function updateHomeCount() {
  const myId = getMyUserId();
  const n    = bookings.filter(b => b.date >= today() && b.user_id === myId).length;
  const el   = document.getElementById('home-bk-count');
  if (el) el.textContent = n === 0 ? 'Sin turnos próximos' : `${n} turno${n > 1 ? 's' : ''} próximo${n > 1 ? 's' : ''}`;

  Object.keys(SPORTS).forEach(sport => {
    const badge = document.getElementById(`avail-${sport}`);
    if (!badge) return;
    const c = getAvailableCount(sport);
    if (c === null) return;
    if (c === 0) {
      badge.textContent = 'Sin disponibilidad hoy';
      badge.className = 'avail-badge red';
    } else if (c <= 4) {
      badge.textContent = `¡Solo ${c} lugar${c > 1 ? 'es' : ''} disponible${c > 1 ? 's' : ''} hoy!`;
      badge.className = 'avail-badge orange';
    } else {
      badge.textContent = `${c} lugares disponibles hoy`;
      badge.className = 'avail-badge green';
    }
  });
}

/* ── SPORT SELECT ────────────────────────────────── */
function setSport(key) { currentSport = key; }
function selectSport(key) {
  currentSport  = key;
  selectedDate  = new Date();
  wkStart       = getMonday(new Date());
  const s       = SPORTS[key];
  document.getElementById('grid-title').textContent = s.name;
  document.getElementById('grid-sub').textContent   = s.tag;
  const hdr     = document.getElementById('grid-header');
  hdr.className = 'page-header ' + s.accentClass;
  renderDays();
  renderGrid();
  goTo('view-grid');
}

/* ── DAYS ─────────────────────────────────────────── */
function shiftWeek(dir) {
  wkStart = new Date(wkStart);
  wkStart.setDate(wkStart.getDate() + dir * 7);
  renderDays();
  renderGrid();
}

function renderDays() {
  const strip   = document.getElementById('days-scroll');
  strip.innerHTML = '';
  const s       = SPORTS[currentSport];
  const hdr     = document.getElementById('grid-header');
  hdr.className = 'page-header ' + s.accentClass;

  for (let i = 0; i < 7; i++) {
    const d    = new Date(wkStart);
    d.setDate(d.getDate() + i);
    const df   = fmt(d);
    const sel  = df === fmt(selectedDate);
    const hoy  = df === today();
    const past = df < today();
    const dayNames = ['DO', 'LU', 'MA', 'MI', 'JU', 'VI', 'SA'];
    const dn   = dayNames[d.getDay()];

    const btn  = document.createElement('button');
    btn.className = 'day-btn' + (sel ? ' selected' : '') + (hoy ? ' today' : '') + (past ? ' past' : '');
    btn.innerHTML =
      `<span class="dname">${dn}</span>` +
      `<span class="dnum">${d.getDate()}</span>` +
      (hoy ? `<span class="dhoy">HOY</span>` : '');
    if (!past) { btn.onclick = () => { selectedDate = d; renderDays(); renderGrid(); }; }
    strip.appendChild(btn);
  }
  document.getElementById('sel-date-label').textContent =
    selectedDate.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
}

/* ── GRID ─────────────────────────────────────────── */
function isBooked(court, time, date) {
  const dateStr = fmt(date);
  const booked  = bookings.some(b => b.court === court && b.time === time && b.date === dateStr && b.sport === currentSport);
  if (booked) return true;
  return blocks.some(b => b.court === court && b.time === time && b.date === dateStr && b.sport === currentSport);
}

function isPastSlot(time, date) {
  if (fmt(date) > today()) return false;
  if (fmt(date) < today()) return true;
  return parseInt(time) <= new Date().getHours();
}

function renderGrid() {
  const s      = SPORTS[currentSport];
  const wrap   = document.getElementById('grid-inner');
  const accent = currentSport === 's1' ? 'var(--green)' : 'var(--blue)';

  const visibleSlots = SLOTS.filter(time =>
    !isPastSlot(time, selectedDate) ||
    s.courts.some(c => isBooked(c, time, selectedDate))
  );

  if (visibleSlots.length === 0) {
    wrap.innerHTML = `<div class="no-slots-wrap">
      <div class="no-slots-icon">📅</div>
      <div class="no-slots-title">Sin turnos para este día</div>
      <div class="no-slots-sub">Todos los horarios ya pasaron.<br>Seleccioná otro día.</div>
    </div>`;
    return;
  }

  const anyAvail = visibleSlots.some(time =>
    !isPastSlot(time, selectedDate) &&
    s.courts.some(c => !isBooked(c, time, selectedDate))
  );

  if (!anyAvail) {
    wrap.innerHTML = `<div class="no-slots-wrap">
      <div class="no-slots-icon">🏟</div>
      <div class="no-slots-title">Sin disponibilidad</div>
      <div class="no-slots-sub">Todos los espacios están reservados.<br>Probá con otro día.</div>
    </div>`;
    return;
  }

  let html = `<div class="matrix-wrap"><table class="matrix-table">`;
  html += `<thead><tr><th class="matrix-corner"></th>`;
  visibleSlots.forEach(time => { html += `<th class="matrix-hour">${time}</th>`; });
  html += `</tr></thead><tbody>`;

  s.courts.forEach(court => {
    html += `<tr><td class="matrix-court">${court}</td>`;
    visibleSlots.forEach(time => {
      const taken = isBooked(court, time, selectedDate);
      const gone  = isPastSlot(time, selectedDate);
      const avail = !taken && !gone;
      html += avail
        ? `<td class="matrix-cell avail" onclick="openForm('${court}','${time}')" style="--ac:${accent}"></td>`
        : `<td class="matrix-cell taken"></td>`;
    });
    html += `</tr>`;
  });

  html += `</tbody></table>
    <div class="matrix-legend">
      <div class="matrix-leg-item"><div class="matrix-leg-dot avail" style="background:${accent}"></div>Disponible</div>
      <div class="matrix-leg-item"><div class="matrix-leg-dot taken"></div>Reservado</div>
    </div></div>`;

  wrap.innerHTML = html;
}

/* ── RESERVA RECURRENTE ──────────────────────────── */
function toggleRepeat() {
  const on = document.getElementById('repeat-toggle').checked;
  document.getElementById('repeat-options').classList.toggle('hidden', !on);
  if (on) updateRepeatPreview();
  _syncRepeatBtn();
}

function getRepeatDates() {
  const weeks = parseInt(document.getElementById('repeat-weeks')?.value || '1');
  return Array.from({ length: weeks }, (_, i) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + (i + 1) * 7);
    return fmt(d);
  });
}

function updateRepeatPreview() {
  const preview = document.getElementById('repeat-preview');
  if (!preview || !pendingSlot) return;
  preview.innerHTML = getRepeatDates().map(d => {
    const taken =
      bookings.some(b => b.court === pendingSlot.court && b.time === pendingSlot.time && b.date === d && b.sport === currentSport) ||
      blocks.some(b  => b.court === pendingSlot.court && b.time === pendingSlot.time && b.date === d && b.sport === currentSport);
    const label = new Date(d + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
    return `<div class="repeat-date-item ${taken ? 'taken' : 'ok'}">
      <span class="repeat-date-icon">${taken ? '✗' : '✓'}</span>
      <span>${label}</span>
      ${taken ? '<span class="repeat-date-tag">Ocupado — se omitirá</span>' : ''}
    </div>`;
  }).join('');
  _syncRepeatBtn();
}

function _syncRepeatBtn() {
  const btn = document.getElementById('btn-confirm');
  if (!btn) return;
  const on = document.getElementById('repeat-toggle')?.checked;
  if (on) {
    const free  = getRepeatDates().filter(d =>
      !bookings.some(b => b.court === pendingSlot?.court && b.time === pendingSlot?.time && b.date === d && b.sport === currentSport) &&
      !blocks.some(b   => b.court === pendingSlot?.court && b.time === pendingSlot?.time && b.date === d && b.sport === currentSport)
    ).length;
    btn.textContent = `CONFIRMAR ${1 + free} RESERVAS`;
  } else {
    if (!btn.disabled) btn.textContent = 'CONFIRMAR RESERVA';
  }
}

/* ── FORM ─────────────────────────────────────────── */
function openForm(court, time) {
  if (!getMyUserId()) {
    pendingSlot = { court, time };
    localStorage.setItem('app_pending_login', JSON.stringify({
      court, time, sport: currentSport, date: fmt(selectedDate)
    }));
    goTo('view-login');
    return;
  }

  pendingSlot = { court, time };
  const s     = SPORTS[currentSport];
  const sc    = document.getElementById('summary-card');
  sc.style.background      = s.accentLight;
  sc.style.borderLeftColor = s.accent;
  document.getElementById('summary-label').style.color = s.accent;
  document.getElementById('summary-label').textContent = 'DETALLE DE LA RESERVA';

  const dateStr = selectedDate.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  document.getElementById('summary-grid').innerHTML =
    [['Servicio', `${s.icon} ${s.name}`], ['Espacio', court], ['Fecha', dateStr], ['Horario', `${time} · ${s.duration} min`]]
      .map(([k, v]) => `<div><div class="summary-item-key" style="color:${s.accent}">${k}</div><div class="summary-item-val">${v}</div></div>`)
      .join('');

  const profile = JSON.parse(localStorage.getItem('app_user_profile') || 'null');
  document.getElementById('inp-name').value  = profile?.name  || '';
  document.getElementById('inp-phone').value = profile?.phone || '';
  const emailEl = document.getElementById('inp-email');
  if (emailEl) emailEl.value = profile?.email || '';

  // Reset repeat toggle
  const rt = document.getElementById('repeat-toggle');
  if (rt) { rt.checked = false; document.getElementById('repeat-options').classList.add('hidden'); }

  checkForm();
  goTo('view-form');
}

function checkForm() {
  const name    = document.getElementById('inp-name').value.trim();
  const phone   = document.getElementById('inp-phone').value.replace(/\D/g, '');
  const nameOk  = name.length >= 3;
  const phoneOk = phone.length >= 8;
  document.getElementById('btn-confirm').disabled = !(nameOk && phoneOk);
}

async function confirmBooking() {
  const name  = document.getElementById('inp-name').value.trim();
  const phone = document.getElementById('inp-phone').value.trim();
  const email = document.getElementById('inp-email') ? document.getElementById('inp-email').value.trim() : '';
  if (!name || !phone) return;

  const btn    = document.getElementById('btn-confirm');
  btn.disabled = true;

  btn.textContent = 'VERIFICANDO...';
  try {
    const check = await sbGet('bookings',
      `sport=eq.${currentSport}&court=eq.${encodeURIComponent(pendingSlot.court)}&date=eq.${fmt(selectedDate)}&time=eq.${pendingSlot.time}&select=id`
    );
    if (Array.isArray(check) && check.length > 0) {
      showToast('Ese turno acaba de ser reservado. Elegí otro.', 'error');
      await loadAll();
      renderGrid();
      goTo('view-grid');
      btn.disabled    = false;
      btn.textContent = 'CONFIRMAR RESERVA';
      return;
    }
  } catch { /* si falla el check igual intentamos */ }

  btn.textContent = 'GUARDANDO...';

  const bk = {
    id:      crypto.randomUUID(),
    user_id: getMyUserId(),
    sport:   currentSport,
    court:   pendingSlot.court,
    time:    pendingSlot.time,
    date:    fmt(selectedDate),
    name, phone, email
  };

  try {
    const result = await sbPost('bookings', bk);

    if (result?.code === '23505') {
      showToast('Ese turno acaba de ser tomado por otra persona. Elegí otro.', 'error');
      await loadAll();
      renderGrid();
      goTo('view-grid');
      btn.disabled    = false;
      btn.textContent = 'CONFIRMAR RESERVA';
      return;
    }

    bookings.push(bk);

    // Reservas recurrentes
    let repeatCount = 0;
    if (document.getElementById('repeat-toggle')?.checked) {
      const extraDates = getRepeatDates().filter(d =>
        !bookings.some(b => b.court === bk.court && b.time === bk.time && b.date === d && b.sport === bk.sport) &&
        !blocks.some(b  => b.court === bk.court && b.time === bk.time && b.date === d && b.sport === bk.sport)
      );
      if (extraDates.length) {
        const extras = extraDates.map(date => ({ ...bk, id: crypto.randomUUID(), date }));
        await Promise.allSettled(extras.map(b => sbPost('bookings', b)));
        extras.forEach(b => bookings.push(b));
        repeatCount = extras.length;
      }
    }

    lastBooking = { ...bk, _repeatCount: repeatCount };
    localStorage.setItem('app_user_profile', JSON.stringify({ name, phone, email }));
    if (navigator.vibrate) navigator.vibrate([60, 40, 120]);
    renderConfirm(bk, repeatCount);
    goTo('view-ok');
    launchConfetti();
    updateHomeCount();
  } catch (e) {
    if (e.message !== 'session_expired') {
      showToast('Error al guardar la reserva. Intentá de nuevo.', 'error');
      btn.disabled    = false;
      btn.textContent = 'CONFIRMAR RESERVA';
    }
  }
}

function renderConfirm(bk, repeatCount = 0) {
  const s    = SPORTS[bk.sport];
  const dt   = new Date(bk.date + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  const rows = [['Titular', bk.name], ['Servicio', s.name], ['Espacio', bk.court], ['Fecha', dt], ['Horario', `${bk.time} · ${s.duration} min`], ['Teléfono', bk.phone]];
  if (bk.email) rows.push(['Email', bk.email]);
  if (repeatCount > 0) rows.push(['Total reservas', `${1 + repeatCount} turnos confirmados`]);
  document.getElementById('confirm-table').innerHTML =
    rows.map(([k, v], i, a) => `<div class="confirm-row" style="${i === a.length - 1 ? 'border-bottom:none' : ''}">
      <span class="confirm-key">${k}</span>
      <span class="confirm-val">${escapeHTML(String(v))}</span></div>`)
      .join('');
  document.querySelector('.ok-sub').textContent =
    repeatCount > 0
      ? `Confirmaste ${1 + repeatCount} turnos. ¡Te esperamos!`
      : 'Tu turno quedó reservado. Te esperamos.';
}

/* ── CONFETTI ────────────────────────────────────── */
function launchConfetti() {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9998';
  document.body.appendChild(canvas);
  const W = canvas.width  = window.innerWidth;
  const H = canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');
  const colors = ['#4f46e5','#818cf8','#c4b5fd','#7c3aed','#a78bfa','#38bdf8','#f0f9ff','#ffffff','#fbbf24'];
  const pieces = Array.from({length: 100}, () => ({
    x:   Math.random() * W,
    y:  -10 - Math.random() * 140,
    w:   7 + Math.random() * 8,
    h:   4 + Math.random() * 5,
    color: colors[Math.floor(Math.random() * colors.length)],
    vx: (Math.random() - 0.5) * 4.5,
    vy:  2.5 + Math.random() * 4,
    rot: Math.random() * Math.PI * 2,
    rv: (Math.random() - 0.5) * 0.2,
  }));
  let start = null;
  const DUR = 3400;
  function draw(ts) {
    if (!start) start = ts;
    const t = ts - start;
    ctx.clearRect(0, 0, W, H);
    const alpha = t > DUR * 0.55 ? Math.max(0, 1 - (t - DUR * 0.55) / (DUR * 0.45)) : 1;
    pieces.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.rot += p.rv; p.vy += 0.07;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    if (t < DUR) requestAnimationFrame(draw);
    else canvas.remove();
  }
  requestAnimationFrame(draw);
}

/* ── ADD TO CALENDAR ─────────────────────────────── */
function _calDates(bk) {
  const s = SPORTS[bk.sport];
  const [hh] = bk.time.split(':');
  const h = parseInt(hh);
  const endH = h + Math.floor(s.duration / 60);
  const endM = s.duration % 60;
  const pad = n => String(n).padStart(2, '0');
  const d = bk.date.replace(/-/g, '');
  return {
    start: `${d}T${pad(h)}0000`,
    end:   `${d}T${pad(endH)}${pad(endM)}00`,
  };
}

function addToGoogleCalendar() {
  if (!lastBooking) return;
  const bk = lastBooking;
  const s  = SPORTS[bk.sport];
  const { start, end } = _calDates(bk);
  const title   = encodeURIComponent(`${s.icon} ${s.name} · ${bk.court}`);
  const details = encodeURIComponent(`Reserva via ${APP_NAME} · ${bk.name} · ${bk.phone}`);
  const loc     = encodeURIComponent(APP_ADDRESS);
  window.open(
    `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&details=${details}&location=${loc}`,
    '_blank'
  );
}

function downloadICS() {
  if (!lastBooking) return;
  const bk = lastBooking;
  const s  = SPORTS[bk.sport];
  const { start, end } = _calDates(bk);
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TurnoYa//ES',
    'BEGIN:VEVENT',
    `UID:${bk.id}@turnoya`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${s.icon} ${s.name} - ${bk.court}`,
    `DESCRIPTION:Reserva via ${APP_NAME}\\n${bk.name} · ${bk.phone}`,
    `LOCATION:${APP_ADDRESS}`,
    'STATUS:CONFIRMED',
    'END:VEVENT', 'END:VCALENDAR'
  ].join('\r\n');
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })),
    download: `turno-${bk.date}.ics`
  });
  a.click();
}

/* ── PWA INSTALL PROMPT ──────────────────────────── */
let _deferredInstall = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  _deferredInstall = e;
  const banner = document.getElementById('pwa-banner');
  if (banner) setTimeout(() => banner.classList.remove('hidden'), 2000);
});

function installPWA() {
  if (!_deferredInstall) return;
  _deferredInstall.prompt();
  _deferredInstall.userChoice.then(() => { _deferredInstall = null; });
  document.getElementById('pwa-banner')?.classList.add('hidden');
}

function dismissPWA() {
  document.getElementById('pwa-banner')?.classList.add('hidden');
}

/* ── WHATSAPP SHARE ──────────────────────────────── */
function shareWhatsApp() {
  if (!lastBooking) return;
  const bk  = lastBooking;
  const s   = SPORTS[bk.sport];
  const dt  = new Date(bk.date + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  const msg =
    `✅ *Reserva confirmada · ${APP_NAME}*\n\n` +
    `${s.icon} *${s.name}* · ${bk.court}\n` +
    `📅 ${dt}\n` +
    `⏰ ${bk.time} hs · ${s.duration} min\n` +
    `👤 ${bk.name}\n` +
    `📱 ${bk.phone}\n\n` +
    `_${APP_ADDRESS}_`;
  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
}

/* ── MY BOOKINGS ─────────────────────────────────── */
async function renderBookings() {
  const wrap = document.getElementById('bookings-wrap');
  wrap.innerHTML = `<div class="skel-wrap">${Array(3).fill(0).map(() => `
    <div class="skel-card">
      <div class="skel skel-badge"></div>
      <div class="skel skel-title"></div>
      <div class="skel skel-line"></div>
      <div class="skel skel-line short"></div>
    </div>`).join('')}</div>`;

  try {
    bookings = await sbGet('bookings', 'order=date,time');
    if (!Array.isArray(bookings)) bookings = [];
  } catch (e) {}

  const myId       = getMyUserId();
  const myBookings = bookings.filter(b => b.user_id === myId);

  const upcoming = myBookings.filter(b => b.date >= today()).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  const past     = myBookings.filter(b => b.date <  today()).sort((a, b) => b.date.localeCompare(a.date));

  document.getElementById('mis-sub').textContent =
    `${upcoming.length} próximo${upcoming.length !== 1 ? 's' : ''} · ${past.length} finalizado${past.length !== 1 ? 's' : ''}`;

  if (!myBookings.length) {
    wrap.innerHTML = `<div class="empty-state">
      <div class="empty-emoji">📋</div>
      <div class="empty-title">SIN RESERVAS</div>
      <div class="empty-sub">Todavía no reservaste ningún turno.</div>
      <button class="btn-primary green btn-centered" onclick="goTo('view-home')">RESERVAR AHORA</button>
    </div>`;
    return;
  }

  let html = '';
  if (upcoming.length) {
    html += `<div class="bk-section-label">PRÓXIMOS</div>`;
    upcoming.forEach(b => { html += bkCard(b, false); });
  }
  if (past.length) {
    html += `<div class="bk-section-label">HISTORIAL</div>`;
    past.forEach(b => { html += bkCard(b, true); });
  }
  wrap.innerHTML = html;
}

function bkCard(b, isPast) {
  const s       = SPORTS[b.sport];
  const dt      = new Date(b.date + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  const countdown = !isPast ? daysUntil(b.date) : null;
  return `<div class="booking-card ${b.sport}${isPast ? ' past' : ''}" id="bk-${b.id}">
    <div class="bk-top">
      <div style="flex:1">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;flex-wrap:wrap">
          <span class="bk-sport">${s.name}</span>
          <span class="bk-court">· ${b.court}</span>
          ${isPast ? '<span class="bk-badge">Finalizado</span>' : ''}
          ${countdown ? `<span class="bk-countdown ${countdown.cls}">${countdown.label}</span>` : ''}
        </div>
        <div class="bk-date">${dt}</div>
        <div class="bk-meta">${b.time} · ${s.duration} min · ${escapeHTML(b.name)} · ${escapeHTML(b.phone)}</div>
      </div>
      ${!isPast ? `<div id="cancel-wrap-${b.id}">
        <button class="cancel-btn" onclick="askCancel('${b.id}')">Cancelar</button>
      </div>` : ''}
    </div>
  </div>`;
}

function askCancel(id) {
  const bk = bookings.find(b => b.id === id);
  if (bk) {
    const hoursUntil = (new Date(`${bk.date}T${bk.time}:00`) - new Date()) / 3600000;
    if (hoursUntil < CANCEL_LIMIT_HOURS) {
      showToast(`No se puede cancelar con menos de ${CANCEL_LIMIT_HOURS} hs de anticipación.`, 'error');
      return;
    }
  }
  document.getElementById(`cancel-wrap-${id}`).innerHTML =
    `<div class="cancel-confirm">
      <div class="cancel-ask">¿Cancelar?</div>
      <div class="cancel-row">
        <button class="btn-no"  onclick="renderBookings()">No</button>
        <button class="btn-yes" onclick="doCancel('${id}')">Sí</button>
      </div>
    </div>`;
}

async function doCancel(id) {
  await sbDelete('bookings', id);
  bookings = bookings.filter(b => b.id !== id);
  updateHomeCount();
  renderBookings();
  showToast('Reserva cancelada');
}

/* ── LOGIN ───────────────────────────────────────── */
let currentLoginEmail = '';

async function sendOTP() {
  const email = document.getElementById('client-email').value.trim();
  if (!email) return;

  document.getElementById('login-msg').textContent = 'Enviando...';

  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true }
  });

  if (error) {
    document.getElementById('login-msg').textContent = 'Error al enviar el código.';
    return;
  }

  currentLoginEmail = email;
  document.getElementById('login-step-1').classList.add('hidden');
  document.getElementById('login-step-2').classList.remove('hidden');
  document.getElementById('login-msg').textContent = 'Código enviado. Revisá tu correo (y SPAM).';
}

async function verifyOTP() {
  const token = document.getElementById('client-otp').value.replace(/\D/g, '').trim();
  if (!token) {
    document.getElementById('login-msg').textContent = 'Ingresá el código que llegó al correo.';
    return;
  }

  document.getElementById('login-msg').textContent = 'Verificando...';

  let data, error;
  ({ data, error } = await sb.auth.verifyOtp({
    email: currentLoginEmail,
    token,
    type: 'email'
  }));

  // fallback: algunos proyectos usan type magiclink
  if (error) {
    ({ data, error } = await sb.auth.verifyOtp({
      email: currentLoginEmail,
      token,
      type: 'magiclink'
    }));
  }

  if (error) {
    document.getElementById('login-msg').textContent = error.message || 'Código incorrecto o expirado.';
    return;
  }

  const accessToken = data.session?.access_token;
  if (accessToken) localStorage.setItem('app_client_token', accessToken);

  document.getElementById('client-email').value = '';
  document.getElementById('client-otp').value   = '';
  resetLogin();

  const pending = JSON.parse(localStorage.getItem('app_pending_login') || 'null');
  if (pending) {
    localStorage.removeItem('app_pending_login');
    currentSport = pending.sport;
    selectedDate = new Date(pending.date + 'T12:00:00');
    wkStart      = getMonday(selectedDate);
    const s      = SPORTS[currentSport];
    document.getElementById('grid-title').textContent = s.name;
    document.getElementById('grid-sub').textContent   = s.tag;
    openForm(pending.court, pending.time);
  } else {
    goTo('view-home');
  }
  showToast('¡Sesión iniciada!');
}

function resetLogin() {
  currentLoginEmail = '';
  document.getElementById('login-step-1').classList.remove('hidden');
  document.getElementById('login-step-2').classList.add('hidden');
  document.getElementById('login-msg').textContent = '';
}

/* ── ESTADO DEL NEGOCIO ──────────────────────────── */
function isClubOpen() {
  const now = new Date();
  const day = now.getDay(); // 0=Dom, 6=Sáb
  const h   = now.getHours() + now.getMinutes() / 60;
  if (day >= 1 && day <= 5) return h >= HORARIOS.weekdays.open && h < HORARIOS.weekdays.close;
  if (day === 6)             return h >= HORARIOS.saturday.open && h < HORARIOS.saturday.close;
  if (day === 0)             return h >= HORARIOS.sunday.open   && h < HORARIOS.sunday.close;
  return false;
}

function updateClubStatus() {
  const dot  = document.getElementById('club-status-dot');
  const text = document.getElementById('club-status-text');
  if (!dot || !text) return;
  const open = isClubOpen();
  dot.className  = `club-dot ${open ? 'open' : 'closed'}`;
  text.textContent = open ? 'Abierto ahora' : 'Cerrado ahora';
  text.className = `club-status-text ${open ? 'open' : 'closed'}`;
}

/* ── DÍAS RESTANTES ──────────────────────────────── */
function daysUntil(dateStr) {
  const t    = new Date(); t.setHours(0, 0, 0, 0);
  const d    = new Date(dateStr + 'T00:00:00');
  const diff = Math.round((d - t) / 86400000);
  if (diff === 0) return { label: 'HOY',     cls: 'badge-hoy' };
  if (diff === 1) return { label: 'MAÑANA',  cls: 'badge-manana' };
  if (diff <= 7)  return { label: `en ${diff} días`, cls: 'badge-pronto' };
  return null;
}

/* ── AUTH ────────────────────────────────────────── */
function getMyUserId() {
  const token = localStorage.getItem('app_client_token');
  if (!token) return null;
  try {
    return JSON.parse(atob(token.split('.')[1])).sub;
  } catch {
    return null;
  }
}

/* ── INIT: poblar UI desde CONFIG ────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // Título de la página
  document.title = `${APP_NAME} · Reservas`;

  // Nombre del negocio en la navbar
  const appNameEl = document.getElementById('app-name-display');
  if (appNameEl) appNameEl.textContent = APP_NAME;

  // Botón de Maps
  const mapsBtn  = document.getElementById('maps-btn');
  const mapsAddr = document.getElementById('maps-address');
  if (mapsBtn)  mapsBtn.href = APP_MAPS_URL;
  if (mapsAddr) mapsAddr.textContent = APP_ADDRESS.split(',')[0];

  // Sport cards
  Object.entries(SPORTS).forEach(([key, s]) => {
    const iconEl = document.getElementById(`sport-icon-${key}`);
    const nameEl = document.getElementById(`sport-name-${key}`);
    const metaEl = document.getElementById(`sport-meta-${key}`);
    if (iconEl) iconEl.textContent = s.icon;
    if (nameEl) nameEl.textContent = s.name;
    if (metaEl) metaEl.textContent = s.tag;
  });

  // Service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js');
  }
});
