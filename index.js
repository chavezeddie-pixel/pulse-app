require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const methodOverride = require('method-override');
const db = require('./database');
const asyncStorage = db.getAsyncStorage();

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PIN = process.env.ADMIN_PIN || '1234';
const DEMO_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

app.set('view engine', 'ejs'); app.set('view cache', false);
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));

/* ═══════════════════════════════════════════════════
   SESSION SYSTEM (cookie-based, no npm dependency)
   ═══════════════════════════════════════════════════ */
const sessions = new Map();

function getSession(req) {
  const sid = parseCookie(req.headers.cookie || '', 'lt_sid');
  if (sid && sessions.has(sid)) return { sid, data: sessions.get(sid) };
  return null;
}

function createSession(res, data) {
  const sid = crypto.randomBytes(16).toString('hex');
  sessions.set(sid, { ...data, createdAt: Date.now() });
  res.cookie('lt_sid', sid, { httpOnly: true, maxAge: DEMO_MAX_AGE, sameSite: 'lax', path: '/' });
  return sid;
}

function destroySession(req, res) {
  const sid = parseCookie(req.headers.cookie || '', 'lt_sid');
  if (sid) sessions.delete(sid);
  res.clearCookie('lt_sid', { path: '/' });
}

function parseCookie(cookieStr, name) {
  const match = cookieStr.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

// Cookie parser middleware (simple)
app.use((req, res, next) => {
  // Add res.cookie if not present (Express 5 has it, but just in case)
  if (!res.cookie) {
    res.cookie = function(name, val, opts) {
      const parts = [name + '=' + encodeURIComponent(val)];
      if (opts.httpOnly) parts.push('HttpOnly');
      if (opts.maxAge) parts.push('Max-Age=' + Math.floor(opts.maxAge / 1000));
      if (opts.sameSite) parts.push('SameSite=' + opts.sameSite);
      if (opts.path) parts.push('Path=' + opts.path);
      this.append('Set-Cookie', parts.join('; '));
      return this;
    };
  }
  if (!res.clearCookie) {
    res.clearCookie = function(name, opts) {
      return this.cookie(name, '', { ...opts, maxAge: 0 });
    };
  }
  next();
});

/* ═══════════════════════════════════════════════════
   ASYNC LOCAL STORAGE MIDDLEWARE
   Wraps every request to set the correct DB path
   ═══════════════════════════════════════════════════ */
app.use((req, res, next) => {
  const session = getSession(req);

  // Determine DB path and rutina path based on session
  let store = {};

  if (session && session.data.type === 'admin') {
    // Owner — use default DB (no store override needed)
    store = { dbPath: null, rutinaPath: null, isDemo: false };
  } else if (session && session.data.type === 'demo') {
    const demoId = session.data.demoId;
    store = {
      dbPath: path.join(__dirname, 'data', `demo_${demoId}.db`),
      rutinaPath: path.join(__dirname, 'data', `rutina_${demoId}.json`),
      isDemo: true,
      demoId: demoId,
      demoName: session.data.nombre || 'Demo',
      onboardingDone: session.data.onboardingDone || false,
    };
  }

  // Store session info on req for routes to access
  req.sessionData = session ? session.data : null;
  req.isDemo = !!(session && session.data.type === 'demo');
  req.isAdmin = !!(session && session.data.type === 'admin');

  // Run the rest of the middleware chain inside AsyncLocalStorage
  asyncStorage.run(store, () => next());
});

/* ═══════════════════════════════════════════════════
   PASS DEMO/ADMIN STATE TO ALL VIEWS
   ═══════════════════════════════════════════════════ */
app.use((req, res, next) => {
  res.locals.isDemo = req.isDemo;
  res.locals.isAdmin = req.isAdmin;
  res.locals.demoName = req.sessionData?.nombre || '';
  res.locals.hasSession = !!(req.sessionData);
  res.locals.clauchNew = !!(req.sessionData?.clauchNew);
  next();
});

/* ═══════════════════════════════════════════════════
   AUTH GUARD — protect all app routes for non-sessions
   (except /demo, /admin, /static assets)
   ═══════════════════════════════════════════════════ */
app.use((req, res, next) => {
  const publicPaths = ['/demo', '/admin', '/admin/login', '/css/', '/js/', '/favicon', '/api/clauch', '/dashboard-ready', '/dashboard-skip'];
  const isPublic = publicPaths.some(p => req.path.startsWith(p));
  if (isPublic) return next();

  // If no session at all → redirect to demo landing
  if (!req.sessionData) return res.redirect('/demo');

  // If demo user hasn't completed onboarding → redirect (except onboarding routes)
  if (req.isDemo && !req.sessionData.onboardingDone && !req.path.startsWith('/demo')) {
    return res.redirect('/demo/onboarding');
  }

  next();
});

/* ═══════════════════════════════════════════════════
   ESTADO OBLIGATORIO — 3x daily forced check-in
   Blocks entire app until completed
   ═══════════════════════════════════════════════════ */

// Route to save estado (must be BEFORE the blocker middleware)
app.post('/estado-obligatorio', (req, res) => {
  if (!req.sessionData) return res.redirect('/demo');
  const today = db.todayStr();
  const periodo = req.body.periodo;
  if (!periodo) return res.redirect('/');

  const modoExtendido = req.body.modo_extendido === '1' ? 1 : 0;

  const indices = db.saveEstadoObligatorio(today, periodo, {
    estado_general: parseInt(req.body.estado_general) || 3,
    energia: parseInt(req.body.energia) || 3,
    estres: parseInt(req.body.estres) || 3,
    enfoque: parseInt(req.body.enfoque) || 3,
    emocion: (req.body.emocion || '').trim(),
    contexto: (req.body.contexto || '').trim(),
    sueno: parseInt(req.body.sueno) || 0,
    evaluacion_dia: parseInt(req.body.evaluacion_dia) || 0,
    nota: (req.body.nota || '').trim(),
    modo_extendido: modoExtendido,
    motivacion: parseInt(req.body.motivacion) || 0,
    productividad: parseInt(req.body.productividad) || 0,
    claridad_mental: parseInt(req.body.claridad_mental) || 0,
    actividad_fisica: req.body.actividad_fisica === '1' ? 1 : 0,
    alimentacion: parseInt(req.body.alimentacion) || 0,
    social: parseInt(req.body.social) || 0,
    rumiacion: parseInt(req.body.rumiacion) || 0,
    conexion_social: parseInt(req.body.conexion_social) || 0,
    preocupacion: (req.body.preocupacion || '').trim(),
    mejor_momento: (req.body.mejor_momento || '').trim(),
    meta_mejora: (req.body.meta_mejora || '').trim(),
  });

  if (req.headers['x-requested-with'] === 'XMLHttpRequest') return res.json({ ok: true, indices });
  res.redirect('/');
});

// API to check if estado is pending (for JS polling)
app.get('/estado-obligatorio/check', (req, res) => {
  if (!req.sessionData) return res.json({ pending: false });
  const today = db.todayStr();
  const pendiente = db.getEstadoPendiente(today);
  res.json({
    pending: !!pendiente,
    periodo: pendiente ? pendiente.key : null,
    label: pendiente ? pendiente.label : null,
  });
});

// BLOCKER MIDDLEWARE — force full-screen check-in
app.use((req, res, next) => {
  // Skip for public paths, static assets, and the estado route itself
  const skipPaths = ['/demo', '/admin', '/css/', '/js/', '/favicon', '/estado-obligatorio', '/api/clauch', '/dashboard-ready', '/dashboard-skip'];
  if (skipPaths.some(p => req.path.startsWith(p))) return next();
  if (!req.sessionData) return next();

  // Skip blocker for brand-new demo users — Clauch will handle their first estado via chat
  if (req.isDemo && req.sessionData.clauchNew) {
    return next();
  }

  const today = db.todayStr();
  const pendiente = db.getEstadoPendiente(today);

  if (pendiente) {
    // BLOCK — render full-screen forced check-in
    const completados = db.getEstadoCompletados(today);
    return res.render('estado-obligatorio', {
      page: 'estado',
      periodo: pendiente,
      periodos: db.ESTADO_PERIODOS,
      completados: completados.map(c => c.periodo),
      today,
    });
  }

  next();
});

/* ═══════════════════════════════════════════════════
   DEMO ROUTES
   ═══════════════════════════════════════════════════ */

// Landing page
app.get('/demo', (req, res) => {
  // If already has admin session, go to dashboard
  if (req.isAdmin) return res.redirect('/');
  // If already has demo session, go to app
  if (req.isDemo && req.sessionData.onboardingDone) return res.redirect('/');
  if (req.isDemo && !req.sessionData.onboardingDone) return res.redirect('/demo/onboarding');

  res.render('demo-landing', { page: 'demo' });
});

// Start demo — create session → straight to app, Clauch does the rest
app.post('/demo/start', (req, res) => {
  const demoId = crypto.randomBytes(8).toString('hex');
  const nombre = (req.body.nombre || '').trim();
  createSession(res, {
    type: 'demo',
    demoId: demoId,
    nombre: nombre,
    onboardingDone: true,   // Skip onboarding — Clauch handles everything
    clauchNew: true,        // Flag for Clauch to auto-open
    createdAt: Date.now(),
  });
  // Save nombre to perfil right away so Clauch can greet
  setTimeout(() => {
    try {
      const store = {
        dbPath: path.join(__dirname, 'data', `demo_${demoId}.db`),
        rutinaPath: path.join(__dirname, 'data', `rutina_${demoId}.json`),
      };
      asyncStorage.run(store, () => {
        if (nombre) {
          const defaults = {
            nombre, edad:'',genero:'',ocupacion:'',objetivos:'',areas_mejorar:'',
            situacion_familiar:'',hijos:'',pareja:'',horas_trabajo:'',
            energia_general:'',alimentacion:'',sueno:'',salud_fisica:'',
            consumos:'',deporte_actual:'',ansiedad_general:'',animo_general:'',
            estres_general:'',irritabilidad:'',calidad_relaciones:'',soledad:'',
            apoyo_social:'',satisfaccion_laboral:'',burnout:'',proposito:'',
            nivel_disciplina:'',cronotipo:'',situacion_economica:'',ahorra:'',
            obstaculos:'',vicios:'',area_fallo:'',habito_deseado:'',tiempo_disponible:'',
          };
          db.upsertPerfil(defaults);
        }
      });
    } catch(e) {}
  }, 100);
  res.redirect('/');
});

// Onboarding wizard
app.get('/demo/onboarding', (req, res) => {
  if (!req.isDemo) return res.redirect('/demo');
  const step = parseInt(req.query.step) || 1;
  res.render('demo-onboarding', { page: 'onboarding', step, nombre: req.sessionData.nombre });
});

// Complete onboarding
app.post('/demo/onboarding/complete', (req, res) => {
  const session = getSession(req);
  if (!session) return res.redirect('/demo');

  // Update session
  session.data.onboardingDone = true;
  sessions.set(session.sid, session.data);

  // If profile data was submitted, save it
  if (req.body.nombre) {
    try {
      db.upsertPerfil({
        nombre: req.body.nombre,
        edad: req.body.edad || null,
        genero: req.body.genero || null,
        ocupacion: req.body.ocupacion || '',
        objetivos: req.body.objetivos || '',
        areas_mejorar: req.body.areas_mejorar || '',
        // Defaults for everything else
        situacion_familiar: '', hijos: '', pareja: '',
        horas_trabajo: '', energia_general: '', alimentacion: '', sueno: '',
        salud_fisica: '', consumos: '', deporte_actual: '',
        ansiedad_general: '', animo_general: '', estres_general: '', irritabilidad: '',
        calidad_relaciones: '', soledad: '', apoyo_social: '',
        satisfaccion_laboral: '', burnout: '', proposito: '',
        nivel_disciplina: '', cronotipo: '',
        situacion_economica: '', ahorra: '',
        obstaculos: '', vicios: '', area_fallo: '', habito_deseado: '', tiempo_disponible: '',
      });
    } catch(e) { console.error('Demo perfil save error:', e.message); }
  }

  // If starter habits were selected, create them
  const starterHabits = req.body.habits;
  if (starterHabits) {
    const habitsList = Array.isArray(starterHabits) ? starterHabits : [starterHabits];
    const HABIT_AREAS = {
      'Dormir 7+ horas': 'salud', 'Ejercicio 30min': 'salud', 'Meditar 10min': 'bienestar',
      'Leer 20min': 'desarrollo', 'Estudiar 1h': 'desarrollo', 'Agua 2L': 'salud',
      'Sin redes 2h': 'bienestar', 'Comer saludable': 'salud', 'Caminar 30min': 'salud',
      'Journaling': 'bienestar',
    };
    habitsList.forEach(h => {
      try { db.createHabit(h, HABIT_AREAS[h] || 'general'); } catch(e) {}
    });
  }

  res.redirect('/');
});

// Exit demo
app.get('/demo/exit', (req, res) => {
  // Optionally clean up demo DB
  if (req.isDemo && req.sessionData.demoId) {
    const demoId = req.sessionData.demoId;
    setTimeout(() => {
      try { fs.unlinkSync(path.join(__dirname, 'data', `demo_${demoId}.db`)); } catch(e) {}
      try { fs.unlinkSync(path.join(__dirname, 'data', `demo_${demoId}.db-wal`)); } catch(e) {}
      try { fs.unlinkSync(path.join(__dirname, 'data', `demo_${demoId}.db-shm`)); } catch(e) {}
      try { fs.unlinkSync(path.join(__dirname, 'data', `rutina_${demoId}.json`)); } catch(e) {}
    }, 1000);
  }
  destroySession(req, res);
  res.redirect('/demo');
});

/* ═══════════════════════════════════════════════════
   ADMIN ROUTES (owner access)
   ═══════════════════════════════════════════════════ */
app.get('/admin', (req, res) => {
  if (req.isAdmin) return res.redirect('/');
  res.render('admin-login', { page: 'admin', error: null });
});

app.post('/admin/login', (req, res) => {
  const pin = (req.body.pin || '').trim();
  if (pin === ADMIN_PIN) {
    // Remove old session from memory (if any) without setting clear-cookie
    const oldSid = parseCookie(req.headers.cookie || '', 'lt_sid');
    if (oldSid) sessions.delete(oldSid);
    // Create new admin session (single Set-Cookie header)
    createSession(res, { type: 'admin', createdAt: Date.now() });
    return res.redirect('/');
  }
  res.render('admin-login', { page: 'admin', error: 'PIN incorrecto' });
});

app.get('/admin/logout', (req, res) => {
  destroySession(req, res);
  res.redirect('/demo');
});

// Admin panel — see all demo users and their activity
app.get('/admin/panel', (req, res) => {
  if (!req.isAdmin) return res.redirect('/admin');

  const Database = require('better-sqlite3');
  const demoUsers = [];

  // Iterate all sessions to find demo users
  sessions.forEach((data, sid) => {
    if (data.type !== 'demo') return;
    const demoId = data.demoId;
    const dbPath = path.join(__dirname, 'data', `demo_${demoId}.db`);
    const rutinaPath = path.join(__dirname, 'data', `rutina_${demoId}.json`);

    let stats = { habits: 0, checkins: 0, notas: 0, reflexiones: 0, rutinaBloques: 0, objetivos: 0 };
    let perfil = null;
    let lastCheckin = null;

    try {
      if (fs.existsSync(dbPath)) {
        const demoDb = new Database(dbPath, { readonly: true });
        stats.habits = demoDb.prepare('SELECT COUNT(*) as c FROM habits WHERE active=1').get().c;
        stats.checkins = demoDb.prepare('SELECT COUNT(*) as c FROM daily_checkins').get().c;
        stats.notas = demoDb.prepare('SELECT COUNT(*) as c FROM notas').get().c;
        stats.reflexiones = demoDb.prepare('SELECT COUNT(*) as c FROM reflexiones').get().c;
        stats.objetivos = demoDb.prepare('SELECT COUNT(*) as c FROM weekly_objectives').get().c;
        lastCheckin = demoDb.prepare('SELECT * FROM daily_checkins ORDER BY date DESC LIMIT 1').get();
        perfil = demoDb.prepare('SELECT nombre, edad, genero, ocupacion FROM perfil WHERE id=1').get();
        demoDb.close();
      }
    } catch(e) { /* DB might not exist yet */ }

    // Count rutina blocks
    try {
      if (fs.existsSync(rutinaPath)) {
        const rutina = JSON.parse(fs.readFileSync(rutinaPath, 'utf8'));
        stats.rutinaBloques = Object.values(rutina).reduce((sum, day) => sum + (Array.isArray(day) ? day.length : 0), 0);
      }
    } catch(e) {}

    const ageMinutes = Math.round((Date.now() - data.createdAt) / 60000);
    const ageStr = ageMinutes < 60
      ? ageMinutes + ' min'
      : Math.round(ageMinutes / 60) + 'h ' + (ageMinutes % 60) + 'm';

    demoUsers.push({
      sid: sid.slice(0, 8) + '...',
      demoId: demoId.slice(0, 8),
      nombre: data.nombre,
      onboardingDone: data.onboardingDone,
      createdAt: new Date(data.createdAt).toLocaleString('es-CL'),
      age: ageStr,
      stats,
      perfil,
      lastCheckin,
    });
  });

  // Sort by creation (newest first)
  demoUsers.sort((a, b) => b.createdAt > a.createdAt ? 1 : -1);

  // DB files on disk (may have sessions that expired from memory)
  let diskDemos = [];
  try {
    diskDemos = fs.readdirSync(path.join(__dirname, 'data'))
      .filter(f => f.startsWith('demo_') && f.endsWith('.db'))
      .map(f => {
        const stat = fs.statSync(path.join(__dirname, 'data', f));
        const id = f.replace('demo_', '').replace('.db', '');
        const hasSession = [...sessions.values()].some(s => s.demoId === id);
        return {
          file: f,
          demoId: id.slice(0, 8),
          size: (stat.size / 1024).toFixed(1) + ' KB',
          modified: stat.mtime.toLocaleString('es-CL'),
          hasActiveSession: hasSession,
        };
      });
  } catch(e) {}

  res.render('admin-panel', {
    page: 'admin-panel',
    demoUsers,
    diskDemos,
    totalSessions: sessions.size,
    totalDemos: demoUsers.length,
  });
});

// Admin: delete a specific demo DB
app.post('/admin/panel/delete-demo', (req, res) => {
  if (!req.isAdmin) return res.redirect('/admin');
  const demoId = req.body.demoId;
  if (!demoId || demoId.includes('..') || demoId.includes('/')) return res.redirect('/admin/panel');

  // Remove session
  sessions.forEach((data, sid) => {
    if (data.demoId && data.demoId.startsWith(demoId)) sessions.delete(sid);
  });

  // Remove files
  const dataDir = path.join(__dirname, 'data');
  const files = fs.readdirSync(dataDir).filter(f => f.includes(demoId));
  files.forEach(f => { try { fs.unlinkSync(path.join(dataDir, f)); } catch(e) {} });

  if (req.headers['x-requested-with'] === 'XMLHttpRequest') return res.json({ ok: true });
  res.redirect('/admin/panel');
});

// Admin: delete ALL demo data
app.post('/admin/panel/purge-all', (req, res) => {
  if (!req.isAdmin) return res.redirect('/admin');

  // Remove all demo sessions
  sessions.forEach((data, sid) => {
    if (data.type === 'demo') sessions.delete(sid);
  });

  // Remove all demo files
  const dataDir = path.join(__dirname, 'data');
  try {
    fs.readdirSync(dataDir)
      .filter(f => f.startsWith('demo_') || f.startsWith('rutina_'))
      .forEach(f => { try { fs.unlinkSync(path.join(dataDir, f)); } catch(e) {} });
  } catch(e) {}

  if (req.headers['x-requested-with'] === 'XMLHttpRequest') return res.json({ ok: true });
  res.redirect('/admin/panel');
});

/* ═══════════════════════════════════════════════════
   APP ROUTES (protected by auth guard above)
   ═══════════════════════════════════════════════════ */
// Pulse experience → dashboard transition
app.get('/dashboard-ready', (req, res) => {
  if (!req.sessionData) return res.redirect('/demo');
  // Clear clauchNew flag — user completed the Pulse experience
  const session = getSession(req);
  if (session && session.data.clauchNew) {
    session.data.clauchNew = false;
    sessions.set(session.sid, session.data);
  }
  res.redirect('/');
});

app.get('/dashboard-skip', (req, res) => {
  if (!req.sessionData) return res.redirect('/demo');
  const session = getSession(req);
  if (session && session.data.clauchNew) {
    session.data.clauchNew = false;
    sessions.set(session.sid, session.data);
  }
  res.redirect('/');
});

app.get('/', (req, res) => {
  // New demo users → Pulse conversational experience
  if (req.isDemo && req.sessionData && req.sessionData.clauchNew) {
    return res.render('pulse-chat', {
      page: 'pulse',
      nombre: req.sessionData.nombre || '',
    });
  }

  try {
    const data = db.getDashboardData();
    res.render('dashboard', { ...data, page: 'dashboard' });
  } catch(err) {
    console.error(err);
    res.status(500).send('<pre>' + err.message + '</pre>');
  }
});

app.use('/checkin', require('./routes/checkin'));
app.use('/habits', require('./routes/habits'));
app.use('/objectives', require('./routes/objectives'));
app.use('/reports', require('./routes/reports'));
app.use('/notas', require('./routes/notas'));
app.use('/coach', require('./routes/coach'));
app.use('/mejora', require('./routes/mejora'));
app.use('/reflexion', require('./routes/reflexion'));
app.use('/perfil', require('./routes/perfil'));
app.use('/malos', require('./routes/malos'));
app.use('/agenda', require('./routes/agenda'));
app.use('/rutina', require('./routes/rutina'));
// Pass session helpers to clauch routes
app.use('/api/clauch', (req, res, next) => {
  req._clearClauchNew = function() {
    const session = getSession(req);
    if (session && session.data.clauchNew) {
      session.data.clauchNew = false;
      sessions.set(session.sid, session.data);
    }
  };
  next();
}, require('./routes/clauch'));

app.get('/api/calendario', (req, res) => {
  const mes = parseInt(req.query.mes) || new Date().getMonth()+1;
  const anio = parseInt(req.query.anio) || new Date().getFullYear();
  const start = anio+'-'+String(mes).padStart(2,'0')+'-01';
  const end = anio+'-'+String(mes).padStart(2,'0')+'-31';
  const checkins = db.getCheckinsRange(start, end);
  const habits = db.getAllHabits();
  const hc = {};
  habits.forEach(h => {
    db.getHabitCompletionDates(h.id).forEach(d => {
      if(!hc[d]) hc[d] = [];
      hc[d].push(h.id);
    });
  });
  hc._total = habits.length;
  res.json({ checkins, habitCompletions: hc });
});

/* ═══════════════════════════════════════════════════
   CLEANUP — remove old demo DBs on startup
   ═══════════════════════════════════════════════════ */
function cleanupDemos() {
  const dataDir = path.join(__dirname, 'data');
  try {
    const files = fs.readdirSync(dataDir);
    files.forEach(f => {
      if (f.startsWith('demo_') && f.endsWith('.db')) {
        const fullPath = path.join(dataDir, f);
        const stat = fs.statSync(fullPath);
        if (Date.now() - stat.mtimeMs > DEMO_MAX_AGE) {
          try { fs.unlinkSync(fullPath); } catch(e) {}
          try { fs.unlinkSync(fullPath + '-wal'); } catch(e) {}
          try { fs.unlinkSync(fullPath + '-shm'); } catch(e) {}
          // Also try to remove the rutina file
          const demoId = f.replace('demo_', '').replace('.db', '');
          try { fs.unlinkSync(path.join(dataDir, `rutina_${demoId}.json`)); } catch(e) {}
        }
      }
    });
  } catch(e) { console.error('Cleanup error:', e.message); }
}

cleanupDemos();
// Run cleanup every 6 hours
setInterval(cleanupDemos, 6 * 60 * 60 * 1000);

app.listen(PORT, () => {
  console.log('App corriendo en http://localhost:' + PORT);
  console.log('PIN de admin: ' + ADMIN_PIN);
  console.log('Demo: http://localhost:' + PORT + '/demo');
});
