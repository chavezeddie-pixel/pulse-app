const Database = require('better-sqlite3');
const path = require('path');
const { AsyncLocalStorage } = require('async_hooks');

/* ═══════════════════════════════════════════════════
   DATABASE MODULE — Multi-session support via AsyncLocalStorage
   ═══════════════════════════════════════════════════ */

const DB_PATH = path.join(__dirname, 'data', 'tracker.db');
const asyncStorage = new AsyncLocalStorage();
const connections = new Map();

// Expose asyncStorage for middleware use
function getAsyncStorage() { return asyncStorage; }

function getDB() {
  const store = asyncStorage.getStore();
  const dbPath = (store && store.dbPath) ? store.dbPath : DB_PATH;

  if (!connections.has(dbPath)) {
    const conn = new Database(dbPath);
    conn.pragma('journal_mode = WAL');
    initSchemaOn(conn);
    connections.set(dbPath, conn);
  }
  return connections.get(dbPath);
}

// Return the active DB path (used by routes that need direct access)
function getActiveDBPath() {
  const store = asyncStorage.getStore();
  return (store && store.dbPath) ? store.dbPath : DB_PATH;
}

// Return the active rutina JSON path
function getActiveRutinaPath() {
  const store = asyncStorage.getStore();
  return (store && store.rutinaPath)
    ? store.rutinaPath
    : path.join(__dirname, 'public', 'rutina.json');
}

// Check if current session is a demo
function isDemo() {
  const store = asyncStorage.getStore();
  return !!(store && store.isDemo);
}

function initSchemaOn(conn) {
  conn.exec(`
    CREATE TABLE IF NOT EXISTS daily_checkins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      energy INTEGER NOT NULL DEFAULT 5,
      mood INTEGER NOT NULL DEFAULT 5,
      clarity INTEGER NOT NULL DEFAULT 5,
      anxiety INTEGER NOT NULL DEFAULT 5,
      sleep_hours REAL NOT NULL DEFAULT 7,
      did_exercise INTEGER NOT NULL DEFAULT 0,
      did_study INTEGER NOT NULL DEFAULT 0,
      completed_main INTEGER NOT NULL DEFAULT 0,
      free_comment TEXT,
      did_well TEXT,
      improve_tomorrow TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS habits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      area TEXT NOT NULL DEFAULT 'general',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS habit_completions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      habit_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      UNIQUE(habit_id, date),
      FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS weekly_objectives (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      area TEXT NOT NULL DEFAULT 'general',
      priority TEXT NOT NULL DEFAULT 'media',
      deadline TEXT,
      status TEXT NOT NULL DEFAULT 'pendiente',
      progress INTEGER NOT NULL DEFAULT 0,
      week_start TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS monthly_objectives (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL DEFAULT 'personal',
      progress_indicator TEXT,
      percentage INTEGER NOT NULL DEFAULT 0,
      target_date TEXT,
      status TEXT NOT NULL DEFAULT 'pendiente',
      month_year TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS notas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT NOT NULL,
      titulo TEXT,
      contenido TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS reflexiones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT NOT NULL UNIQUE,
      energia_roba TEXT,
      energia_da TEXT,
      freno TEXT,
      familia INTEGER,
      logro TEXT,
      aprendizaje TEXT,
      diferente TEXT,
      satisfaccion INTEGER,
      claridad_cierre INTEGER,
      enfoque INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS perfil (
      id INTEGER PRIMARY KEY,
      nombre TEXT, edad INTEGER, genero TEXT,
      situacion_familiar TEXT, hijos TEXT, pareja TEXT,
      ocupacion TEXT, horas_trabajo TEXT,
      energia_general TEXT, alimentacion TEXT, sueno TEXT,
      salud_fisica TEXT, consumos TEXT, deporte_actual TEXT,
      ansiedad_general TEXT, animo_general TEXT, estres_general TEXT, irritabilidad TEXT,
      calidad_relaciones TEXT, soledad TEXT, apoyo_social TEXT,
      satisfaccion_laboral TEXT, burnout TEXT, proposito TEXT,
      nivel_disciplina TEXT, cronotipo TEXT,
      situacion_economica TEXT, ahorra TEXT,
      objetivos TEXT, areas_mejorar TEXT, obstaculos TEXT,
      vicios TEXT, area_fallo TEXT, habito_deseado TEXT, tiempo_disponible TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS malos_habitos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      categoria TEXT DEFAULT 'general',
      impacto INTEGER DEFAULT 5,
      active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS malos_habitos_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      malo_id INTEGER NOT NULL,
      fecha TEXT NOT NULL,
      veces INTEGER DEFAULT 1,
      UNIQUE(malo_id, fecha)
    );
    CREATE TABLE IF NOT EXISTS coach_analyses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT NOT NULL,
      mensaje TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS rutina_completions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT NOT NULL,
      bloque_key TEXT NOT NULL,
      UNIQUE(fecha, bloque_key)
    );
    CREATE TABLE IF NOT EXISTS objetivos_dia (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT NOT NULL,
      nombre TEXT NOT NULL,
      completado INTEGER DEFAULT 0,
      hora TEXT DEFAULT '',
      tipo TEXT DEFAULT 'dia',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      priority TEXT DEFAULT 'media',
      area TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS estado_obligatorio (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT NOT NULL,
      periodo TEXT NOT NULL,
      /* ── Modo corto (obligatorio) ── */
      estado_general INTEGER NOT NULL DEFAULT 3,
      energia INTEGER NOT NULL DEFAULT 3,
      estres INTEGER NOT NULL DEFAULT 3,
      enfoque INTEGER NOT NULL DEFAULT 3,
      emocion TEXT DEFAULT '',
      emocion_valencia TEXT DEFAULT '',
      emocion_arousal TEXT DEFAULT '',
      contexto TEXT DEFAULT '',
      sueno INTEGER DEFAULT 0,
      evaluacion_dia INTEGER DEFAULT 0,
      nota TEXT DEFAULT '',
      /* ── Modo extendido (opcional) ── */
      modo_extendido INTEGER DEFAULT 0,
      motivacion INTEGER DEFAULT 0,
      productividad INTEGER DEFAULT 0,
      claridad_mental INTEGER DEFAULT 0,
      actividad_fisica INTEGER DEFAULT 0,
      alimentacion INTEGER DEFAULT 0,
      social INTEGER DEFAULT 0,
      rumiacion INTEGER DEFAULT 0,
      conexion_social INTEGER DEFAULT 0,
      preocupacion TEXT DEFAULT '',
      mejor_momento TEXT DEFAULT '',
      meta_mejora TEXT DEFAULT '',
      /* ── Índices calculados ── */
      indice_bienestar INTEGER DEFAULT 0,
      indice_productividad INTEGER DEFAULT 0,
      indice_emocional INTEGER DEFAULT 0,
      indice_balance INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      UNIQUE(fecha, periodo)
    );
  `);
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function weekStartStr() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().split('T')[0];
}

function currentMonthYear() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getCheckin(date) {
  return getDB().prepare('SELECT * FROM daily_checkins WHERE date = ?').get(date);
}

function upsertCheckin(data) {
  const existing = getCheckin(data.date);
  if (existing) {
    getDB().prepare('UPDATE daily_checkins SET energy=?,mood=?,clarity=?,anxiety=?,sleep_hours=?,did_exercise=?,did_study=?,completed_main=?,free_comment=?,did_well=?,improve_tomorrow=? WHERE date=?')
    .run(data.energy,data.mood,data.clarity,data.anxiety,data.sleep_hours,data.did_exercise,data.did_study,data.completed_main,data.free_comment,data.did_well,data.improve_tomorrow,data.date);
  } else {
    getDB().prepare('INSERT INTO daily_checkins (date,energy,mood,clarity,anxiety,sleep_hours,did_exercise,did_study,completed_main,free_comment,did_well,improve_tomorrow) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(data.date,data.energy,data.mood,data.clarity,data.anxiety,data.sleep_hours,data.did_exercise,data.did_study,data.completed_main,data.free_comment,data.did_well,data.improve_tomorrow);
  }
}

function getCheckinsRange(startDate, endDate) {
  return getDB().prepare('SELECT * FROM daily_checkins WHERE date >= ? AND date <= ? ORDER BY date ASC').all(startDate, endDate);
}

function getAllHabits() {
  return getDB().prepare('SELECT * FROM habits WHERE active = 1 ORDER BY area, name').all();
}

function createHabit(name, area) {
  return getDB().prepare('INSERT INTO habits (name, area) VALUES (?, ?)').run(name, area);
}

function updateHabit(id, name, area) {
  return getDB().prepare('UPDATE habits SET name=?, area=? WHERE id=?').run(name, area, id);
}

function deleteHabit(id) {
  return getDB().prepare('UPDATE habits SET active=0 WHERE id=?').run(id);
}

function toggleHabitCompletion(habitId, date) {
  const exists = getDB().prepare('SELECT id FROM habit_completions WHERE habit_id=? AND date=?').get(habitId, date);
  if (exists) {
    getDB().prepare('DELETE FROM habit_completions WHERE habit_id=? AND date=?').run(habitId, date);
    return false;
  } else {
    getDB().prepare('INSERT OR IGNORE INTO habit_completions (habit_id, date) VALUES (?,?)').run(habitId, date);
    return true;
  }
}

function getCompletedHabitsForDate(date) {
  return getDB().prepare('SELECT habit_id FROM habit_completions WHERE date=?').all(date).map(r => r.habit_id);
}

function getHabitStreak(habitId) {
  const completions = getDB().prepare('SELECT date FROM habit_completions WHERE habit_id=? ORDER BY date DESC').all(habitId).map(r => r.date);
  if (!completions.length) return 0;
  let streak = 0;
  let checkDate = new Date();
  checkDate.setHours(0,0,0,0);
  for (const dateStr of completions) {
    const d = new Date(dateStr + 'T00:00:00');
    const diff = Math.round((checkDate - d) / (1000*60*60*24));
    if (diff === streak) { streak++; } else if (diff > streak + 1) { break; }
  }
  return streak;
}

function getHabitCompletionRate(habitId, days) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days + 1);
  const start = startDate.toISOString().split('T')[0];
  const count = getDB().prepare('SELECT COUNT(*) as cnt FROM habit_completions WHERE habit_id=? AND date>=?').get(habitId, start).cnt;
  return Math.round((count / days) * 100);
}

function getHabitCompletionDates(habitId) {
  return getDB().prepare('SELECT date FROM habit_completions WHERE habit_id=? ORDER BY date DESC LIMIT 60').all(habitId).map(r => r.date);
}

function getWeeklyObjectives(weekStart) {
  return getDB().prepare('SELECT * FROM weekly_objectives WHERE week_start=? ORDER BY priority DESC, area').all(weekStart);
}

function createWeeklyObjective(data) {
  return getDB().prepare('INSERT INTO weekly_objectives (name,area,priority,deadline,status,progress,week_start) VALUES (?,?,?,?,?,?,?)').run(data.name,data.area,data.priority,data.deadline,'pendiente',0,data.week_start);
}

function updateWeeklyObjectiveStatus(id, status, progress) {
  return getDB().prepare('UPDATE weekly_objectives SET status=?, progress=? WHERE id=?').run(status, progress, id);
}

function deleteWeeklyObjective(id) {
  return getDB().prepare('DELETE FROM weekly_objectives WHERE id=?').run(id);
}

function getMonthlyObjectives(monthYear) {
  return getDB().prepare('SELECT * FROM monthly_objectives WHERE month_year=? ORDER BY category, name').all(monthYear);
}

function createMonthlyObjective(data) {
  return getDB().prepare('INSERT INTO monthly_objectives (name,description,category,progress_indicator,percentage,target_date,status,month_year) VALUES (?,?,?,?,?,?,?,?)').run(data.name,data.description,data.category,data.progress_indicator,0,data.target_date,'pendiente',data.month_year);
}

function updateMonthlyObjective(id, data) {
  return getDB().prepare('UPDATE monthly_objectives SET percentage=?, status=? WHERE id=?').run(data.percentage, data.status, id);
}

function deleteMonthlyObjective(id) {
  return getDB().prepare('DELETE FROM monthly_objectives WHERE id=?').run(id);
}

function getAllNotas() {
  return getDB().prepare('SELECT * FROM notas ORDER BY fecha DESC, id DESC').all();
}

function createNota(fecha, titulo, contenido) {
  return getDB().prepare('INSERT INTO notas (fecha, titulo, contenido) VALUES (?,?,?)').run(fecha, titulo, contenido);
}

function deleteNota(id) {
  return getDB().prepare('DELETE FROM notas WHERE id=?').run(id);
}

function getReflexion(fecha) {
  return getDB().prepare('SELECT * FROM reflexiones WHERE fecha = ?').get(fecha);
}

function upsertReflexion(data) {
  const existing = getReflexion(data.fecha);
  if (existing) {
    getDB().prepare('UPDATE reflexiones SET energia_roba=?,energia_da=?,freno=?,familia=?,logro=?,aprendizaje=?,diferente=?,satisfaccion=?,claridad_cierre=?,enfoque=? WHERE fecha=?')
    .run(data.energia_roba,data.energia_da,data.freno,data.familia,data.logro,data.aprendizaje,data.diferente,data.satisfaccion,data.claridad_cierre,data.enfoque,data.fecha);
  } else {
    getDB().prepare('INSERT INTO reflexiones (fecha,energia_roba,energia_da,freno,familia,logro,aprendizaje,diferente,satisfaccion,claridad_cierre,enfoque) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(data.fecha,data.energia_roba,data.energia_da,data.freno,data.familia,data.logro,data.aprendizaje,data.diferente,data.satisfaccion,data.claridad_cierre,data.enfoque);
  }
}

function getReflexionesRange(startDate, endDate) {
  return getDB().prepare('SELECT * FROM reflexiones WHERE fecha >= ? AND fecha <= ? ORDER BY fecha DESC').all(startDate, endDate);
}

function getPerfil() {
  const row = getDB().prepare('SELECT * FROM perfil WHERE id = 1').get();
  if (!row) return null;
  const parsed = { ...row };
  ['situacion_familiar','ocupacion','energia_general','alimentacion','sueno','salud_fisica','consumos','objetivos','areas_mejorar','obstaculos','vicios','habito_deseado'].forEach(k => {
    try { parsed[k] = JSON.parse(row[k] || '[]'); } catch(e) { parsed[k] = []; }
  });
  return parsed;
}

function upsertPerfil(data) {
  const existing = getDB().prepare('SELECT id FROM perfil WHERE id = 1').get();
  const json = (v) => JSON.stringify(Array.isArray(v) ? v : (v ? [v] : []));
  const fields = 'nombre,edad,genero,situacion_familiar,hijos,pareja,ocupacion,horas_trabajo,energia_general,alimentacion,sueno,salud_fisica,consumos,deporte_actual,ansiedad_general,animo_general,estres_general,irritabilidad,calidad_relaciones,soledad,apoyo_social,satisfaccion_laboral,burnout,proposito,nivel_disciplina,cronotipo,situacion_economica,ahorra,objetivos,areas_mejorar,obstaculos,vicios,area_fallo,habito_deseado,tiempo_disponible';
  const vals = [
    data.nombre, data.edad, data.genero,
    json(data.situacion_familiar), data.hijos, data.pareja,
    json(data.ocupacion), data.horas_trabajo,
    json(data.energia_general), json(data.alimentacion), json(data.sueno),
    json(data.salud_fisica), json(data.consumos), data.deporte_actual,
    data.ansiedad_general, data.animo_general, data.estres_general, data.irritabilidad,
    data.calidad_relaciones, data.soledad, data.apoyo_social,
    data.satisfaccion_laboral, data.burnout, data.proposito,
    data.nivel_disciplina, data.cronotipo,
    data.situacion_economica, data.ahorra,
    json(data.objetivos), json(data.areas_mejorar), json(data.obstaculos),
    json(data.vicios), data.area_fallo, json(data.habito_deseado), data.tiempo_disponible,
  ];
  if (existing) {
    const sets = fields.split(',').map(f => f+'=?').join(',');
    getDB().prepare('UPDATE perfil SET '+sets+',updated_at=datetime(\'now\') WHERE id=1').run(...vals);
  } else {
    const placeholders = fields.split(',').map(()=>'?').join(',');
    getDB().prepare('INSERT INTO perfil (id,'+fields+') VALUES (1,'+placeholders+')').run(...vals);
  }
}

function getMalosHabitos() {
  return getDB().prepare('SELECT * FROM malos_habitos WHERE active = 1 ORDER BY impacto DESC, name').all();
}

function createMaloHabito(name, categoria, impacto) {
  return getDB().prepare('INSERT INTO malos_habitos (name, categoria, impacto) VALUES (?,?,?)').run(name, categoria, impacto);
}

function deleteMaloHabito(id) {
  return getDB().prepare('UPDATE malos_habitos SET active=0 WHERE id=?').run(id);
}

function logMaloHabito(maloId, fecha, veces) {
  const exists = getDB().prepare('SELECT id FROM malos_habitos_log WHERE malo_id=? AND fecha=?').get(maloId, fecha);
  if (exists) {
    getDB().prepare('UPDATE malos_habitos_log SET veces=? WHERE malo_id=? AND fecha=?').run(veces, maloId, fecha);
  } else {
    getDB().prepare('INSERT INTO malos_habitos_log (malo_id, fecha, veces) VALUES (?,?,?)').run(maloId, fecha, veces);
  }
}

function getMalosHabitosLog(fecha) {
  return getDB().prepare('SELECT ml.*, mh.name, mh.categoria, mh.impacto FROM malos_habitos_log ml JOIN malos_habitos mh ON ml.malo_id = mh.id WHERE ml.fecha = ?').all(fecha);
}

function getMalosHabitosStats(maloId, days) {
  const d = new Date(); d.setDate(d.getDate()-days+1);
  const start = d.toISOString().split('T')[0];
  const today = new Date().toISOString().split('T')[0];
  return getDB().prepare('SELECT fecha, veces FROM malos_habitos_log WHERE malo_id=? AND fecha>=? AND fecha<=? ORDER BY fecha ASC').all(maloId, start, today);
}

function generateAlerts() {
  const alerts = [];
  const today = todayStr();
  const d7 = new Date(); d7.setDate(d7.getDate()-6);
  const start7 = d7.toISOString().split('T')[0];
  const checkins = getCheckinsRange(start7, today);
  const studyDays = checkins.filter(c => c.did_study).length;
  if (studyDays === 0 && checkins.length >= 3) alerts.push({ type:'warning', message:`Llevas ${checkins.length} dias sin registrar estudio.` });
  const exerciseDays = checkins.filter(c => c.did_exercise).length;
  if (exerciseDays === 0 && checkins.length >= 3) alerts.push({ type:'warning', message:`No has registrado ejercicio en los ultimos ${checkins.length} dias.` });
  if (checkins.length >= 4) {
    const recent = checkins.slice(-4).map(c => c.energy);
    const falling = recent.every((v,i) => i===0 || v <= recent[i-1]);
    if (falling && recent[recent.length-1] <= 4) alerts.push({ type:'danger', message:`Tu energia viene cayendo hace ${recent.length} dias consecutivos.` });
  }
  if (checkins.length >= 3) {
    const recent = checkins.slice(-3).map(c => c.anxiety);
    const rising = recent.every((v,i) => i===0 || v >= recent[i-1]);
    if (rising && recent[recent.length-1] >= 7) alerts.push({ type:'danger', message:`Tu ansiedad viene subiendo. Marcaste ${recent[recent.length-1]}/10.` });
  }
  return alerts;
}

function getDashboardData() {
  const today = todayStr();
  const weekStart = weekStartStr();
  const monthYear = currentMonthYear();
  const d7 = new Date(); d7.setDate(d7.getDate()-6);
  const start7 = d7.toISOString().split('T')[0];
  const todayCheckin = getCheckin(today);
  const weekCheckins = getCheckinsRange(start7, today);
  const habits = getAllHabits();
  const completedToday = getCompletedHabitsForDate(today);
  const weeklyObjs = getWeeklyObjectives(weekStart);
  const monthlyObjs = getMonthlyObjectives(monthYear);
  const habitCompletionToday = habits.length > 0 ? Math.round((completedToday.length / habits.length) * 100) : 0;
  const weekAvg = (field) => {
    if (!weekCheckins.length) return 0;
    return Math.round(weekCheckins.reduce((s,c) => s + c[field], 0) / weekCheckins.length * 10) / 10;
  };
  const generalScore = (() => {
    if (todayCheckin) {
      return Math.min(100, Math.round((todayCheckin.energy + todayCheckin.mood + todayCheckin.clarity + (10 - todayCheckin.anxiety)) / 4 * 10));
    }
    return 50;
  })();
  const habitStreaks = habits.map(h => ({ name: h.name, streak: getHabitStreak(h.id) })).filter(h => h.streak > 0).sort((a,b) => b.streak - a.streak).slice(0,3);
  const malosHoy = getMalosHabitosLog(today);

  const d30 = new Date(); d30.setDate(d30.getDate()-29);
  const checkins30 = getCheckinsRange(d30.toISOString().split('T')[0], today);
  const habitStats = habits.map(h => ({
    ...h,
    streak: getHabitStreak(h.id),
    rate7: getHabitCompletionRate(h.id, 7),
    rate30: getHabitCompletionRate(h.id, 30)
  })).sort((a,b) => b.rate7 - a.rate7);
  const reportSummary = {
    totalCheckins: checkins30.length,
    exerciseDays: checkins30.filter(c => c.did_exercise).length,
    studyDays: checkins30.filter(c => c.did_study).length,
    avgEnergy:  checkins30.length ? (checkins30.reduce((s,c)=>s+c.energy,0)/checkins30.length).toFixed(1) : 0,
    avgMood:    checkins30.length ? (checkins30.reduce((s,c)=>s+c.mood,0)/checkins30.length).toFixed(1) : 0,
    avgClarity: checkins30.length ? (checkins30.reduce((s,c)=>s+c.clarity,0)/checkins30.length).toFixed(1) : 0,
    avgAnxiety: checkins30.length ? (checkins30.reduce((s,c)=>s+c.anxiety,0)/checkins30.length).toFixed(1) : 0,
    avgSleep:   checkins30.length ? (checkins30.reduce((s,c)=>s+c.sleep_hours,0)/checkins30.length).toFixed(1) : 0,
  };
  const strengths  = habitStats.filter(h => h.rate7 >= 70).slice(0,3);
  const weaknesses = habitStats.filter(h => h.rate7 < 40 && h.rate7 >= 0).slice(0,3);

  let tareasHoy = [];
  try {
    tareasHoy = getDB().prepare(
      `SELECT * FROM objetivos_dia WHERE fecha = ? AND (tipo IS NULL OR tipo = 'dia') ORDER BY completado ASC, id ASC`
    ).all(today);
  } catch(e) {}

  let tareasAgendaHoy = [];
  try {
    tareasAgendaHoy = getDB().prepare(
      `SELECT * FROM objetivos_dia WHERE tipo = 'agenda' AND fecha = ? ORDER BY hora ASC, id ASC`
    ).all(today);
  } catch(e) {}

  const chartData = JSON.stringify({
    labels:  weekCheckins.map(c => c.date.slice(5)),
    energy:  weekCheckins.map(c => c.energy),
    mood:    weekCheckins.map(c => c.mood),
    anxiety: weekCheckins.map(c => c.anxiety),
  });

  return {
    today, weekStart, monthYear, todayCheckin, weekCheckins, habits,
    completedToday, habitCompletionToday,
    weekAvg: { energy: weekAvg('energy'), mood: weekAvg('mood'), clarity: weekAvg('clarity'), anxiety: weekAvg('anxiety') },
    weeklyObjs, weeklyCompleted: weeklyObjs.filter(o => o.status==='completado').length, weeklyTotal: weeklyObjs.length,
    monthlyObjs, monthlyCompleted: monthlyObjs.filter(o => o.status==='completado').length, monthlyTotal: monthlyObjs.length,
    generalScore, alerts: generateAlerts(),
    habitStreaks, malosHoy,
    reportSummary, strengths, weaknesses, habitStats,
    tareasHoy, tareasAgendaHoy, chartData,
  };
}

function getReportData(period) {
  const today = todayStr();
  let startDate;
  if (period === 'week') { const d=new Date(); d.setDate(d.getDate()-6); startDate=d.toISOString().split('T')[0]; }
  else if (period === 'month') { const d=new Date(); d.setDate(d.getDate()-29); startDate=d.toISOString().split('T')[0]; }
  else { startDate = today; }
  const checkins = getCheckinsRange(startDate, today);
  const habits = getAllHabits();
  const habitStats = habits.map(h => ({ ...h, streak: getHabitStreak(h.id), rate7: getHabitCompletionRate(h.id,7), rate30: getHabitCompletionRate(h.id,30) })).sort((a,b) => b.rate7-a.rate7);
  return {
    period, checkins, habitStats,
    strengths: habitStats.filter(h => h.rate7 >= 70).slice(0,3),
    weaknesses: habitStats.filter(h => h.rate7 < 40).slice(0,3),
    summary: {
      totalCheckins: checkins.length,
      exerciseDays: checkins.filter(c => c.did_exercise).length,
      studyDays: checkins.filter(c => c.did_study).length,
      mainBlockDays: checkins.filter(c => c.completed_main).length,
      avgEnergy: checkins.length ? (checkins.reduce((s,c)=>s+c.energy,0)/checkins.length).toFixed(1) : 0,
      avgMood: checkins.length ? (checkins.reduce((s,c)=>s+c.mood,0)/checkins.length).toFixed(1) : 0,
      avgClarity: checkins.length ? (checkins.reduce((s,c)=>s+c.clarity,0)/checkins.length).toFixed(1) : 0,
      avgAnxiety: checkins.length ? (checkins.reduce((s,c)=>s+c.anxiety,0)/checkins.length).toFixed(1) : 0,
      avgSleep: checkins.length ? (checkins.reduce((s,c)=>s+c.sleep_hours,0)/checkins.length).toFixed(1) : 0,
    }
  };
}

function saveCoachAnalysis(fecha, mensaje) {
  getDB().prepare('INSERT INTO coach_analyses (fecha, mensaje) VALUES (?, ?)').run(fecha, mensaje);
}

function getCoachHistory(limit) {
  return getDB().prepare('SELECT * FROM coach_analyses ORDER BY created_at DESC LIMIT ?').all(limit || 10);
}

function getRutinaCompletions(fecha) {
  return getDB().prepare('SELECT bloque_key FROM rutina_completions WHERE fecha = ?').all(fecha).map(r => r.bloque_key);
}

function toggleRutinaCompletion(fecha, bloqueKey) {
  const exists = getDB().prepare('SELECT id FROM rutina_completions WHERE fecha=? AND bloque_key=?').get(fecha, bloqueKey);
  if (exists) {
    getDB().prepare('DELETE FROM rutina_completions WHERE fecha=? AND bloque_key=?').run(fecha, bloqueKey);
    return false;
  } else {
    getDB().prepare('INSERT OR IGNORE INTO rutina_completions (fecha, bloque_key) VALUES (?,?)').run(fecha, bloqueKey);
    return true;
  }
}

/* ═══════════════════════════════════════════════════
   ESTADO OBLIGATORIO — 3x daily mandatory check-in
   Periodos: manana (6-12), tarde (12-18), noche (18-24)
   ═══════════════════════════════════════════════════ */

const ESTADO_PERIODOS = [
  { key: 'manana', label: 'Manana',  desde: 6,  hasta: 12 },
  { key: 'tarde',  label: 'Tarde',   desde: 12, hasta: 18 },
  { key: 'noche',  label: 'Noche',   desde: 18, hasta: 24 },
];

function getEstadoPeriodoActual() {
  const hora = new Date().getHours();
  for (const p of ESTADO_PERIODOS) {
    if (hora >= p.desde && hora < p.hasta) return p;
  }
  // Before 6am → still belongs to noche of previous day? No, just return null (no obligation)
  return null;
}

function getEstadoCompletados(fecha) {
  return getDB().prepare('SELECT * FROM estado_obligatorio WHERE fecha = ? ORDER BY id ASC').all(fecha);
}

function getEstadoPendiente(fecha) {
  const completados = getEstadoCompletados(fecha);
  const completadoKeys = completados.map(c => c.periodo);
  const periodoActual = getEstadoPeriodoActual();
  if (!periodoActual) return null; // Before 6am, no obligation

  // Check all periods up to and including current
  for (const p of ESTADO_PERIODOS) {
    if (!completadoKeys.includes(p.key)) {
      // This period hasn't been completed
      const hora = new Date().getHours();
      if (hora >= p.desde) {
        // This period has started and isn't done → PENDING
        return p;
      }
    }
    if (p.key === periodoActual.key) break; // Don't check future periods
  }
  return null; // All done up to current period
}

/* ── Emotion circumplex mapping ── */
const EMOCIONES_MAP = {
  // High energy + Positive
  'motivado':    { valencia: 'positiva', arousal: 'alta' },
  'feliz':       { valencia: 'positiva', arousal: 'alta' },
  'inspirado':   { valencia: 'positiva', arousal: 'alta' },
  'entusiasmado':{ valencia: 'positiva', arousal: 'alta' },
  // Low energy + Positive
  'tranquilo':   { valencia: 'positiva', arousal: 'baja' },
  'relajado':    { valencia: 'positiva', arousal: 'baja' },
  'satisfecho':  { valencia: 'positiva', arousal: 'baja' },
  'en_paz':      { valencia: 'positiva', arousal: 'baja' },
  // High energy + Negative
  'ansioso':     { valencia: 'negativa', arousal: 'alta' },
  'enojado':     { valencia: 'negativa', arousal: 'alta' },
  'frustrado':   { valencia: 'negativa', arousal: 'alta' },
  'estresado':   { valencia: 'negativa', arousal: 'alta' },
  // Low energy + Negative
  'triste':      { valencia: 'negativa', arousal: 'baja' },
  'agotado':     { valencia: 'negativa', arousal: 'baja' },
  'aburrido':    { valencia: 'negativa', arousal: 'baja' },
  'apatico':     { valencia: 'negativa', arousal: 'baja' },
};

function calcularIndices(data) {
  const eg = data.estado_general || 3;
  const en = data.energia || 3;
  const es = data.estres || 3;
  const ef = data.enfoque || 3;
  const su = data.sueno || 0;

  // Bienestar: estado + energía + inverso estrés + sueño (si hay)
  const factoresBienestar = [eg, en, (6 - es)];
  if (su > 0) factoresBienestar.push(su);
  const bienestar = Math.round((factoresBienestar.reduce((a,b)=>a+b, 0) / (factoresBienestar.length * 5)) * 100);

  // Productividad: enfoque + productividad + motivación
  const prod = data.productividad || 0;
  const mot = data.motivacion || 0;
  const factoresProd = [ef];
  if (prod > 0) factoresProd.push(prod);
  if (mot > 0) factoresProd.push(mot);
  const productividad = Math.round((factoresProd.reduce((a,b)=>a+b, 0) / (factoresProd.length * 5)) * 100);

  // Emocional: valencia de emoción + motivación + inverso estrés
  const emoInfo = EMOCIONES_MAP[data.emocion] || {};
  const valenciaScore = emoInfo.valencia === 'positiva' ? 4 : emoInfo.valencia === 'negativa' ? 2 : 3;
  const factoresEmocional = [eg, valenciaScore, (6 - es)];
  if (mot > 0) factoresEmocional.push(mot);
  const emocional = Math.round((factoresEmocional.reduce((a,b)=>a+b, 0) / (factoresEmocional.length * 5)) * 100);

  // Balance: ejercicio + alimentación + social + sueño
  const af = data.actividad_fisica || 0;
  const al = data.alimentacion || 0;
  const so = data.social || 0;
  const factoresBalance = [];
  if (af > 0) factoresBalance.push(af * 5); // 0/1 → 0 or 5
  if (al > 0) factoresBalance.push(al);
  if (so > 0) factoresBalance.push(so);
  if (su > 0) factoresBalance.push(su);
  const balance = factoresBalance.length > 0
    ? Math.round((factoresBalance.reduce((a,b)=>a+b, 0) / (factoresBalance.length * 5)) * 100)
    : 0;

  return {
    indice_bienestar: Math.min(100, Math.max(0, bienestar)),
    indice_productividad: Math.min(100, Math.max(0, productividad)),
    indice_emocional: Math.min(100, Math.max(0, emocional)),
    indice_balance: Math.min(100, Math.max(0, balance)),
  };
}

function saveEstadoObligatorio(fecha, periodo, data) {
  const emoInfo = EMOCIONES_MAP[data.emocion] || {};
  const indices = calcularIndices(data);

  const fields = {
    estado_general: data.estado_general || 3,
    energia: data.energia || 3,
    estres: data.estres || 3,
    enfoque: data.enfoque || 3,
    emocion: data.emocion || '',
    emocion_valencia: emoInfo.valencia || '',
    emocion_arousal: emoInfo.arousal || '',
    contexto: data.contexto || '',
    sueno: data.sueno || 0,
    evaluacion_dia: data.evaluacion_dia || 0,
    nota: (data.nota || '').trim(),
    modo_extendido: data.modo_extendido || 0,
    motivacion: data.motivacion || 0,
    productividad: data.productividad || 0,
    claridad_mental: data.claridad_mental || 0,
    actividad_fisica: data.actividad_fisica || 0,
    alimentacion: data.alimentacion || 0,
    social: data.social || 0,
    rumiacion: data.rumiacion || 0,
    conexion_social: data.conexion_social || 0,
    preocupacion: (data.preocupacion || '').trim(),
    mejor_momento: (data.mejor_momento || '').trim(),
    meta_mejora: (data.meta_mejora || '').trim(),
    ...indices,
  };

  const existing = getDB().prepare('SELECT id FROM estado_obligatorio WHERE fecha=? AND periodo=?').get(fecha, periodo);
  const cols = Object.keys(fields);
  const vals = Object.values(fields);

  if (existing) {
    const sets = cols.map(c => c + '=?').join(',');
    getDB().prepare('UPDATE estado_obligatorio SET ' + sets + ' WHERE fecha=? AND periodo=?').run(...vals, fecha, periodo);
  } else {
    const placeholders = cols.map(() => '?').join(',');
    getDB().prepare('INSERT INTO estado_obligatorio (fecha, periodo, ' + cols.join(',') + ') VALUES (?,?,' + placeholders + ')').run(fecha, periodo, ...vals);
  }

  return indices;
}

function getEstadoIndicesHoy(fecha) {
  const registros = getEstadoCompletados(fecha);
  if (!registros.length) return { bienestar: 0, productividad: 0, emocional: 0, balance: 0 };

  // Average all periods
  const avg = (field) => Math.round(registros.reduce((s, r) => s + (r[field] || 0), 0) / registros.length);
  return {
    bienestar: avg('indice_bienestar'),
    productividad: avg('indice_productividad'),
    emocional: avg('indice_emocional'),
    balance: avg('indice_balance'),
  };
}

function getEstadoResumenHoy(fecha) {
  const registros = getEstadoCompletados(fecha);
  if (!registros.length) return null;

  const avg = (field) => +(registros.reduce((s, r) => s + (r[field] || 0), 0) / registros.length).toFixed(1);
  const indices = getEstadoIndicesHoy(fecha);
  const ultimaEmocion = registros[registros.length - 1].emocion || '';
  const ultimoContexto = registros[registros.length - 1].contexto || '';

  // Overall level
  const promedio = (indices.bienestar + indices.productividad + indices.emocional) / 3;
  let nivel, nivelColor, nivelEmoji;
  if (promedio >= 70) { nivel = 'Alto'; nivelColor = '#22c55e'; nivelEmoji = '🟢'; }
  else if (promedio >= 40) { nivel = 'Medio'; nivelColor = '#f9c74f'; nivelEmoji = '🟡'; }
  else { nivel = 'Bajo'; nivelColor = '#ef4444'; nivelEmoji = '🔴'; }

  // Generate summary text
  const energiaTexto = avg('energia') >= 4 ? 'buena energía' : avg('energia') >= 2.5 ? 'energía media' : 'baja energía';
  const estresTexto = avg('estres') >= 4 ? 'estrés alto' : avg('estres') >= 2.5 ? 'estrés moderado' : 'poco estrés';
  const enfoqueTexto = avg('enfoque') >= 4 ? 'buen enfoque' : avg('enfoque') >= 2.5 ? 'enfoque medio' : 'bajo enfoque';

  return {
    indices,
    nivel, nivelColor, nivelEmoji,
    resumenTexto: `Hoy estás con ${energiaTexto}, ${estresTexto} y ${enfoqueTexto}.`,
    promedios: {
      estado_general: avg('estado_general'),
      energia: avg('energia'),
      estres: avg('estres'),
      enfoque: avg('enfoque'),
    },
    ultimaEmocion,
    ultimoContexto,
    totalRegistros: registros.length,
  };
}

function getEstadoHistorial(dias) {
  const d = new Date(); d.setDate(d.getDate() - dias + 1);
  const start = d.toISOString().split('T')[0];
  const today = todayStr();
  return getDB().prepare('SELECT * FROM estado_obligatorio WHERE fecha >= ? AND fecha <= ? ORDER BY fecha ASC, id ASC').all(start, today);
}

module.exports = {
  getDB, getAsyncStorage, getActiveDBPath, getActiveRutinaPath, isDemo,
  todayStr, weekStartStr, currentMonthYear,
  getCheckin, upsertCheckin, getCheckinsRange,
  getAllHabits, createHabit, updateHabit, deleteHabit,
  toggleHabitCompletion, getCompletedHabitsForDate,
  getHabitStreak, getHabitCompletionRate, getHabitCompletionDates,
  getWeeklyObjectives, createWeeklyObjective, updateWeeklyObjectiveStatus, deleteWeeklyObjective,
  getMonthlyObjectives, createMonthlyObjective, updateMonthlyObjective, deleteMonthlyObjective,
  getAllNotas, createNota, deleteNota,
  getReflexion, upsertReflexion, getReflexionesRange,
  getPerfil, upsertPerfil,
  getMalosHabitos, createMaloHabito, deleteMaloHabito,
  logMaloHabito, getMalosHabitosLog, getMalosHabitosStats,
  generateAlerts, getDashboardData, getReportData,
  getRutinaCompletions, toggleRutinaCompletion,
  saveCoachAnalysis, getCoachHistory,
  ESTADO_PERIODOS, getEstadoPeriodoActual, getEstadoCompletados,
  getEstadoPendiente, saveEstadoObligatorio, getEstadoHistorial,
  EMOCIONES_MAP, calcularIndices, getEstadoIndicesHoy, getEstadoResumenHoy,
};
