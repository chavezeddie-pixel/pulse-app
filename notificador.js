const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const RUTINA_PATH = path.join(__dirname, 'public/rutina.json');
const DB_PATH = path.join(__dirname, 'data/tracker.db');
const DIAS = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];

function notify(titulo, mensaje, sonido) {
  const s = sonido || 'Glass';
  try {
    execSync(`osascript -e 'display notification "${mensaje}" with title "${titulo}" sound name "${s}"'`);
  } catch(e) {}
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function getDB() {
  try { return new Database(DB_PATH); } catch(e) { return null; }
}

function getCheckin(db, fecha) {
  try { return db.prepare('SELECT * FROM daily_checkins WHERE date = ?').get(fecha); } catch(e) { return null; }
}

function getReflexion(db, fecha) {
  try { return db.prepare('SELECT id FROM reflexiones WHERE fecha = ?').get(fecha); } catch(e) { return null; }
}

function getHabitosHoy(db, fecha) {
  try {
    const total = db.prepare('SELECT COUNT(*) as cnt FROM habits WHERE active = 1').get().cnt;
    const done = db.prepare('SELECT COUNT(*) as cnt FROM habit_completions WHERE date = ?').get(fecha).cnt;
    return { total, done };
  } catch(e) { return { total: 0, done: 0 }; }
}

function checkTodo() {
  const now = new Date();
  const hora = now.getHours();
  const minutos = hora * 60 + now.getMinutes();
  const dia = DIAS[now.getDay()];
  const today = todayStr();
  const db = getDB();

  // --- Avisos de rutina ---
  let rutina = {};
  try { rutina = JSON.parse(fs.readFileSync(RUTINA_PATH, 'utf8')); } catch(e) {}
  const bloques = rutina[dia] || [];

  bloques.forEach(b => {
    const [h, m] = b.inicio.split(':').map(Number);
    const minBloque = h * 60 + m;
    if (minutos === minBloque) {
      const [hf, mf] = b.fin.split(':').map(Number);
      const duracion = (hf * 60 + mf) - minBloque;
      notify('Pulse — Rutina', `▶ ${b.bloque}  (${b.inicio}–${b.fin}, ${duracion}min)`, 'Glass');
    }
  });

  if (!db) return;

  // --- Aviso de checkin (si no se ha hecho y es >= 8:00) ---
  if (minutos === 8 * 60 || minutos === 9 * 60 || minutos === 10 * 60) {
    const checkin = getCheckin(db, today);
    if (!checkin) {
      notify('Pulse', '⚡ Aún no registraste tu chequeo de hoy', 'Ping');
    }
  }

  // --- Aviso de reflexión (si no se ha hecho y es >= 20:30) ---
  if (minutos === 20 * 60 + 30 || minutos === 21 * 60) {
    const reflexion = getReflexion(db, today);
    if (!reflexion) {
      notify('Pulse', '📓 Pendiente: reflexión del día', 'Ping');
    }
  }

  // --- Resumen de hábitos a mediodía ---
  if (minutos === 13 * 60) {
    const { total, done } = getHabitosHoy(db, today);
    if (total > 0) {
      const pct = Math.round(done / total * 100);
      notify('Pulse — Hábitos', `${done}/${total} completados (${pct}%)`, 'Bottle');
    }
  }

  db.close();
}

console.log('Notificador iniciado —', new Date().toLocaleTimeString());
console.log('Avisos: rutina, checkin (8-10h), reflexión (20:30), hábitos (13h)');
setInterval(checkTodo, 60000);
checkTodo();
