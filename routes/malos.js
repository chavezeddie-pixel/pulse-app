const express = require('express');
const router = express.Router();
const db = require('../database');

function computeStats(m, today) {
  const stats7  = db.getMalosHabitosStats(m.id, 7);
  const stats30 = db.getMalosHabitosStats(m.id, 30);
  const total7  = stats7.reduce((s, r) => s + r.veces, 0);
  const total30 = stats30.reduce((s, r) => s + r.veces, 0);

  // Mapa fecha→veces
  const map = {};
  stats30.forEach(r => { map[r.fecha] = r.veces; });

  // Racha limpia (días consecutivos con 0)
  let rachaLimpia = 0;
  for (let i = 0; i < 30; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ds = d.toISOString().split('T')[0];
    if (!map[ds] || map[ds] === 0) rachaLimpia++;
    else break;
  }

  // Grid últimos 14 días
  const grid = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ds = d.toISOString().split('T')[0];
    grid.push({ date: ds, veces: map[ds] || 0 });
  }

  // Tendencia: comparar primeros 3 vs últimos 3 de los últimos 7
  const primerMitad = stats7.slice(0, 3).reduce((s, r) => s + r.veces, 0);
  const ultMitad    = stats7.slice(-3).reduce((s, r) => s + r.veces, 0);
  const tendencia   = stats7.length >= 4
    ? (ultMitad < primerMitad ? 'mejorando' : ultMitad > primerMitad ? 'empeorando' : 'estable')
    : 'estable';

  return { total7, total30, rachaLimpia, grid, tendencia };
}

router.get('/', (req, res) => {
  const today = db.todayStr();
  const malos = db.getMalosHabitos();
  const logHoy = db.getMalosHabitosLog(today);

  const malosConStats = malos.map(m => {
    const { total7, total30, rachaLimpia, grid, tendencia } = computeStats(m, today);
    return {
      ...m,
      vecesHoy: (logHoy.find(l => l.malo_id === m.id) || {}).veces || 0,
      total7, total30, rachaLimpia, grid, tendencia,
    };
  });

  // Resumen global
  const totalCaidasHoy   = malosConStats.reduce((s, m) => s + m.vecesHoy, 0);
  const totalCaidas7     = malosConStats.reduce((s, m) => s + m.total7, 0);
  const limpiosHoy       = malosConStats.filter(m => m.vecesHoy === 0).length;
  const mejorRachaLimpia = malosConStats.length ? Math.max(...malosConStats.map(m => m.rachaLimpia)) : 0;

  res.render('malos', {
    malos: malosConStats, today, page: 'malos',
    resumen: { totalCaidasHoy, totalCaidas7, limpiosHoy, mejorRachaLimpia, total: malos.length },
  });
});

router.post('/', (req, res) => {
  const { name, categoria, impacto } = req.body;
  if (name && name.trim()) db.createMaloHabito(name.trim(), categoria || 'general', parseInt(impacto) || 5);
  res.redirect('/malos');
});

// AJAX log
router.post('/:id/log', (req, res) => {
  const id    = parseInt(req.params.id);
  const fecha = req.body.fecha || db.todayStr();
  const veces = parseInt(req.body.veces) ?? 0;
  db.logMaloHabito(id, fecha, veces);

  if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
    // Recalcular stats para este hábito
    const m = db.getMalosHabitos().find(x => x.id === id);
    if (!m) return res.json({ ok: false });
    const stats = computeStats(m, fecha);
    return res.json({ ok: true, veces, vecesHoy: veces, ...stats });
  }
  res.redirect('/malos');
});

router.delete('/:id', (req, res) => {
  db.deleteMaloHabito(parseInt(req.params.id));
  if (req.headers['x-requested-with'] === 'XMLHttpRequest') return res.json({ ok: true });
  res.redirect('/malos');
});

module.exports = router;
