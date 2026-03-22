const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const db = require('../database');

const DEFAULT_RUTINA_PATH = path.join(__dirname, '../public/rutina.json');
function getRutinaPath() {
  return db.getActiveRutinaPath() || DEFAULT_RUTINA_PATH;
}

const CATEGORIAS = {
  manana:    { label: 'Mañana',    color: '#60a5fa' },
  trabajo:   { label: 'Trabajo',   color: '#f59e0b' },
  ejercicio: { label: 'Ejercicio', color: '#34d399' },
  familia:   { label: 'Familia',   color: '#a78bfa' },
  comida:    { label: 'Comida',    color: '#2dd4bf' },
  descanso:  { label: 'Descanso',  color: '#fb7185' },
  estudio:   { label: 'Estudio',   color: '#38bdf8' },
  trayecto:  { label: 'Trayecto',  color: '#94a3b8' },
  general:   { label: 'General',   color: '#64748b' },
};

function autoCat(nombre) {
  const n = (nombre || '').toLowerCase();
  if (/ejercicio|entrena|deporte|movilidad|caminata|correr|gym|fuerza/.test(n)) return 'ejercicio';
  if (/trabajo|oficina|reunion|cliente|laboral/.test(n)) return 'trabajo';
  if (/familia|hijo|nino|pareja|vida real/.test(n)) return 'familia';
  if (/desayuno|almuerzo|cena|comida|cafe|agua|te /.test(n)) return 'comida';
  if (/dormir|siesta|revoluciones|cierre suave|bajar/.test(n)) return 'descanso';
  if (/ducha|bano|aseo|orden|preparar|preparacion|activacion/.test(n)) return 'manana';
  if (/estudio|python|ia|leer|aprender|repaso|tecnico/.test(n)) return 'estudio';
  if (/despertar/.test(n)) return 'manana';
  if (/trayecto|camino|vuelta/.test(n)) return 'trayecto';
  if (/descanso|descompresion/.test(n)) return 'descanso';
  if (/cierre/.test(n)) return 'descanso';
  return 'general';
}

function loadRutina() {
  const rutinaPath = getRutinaPath();
  let rutina = {};
  try { rutina = JSON.parse(fs.readFileSync(rutinaPath, 'utf8')); } catch(e) {}
  // Auto-categorize blocks that don't have a category yet
  let changed = false;
  Object.keys(rutina).forEach(dia => {
    rutina[dia].forEach(b => {
      if (!b.categoria) { b.categoria = autoCat(b.bloque); changed = true; }
    });
  });
  if (changed) fs.writeFileSync(rutinaPath, JSON.stringify(rutina, null, 2));
  return rutina;
}

function saveRutina(rutina) {
  const rutinaPath = getRutinaPath();
  fs.writeFileSync(rutinaPath, JSON.stringify(rutina, null, 2));
}

const DIAS_KEY = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];

function getWeekDates() {
  const now = new Date();
  const weekDates = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - now.getDay() + i);
    weekDates[DIAS_KEY[i]] = d.toISOString().split('T')[0];
  }
  return weekDates;
}

router.get('/', (req, res) => {
  const rutina = loadRutina();
  const today = db.todayStr();
  const completions = db.getRutinaCompletions(today);
  const weekDates = getWeekDates();
  const weekCompletions = {};
  Object.entries(weekDates).forEach(([dia, fecha]) => {
    weekCompletions[dia] = db.getRutinaCompletions(fecha);
  });
  res.render('rutina', { page: 'rutina', rutina, query: req.query, categorias: CATEGORIAS, today, completions, weekDates, weekCompletions });
});

router.post('/agregar-bloque', (req, res) => {
  const rutina = loadRutina();
  const { dia, inicio, fin, bloque, categoria } = req.body;
  if (!rutina[dia]) rutina[dia] = [];
  rutina[dia].push({ inicio, fin, bloque, categoria: categoria || autoCat(bloque) });
  rutina[dia].sort((a, b) => a.inicio.localeCompare(b.inicio));
  saveRutina(rutina);
  res.redirect('/rutina?dia=' + dia);
});

router.post('/editar-bloque', (req, res) => {
  const rutina = loadRutina();
  const { dia, index, inicio, fin, bloque, categoria } = req.body;
  const i = parseInt(index);
  if (rutina[dia] && rutina[dia][i]) {
    rutina[dia][i] = { inicio, fin, bloque, categoria: categoria || autoCat(bloque) };
    rutina[dia].sort((a, b) => a.inicio.localeCompare(b.inicio));
  }
  saveRutina(rutina);
  res.redirect('/rutina?dia=' + dia);
});

router.post('/eliminar-bloque', (req, res) => {
  const rutina = loadRutina();
  const { dia, index } = req.body;
  if (rutina[dia]) rutina[dia].splice(parseInt(index), 1);
  saveRutina(rutina);
  if (req.headers['x-requested-with'] === 'XMLHttpRequest') return res.json({ ok: true });
  res.redirect('/rutina?dia=' + dia);
});

router.post('/toggle-completion', (req, res) => {
  const { fecha, bloqueKey } = req.body;
  const done = db.toggleRutinaCompletion(fecha, bloqueKey);
  res.json({ done });
});

router.post('/copiar-dia', (req, res) => {
  const rutina = loadRutina();
  const { diaOrigen, diaDestino, modo } = req.body;
  if (!rutina[diaOrigen] || !diaDestino || diaOrigen === diaDestino) {
    return res.redirect('/rutina?dia=' + diaOrigen);
  }
  if (modo === 'reemplazar' || !rutina[diaDestino] || rutina[diaDestino].length === 0) {
    rutina[diaDestino] = JSON.parse(JSON.stringify(rutina[diaOrigen]));
  } else {
    const existingTimes = new Set(rutina[diaDestino].map(b => b.inicio));
    rutina[diaOrigen].forEach(b => {
      if (!existingTimes.has(b.inicio)) rutina[diaDestino].push(JSON.parse(JSON.stringify(b)));
    });
    rutina[diaDestino].sort((a, b) => a.inicio.localeCompare(b.inicio));
  }
  saveRutina(rutina);
  res.redirect('/rutina?dia=' + diaDestino);
});

module.exports = router;
