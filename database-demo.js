const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'demo.db');
let db;

function getDB() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
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
      nombre TEXT,
      edad INTEGER,
      situacion_familiar TEXT,
      ocupacion TEXT,
      energia_general TEXT,
      alimentacion TEXT,
      sueno TEXT,
      objetivos TEXT,
      areas_mejorar TEXT,
      obstaculos TEXT,
      vicios TEXT,
      tiempo_disponible TEXT,
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
  ['situacion_familiar','ocupacion','energia_general','alimentacion','sueno','objetivos','areas_mejorar','obstaculos','vicios','tiempo_disponible'].forEach(k => {
    try { parsed[k] = JSON.parse(row[k] || '[]'); } catch(e) { parsed[k] = []; }
  });
  return parsed;
}

function upsertPerfil(data) {
  const existing = getDB().prepare('SELECT id FROM perfil WHERE id = 1').get();
  const json = (v) => JSON.stringify(Array.isArray(v) ? v : (v ? [v] : []));
  if (existing) {
    getDB().prepare('UPDATE perfil SET nombre=?,edad=?,situacion_familiar=?,ocupacion=?,energia_general=?,alimentacion=?,sueno=?,objetivos=?,areas_mejorar=?,obstaculos=?,vicios=?,tiempo_disponible=?,updated_at=datetime(\'now\') WHERE id=1')
    .run(data.nombre,data.edad,json(data.situacion_familiar),json(data.ocupacion),json(data.energia_general),json(data.alimentacion),json(data.sueno),json(data.objetivos),json(data.areas_mejorar),json(data.obstaculos),json(data.vicios),json(data.tiempo_disponible));
  } else {
    getDB().prepare('INSERT INTO perfil (id,nombre,edad,situacion_familiar,ocupacion,energia_general,alimentacion,sueno,objetivos,areas_mejorar,obstaculos,vicios,tiempo_disponible) VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(data.nombre,data.edad,json(data.situacion_familiar),json(data.ocupacion),json(data.energia_general),json(data.alimentacion),json(data.sueno),json(data.objetivos),json(data.areas_mejorar),json(data.obstaculos),json(data.vicios),json(data.tiempo_disponible));
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
  return {
    today, weekStart, monthYear, todayCheckin, weekCheckins, habits,
    completedToday, habitCompletionToday,
    weekAvg: { energy: weekAvg('energy'), mood: weekAvg('mood'), clarity: weekAvg('clarity'), anxiety: weekAvg('anxiety') },
    weeklyObjs, weeklyCompleted: weeklyObjs.filter(o => o.status==='completado').length, weeklyTotal: weeklyObjs.length,
    monthlyObjs, monthlyCompleted: monthlyObjs.filter(o => o.status==='completado').length, monthlyTotal: monthlyObjs.length,
    generalScore, alerts: generateAlerts(),
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

module.exports = {
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
};