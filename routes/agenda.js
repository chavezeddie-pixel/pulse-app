const express = require('express');
const router  = express.Router();
const db      = require('../database');

// objetivos_dia table is now created in database.js initSchemaOn()
// getDB() from db module respects AsyncLocalStorage (demo isolation)
function getDB() {
  return db.getDB();
}

router.get('/', (req, res) => {
  const today     = db.todayStr();
  const weekStart = db.weekStartStr();
  const monthYear = db.currentMonthYear();
  const dbRaw     = getDB();

  // Días de la semana actual (lunes → domingo)
  const lunBase = new Date(weekStart + 'T00:00:00');
  const diasSemana = Array.from({length: 7}, (_, i) => {
    const d = new Date(lunBase); d.setDate(lunBase.getDate() + i);
    const ds = d.toISOString().split('T')[0];
    const tareas = dbRaw.prepare(`SELECT id, completado FROM objetivos_dia WHERE fecha=? AND (tipo IS NULL OR tipo='dia' OR tipo='agenda')`).all(ds);
    return {
      fecha: ds,
      dia: ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'][i],
      num: d.getDate(),
      total: tareas.length,
      done: tareas.filter(t => t.completado).length,
    };
  });

  // Tareas del día seleccionado (query param ?dia= o hoy)
  const diaVista = req.query.dia || today;

  const d30 = new Date(); d30.setDate(d30.getDate() + 30);
  const end30 = d30.toISOString().split('T')[0];

  const mañana = new Date(); mañana.setDate(mañana.getDate() + 1);
  const mañanaStr = mañana.toISOString().split('T')[0];

  let objetivosDia = [], proximasTareas = [], tareasDiaVista = [];
  try {
    objetivosDia   = dbRaw.prepare(`SELECT * FROM objetivos_dia WHERE fecha=? AND (tipo IS NULL OR tipo='dia') ORDER BY completado ASC, hora ASC, id ASC`).all(today);
    tareasDiaVista = dbRaw.prepare(`SELECT * FROM objetivos_dia WHERE fecha=? ORDER BY completado ASC, hora ASC, id ASC`).all(diaVista);
    proximasTareas = dbRaw.prepare(`SELECT * FROM objetivos_dia WHERE tipo='agenda' AND fecha>=? AND fecha<=? ORDER BY fecha ASC, hora ASC, id ASC`).all(mañanaStr, end30);
  } catch(e) { console.error('agenda:', e.message); }

  const weeklyObjs  = db.getWeeklyObjectives(weekStart);
  const monthlyObjs = db.getMonthlyObjectives(monthYear);

  res.render('agenda', {
    page: 'agenda', today, weekStart, monthYear, diaVista,
    diasSemana, objetivosDia, tareasDiaVista, proximasTareas,
    weeklyObjs, monthlyObjs,
  });
});

// AJAX: tareas de un día
router.get('/tareas-dia', (req, res) => {
  const dbRaw = getDB();
  const fecha = req.query.fecha || db.todayStr();
  const tareas = dbRaw.prepare('SELECT * FROM objetivos_dia WHERE fecha=? ORDER BY completado ASC, hora ASC, id ASC').all(fecha);
  res.json({ tareas });
});

// AJAX: tareas de un mes para el calendario
router.get('/tareas-mes', (req, res) => {
  const dbRaw = getDB();
  const mes  = String(req.query.mes || (new Date().getMonth()+1)).padStart(2,'0');
  const anio = req.query.anio || new Date().getFullYear();
  try {
    const tareas = dbRaw.prepare(`SELECT id,fecha,nombre,completado FROM objetivos_dia WHERE fecha LIKE ? ORDER BY fecha,hora,id`).all(anio+'-'+mes+'%');
    res.json({ tareas });
  } catch(e) { res.json({ tareas: [] }); }
});

// POST agregar tarea
router.post('/dia', (req, res) => {
  const dbRaw = getDB();
  // schema handled by database.js
  const fecha    = req.body.fecha    || db.todayStr();
  const nombre   = req.body.nombre;
  const hora     = req.body.hora     || '';
  const tipo     = req.body.tipo     || 'dia';
  const priority = req.body.priority || 'media';
  const area     = req.body.area     || '';
  if (nombre && nombre.trim()) {
    dbRaw.prepare(`INSERT INTO objetivos_dia (fecha,nombre,hora,tipo,priority,area) VALUES (?,?,?,?,?,?)`).run(fecha, nombre.trim(), hora, tipo, priority, area);
  }
  const isAjax = req.headers['x-requested-with'] === 'XMLHttpRequest';
  if (isAjax) return res.json({ ok: true });
  res.redirect('/agenda');
});

router.post('/dia/:id/toggle', (req, res) => {
  const dbRaw = getDB();
  const obj = dbRaw.prepare('SELECT * FROM objetivos_dia WHERE id=?').get(parseInt(req.params.id));
  if (obj) dbRaw.prepare('UPDATE objetivos_dia SET completado=? WHERE id=?').run(obj.completado ? 0 : 1, obj.id);
  if (req.headers['x-requested-with'] === 'XMLHttpRequest') return res.json({ ok: true, completado: !obj?.completado });
  res.redirect('/agenda');
});

router.post('/dia/:id/delete', (req, res) => {
  const dbRaw = getDB();
  dbRaw.prepare('DELETE FROM objetivos_dia WHERE id=?').run(parseInt(req.params.id));
  if (req.headers['x-requested-with'] === 'XMLHttpRequest') return res.json({ ok: true });
  res.redirect('/agenda');
});

router.post('/semanal', (req, res) => {
  db.createWeeklyObjective({ name: req.body.name, area: req.body.area||'personal', priority: req.body.priority||'media', deadline: req.body.deadline||null, week_start: db.weekStartStr() });
  res.redirect('/agenda');
});

router.post('/semanal/:id/status', (req, res) => {
  db.updateWeeklyObjectiveStatus(parseInt(req.params.id), req.body.status, parseInt(req.body.progress)||0);
  if (req.headers['x-requested-with'] === 'XMLHttpRequest') return res.json({ ok: true });
  res.redirect('/agenda');
});

router.delete('/semanal/:id', (req, res) => {
  db.deleteWeeklyObjective(parseInt(req.params.id));
  if (req.headers['x-requested-with'] === 'XMLHttpRequest') return res.json({ ok: true });
  res.redirect('/agenda');
});

router.post('/mensual', (req, res) => {
  db.createMonthlyObjective({ name: req.body.name, description: req.body.description||'', category: req.body.category||'personal', progress_indicator: req.body.progress_indicator||'', target_date: req.body.target_date||null, month_year: db.currentMonthYear() });
  res.redirect('/agenda');
});

router.post('/mensual/:id/update', (req, res) => {
  db.updateMonthlyObjective(parseInt(req.params.id), { percentage: parseInt(req.body.percentage)||0, status: req.body.status });
  if (req.headers['x-requested-with'] === 'XMLHttpRequest') return res.json({ ok: true });
  res.redirect('/agenda');
});

router.delete('/mensual/:id', (req, res) => {
  db.deleteMonthlyObjective(parseInt(req.params.id));
  if (req.headers['x-requested-with'] === 'XMLHttpRequest') return res.json({ ok: true });
  res.redirect('/agenda');
});

module.exports = router;
