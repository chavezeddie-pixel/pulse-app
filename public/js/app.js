/* ═══════════════════════════════════════════════════
   PULSE — Global App JS
   ═══════════════════════════════════════════════════ */

// ── MODAL ─────────────────────────────────────────
function toggleModal(id) {
  const overlay = document.getElementById(id);
  if (!overlay) return;
  const opening = !overlay.classList.contains('open');
  overlay.classList.toggle('open', opening);
  document.body.style.overflow = opening ? 'hidden' : '';
  if (opening) {
    const first = overlay.querySelector('input:not([type=hidden]),textarea,select');
    if (first) setTimeout(() => first.focus(), 80);
  }
}

function closeOnOverlay(event, id) {
  if (event.target.id === id) toggleModal(id);
}

function toggleCard(checkbox, cardId) {
  const card = document.getElementById(cardId);
  if (!card) return;
  checkbox.checked ? card.classList.add('checked') : card.classList.remove('checked');
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(m => {
      m.classList.remove('open');
    });
    document.body.style.overflow = '';
  }
});

// ── KEYBOARD NAV (Alt+1–9) ─────────────────────
(function() {
  const NAV_MAP = {
    '1': '/', '2': '/checkin', '3': '/perfil',
    '4': '/rutina',
    '5': '/habits', '6': '/malos',
    '7': '/reflexion', '8': '/notas', '9': '/coach',
    '0': '/reflexion/metricas',
  };
  document.addEventListener('keydown', (e) => {
    // Alt+key, but not inside text inputs/textareas
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    const tag = document.activeElement?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    const url = NAV_MAP[e.key];
    if (url && url !== window.location.pathname) {
      e.preventDefault();
      window.location.href = url;
    }
  });
})();

// ── TOAST ─────────────────────────────────────────
(function() {
  const STYLES = {
    success: { icon: '✓', bg: 'var(--green)',  text: '#000' },
    error:   { icon: '✕', bg: 'var(--red)',    text: '#fff' },
    warning: { icon: '⚠', bg: 'var(--accent)', text: '#000' },
    info:    { icon: 'ℹ', bg: 'var(--indigo)', text: '#fff' },
  };

  let container;

  function getContainer() {
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.style.cssText = [
        'position:fixed', 'bottom:1.5rem', 'right:1.5rem',
        'z-index:9999', 'display:flex', 'flex-direction:column',
        'gap:.45rem', 'pointer-events:none',
      ].join(';');
      document.body.appendChild(container);
    }
    return container;
  }

  window.showToast = function(msg, type = 'success', duration = 2800) {
    const s = STYLES[type] || STYLES.info;
    const toast = document.createElement('div');
    toast.style.cssText = [
      'display:flex', 'align-items:center', 'gap:.55rem',
      'padding:.55rem .9rem',
      'border-radius:10px',
      'font-size:.82rem', 'font-weight:600',
      'font-family:var(--font-body)',
      'background:' + s.bg,
      'color:' + s.text,
      'box-shadow:0 4px 20px rgba(0,0,0,.35)',
      'pointer-events:auto',
      'cursor:pointer',
      'transform:translateX(120%)',
      'transition:transform .28s cubic-bezier(.34,1.56,.64,1), opacity .2s',
      'opacity:0',
      'max-width:320px',
      'line-height:1.35',
    ].join(';');

    const icon = document.createElement('span');
    icon.style.cssText = 'font-size:.9rem;flex-shrink:0';
    icon.textContent = s.icon;

    const text = document.createElement('span');
    text.textContent = msg;

    toast.appendChild(icon);
    toast.appendChild(text);
    toast.addEventListener('click', () => dismiss(toast));
    getContainer().appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        toast.style.transform = 'translateX(0)';
        toast.style.opacity = '1';
      });
    });

    const timer = setTimeout(() => dismiss(toast), duration);
    toast._timer = timer;

    function dismiss(el) {
      clearTimeout(el._timer);
      el.style.transform = 'translateX(120%)';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 280);
    }

    return toast;
  };
})();

// ── TOP PROGRESS BAR ──────────────────────────────
(function() {
  let bar, timer, visible = false;

  function getBar() {
    if (!bar) {
      bar = document.createElement('div');
      bar.style.cssText = [
        'position:fixed', 'top:0', 'left:0',
        'height:2.5px', 'width:0%',
        'background:var(--accent)',
        'z-index:10000',
        'transition:width .35s ease, opacity .3s ease',
        'border-radius:0 2px 2px 0',
        'box-shadow:0 0 8px rgba(245,158,11,.6)',
        'pointer-events:none',
      ].join(';');
      document.body.appendChild(bar);
    }
    return bar;
  }

  window.progressStart = function() {
    clearTimeout(timer);
    const b = getBar();
    b.style.opacity = '1';
    b.style.width = '0%';
    visible = true;
    // Simulate progress
    let w = 0;
    function step() {
      if (!visible) return;
      w = w < 70 ? w + (Math.random() * 12) : w + (Math.random() * 2);
      if (w > 90) w = 90;
      b.style.width = w + '%';
      timer = setTimeout(step, 200 + Math.random() * 200);
    }
    setTimeout(step, 50);
  };

  window.progressDone = function() {
    clearTimeout(timer);
    visible = false;
    const b = getBar();
    b.style.width = '100%';
    setTimeout(() => {
      b.style.opacity = '0';
      setTimeout(() => { b.style.width = '0%'; }, 300);
    }, 200);
  };
})();

// ── MOBILE BOTTOM NAV ─────────────────────────────
(function() {
  const currentPage = document.body.getAttribute('data-page') || '';
  const path = window.location.pathname;

  // Nav items (shown in bottom bar — most used 4 + "More")
  const PRIMARY = [
    { href:'/',          label:'Inicio',    page:'dashboard',
      icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>' },
    { href:'/habits',    label:'Hábitos',   page:'habits',
      icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>' },
    { href:'/agenda',    label:'Agenda',    page:'agenda',
      icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' },
    { href:'/coach',     label:'Coach',     page:'coach',
      icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' },
  ];

  // Secondary items in "More" panel
  const SECONDARY = [
    { href:'/checkin',           label:'Check-in',    page:'checkin',
      icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 12l2 2 4-4"/><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/></svg>' },
    { href:'/reflexion',         label:'Reflexión',   page:'reflexion',
      icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' },
    { href:'/notas',             label:'Cuaderno',    page:'notas',
      icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' },
    { href:'/malos',             label:'Malos H.',    page:'malos',
      icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>' },
    { href:'/rutina',            label:'Rutina',      page:'rutina',
      icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' },
    { href:'/objectives',        label:'Objetivos',   page:'objectives',
      icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>' },
    { href:'/reflexion/metricas',label:'Métricas',    page:'reflexion-metricas',
      icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>' },
    { href:'/perfil',            label:'Perfil',      page:'perfil',
      icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' },
  ];

  // Check if current page is in primary nav
  const primaryPages = PRIMARY.map(function(i) { return i.page; });
  const isInPrimary = primaryPages.includes(currentPage);

  // Build nav HTML
  const nav = document.createElement('nav');
  nav.className = 'mobile-bottom-nav';

  const items = document.createElement('div');
  items.className = 'mbn-items';

  PRIMARY.forEach(function(item) {
    const a = document.createElement('a');
    a.href      = item.href;
    a.className = 'mbn-item' + (currentPage === item.page ? ' active' : '');
    a.innerHTML = item.icon + '<span>' + item.label + '</span>';
    items.appendChild(a);
  });

  // "More" button
  const more = document.createElement('button');
  more.className = 'mbn-item' + (!isInPrimary && currentPage ? ' active' : '');
  more.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg><span>Más</span>';
  items.appendChild(more);
  nav.appendChild(items);

  // More panel overlay
  const overlay = document.createElement('div');
  overlay.className = 'mbn-more-overlay';

  // More panel
  const panel = document.createElement('div');
  panel.className = 'mbn-more-panel';
  panel.innerHTML = '<div class="mbn-more-title">Todas las secciones</div>';

  const grid = document.createElement('div');
  grid.className = 'mbn-more-grid';
  SECONDARY.forEach(function(item) {
    const a = document.createElement('a');
    a.href      = item.href;
    a.className = 'mbn-more-item' + (currentPage === item.page ? ' active' : '');
    a.innerHTML = item.icon + '<span>' + item.label + '</span>';
    grid.appendChild(a);
  });
  panel.appendChild(grid);

  document.body.appendChild(overlay);
  document.body.appendChild(panel);
  document.body.appendChild(nav);

  function openMore() {
    panel.classList.add('open');
    overlay.classList.add('open');
  }
  function closeMore() {
    panel.classList.remove('open');
    overlay.classList.remove('open');
  }

  more.addEventListener('click', openMore);
  overlay.addEventListener('click', closeMore);
})();

// ── FETCH WRAPPER ─────────────────────────────────
// Usage: apiFetch('/url', {method:'POST', body:{...}})
//        .then(data => ...) — auto shows toast on error
window.apiFetch = function(url, opts = {}) {
  progressStart();
  const headers = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    ...(opts.headers || {}),
  };
  const body = opts.body && typeof opts.body === 'object'
    ? JSON.stringify(opts.body)
    : opts.body;

  return fetch(url, { ...opts, headers, body })
    .then(r => {
      progressDone();
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json().catch(() => ({}));
    })
    .catch(err => {
      progressDone();
      showToast('Error de conexión', 'error');
      throw err;
    });
};

// ── SIDEBAR DATE ──────────────────────────────────
(function() {
  const el = document.getElementById('sidebarDate');
  if (!el) return;
  const days   = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  const d = new Date();
  el.textContent = days[d.getDay()] + ' ' + d.getDate() + ' ' + months[d.getMonth()];
})();

// ── THEME ─────────────────────────────────────────
// (also defined in header for no-flash, this ensures sync)
window.applyTheme = function(t) {
  document.body.classList.toggle('light', t === 'light');
  const btn = document.getElementById('themeToggle');
  if (btn) btn.textContent = t === 'light' ? '🌙' : '☀️';
  localStorage.setItem('lt-theme', t);
};

window.toggleTheme = function() {
  const cur = localStorage.getItem('lt-theme') || 'dark';
  applyTheme(cur === 'dark' ? 'light' : 'dark');
};

// Sync on load (in case header script ran before body)
(function() {
  const t = localStorage.getItem('lt-theme') || 'dark';
  applyTheme(t);
})();

// ── ESTADO OBLIGATORIO CHECKER ───────────────────
// Polls every 30s to check if a mandatory check-in is due
// If so, forces a full page reload which will be intercepted by the server middleware
(function() {
  // Don't run on the estado page itself or demo/admin pages
  if (window.location.pathname === '/estado-obligatorio') return;
  if (window.location.pathname.startsWith('/demo')) return;
  if (window.location.pathname.startsWith('/admin')) return;

  function checkEstado() {
    fetch('/estado-obligatorio/check', {
      headers: { 'X-Requested-With': 'XMLHttpRequest' }
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.pending) {
        // Force reload — server will show the blocker
        window.location.reload();
      }
    })
    .catch(function() {});
  }

  // Check every 30 seconds
  setInterval(checkEstado, 30000);

  // Also check when tab becomes visible again
  document.addEventListener('visibilitychange', function() {
    if (!document.hidden) checkEstado();
  });
})();
