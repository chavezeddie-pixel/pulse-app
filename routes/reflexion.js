const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/', (req, res) => {
  const today    = db.todayStr();
  const reflexion = db.getReflexion(today);

  // Writing streak
  let rachaRef = 0;
  for (let i = 0; i < 60; i++) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const ds = d.toISOString().split('T')[0];
    if (db.getReflexion(ds)) rachaRef++;
    else break;
  }

  // Last 7 reflexiones for sparkline
  let ultimas7 = [];
  try {
    const dbRaw = db.getDB();
    const semS  = new Date(today); semS.setDate(semS.getDate() - 6);
    ultimas7 = dbRaw.prepare(
      `SELECT fecha, satisfaccion, enfoque, claridad_cierre FROM reflexiones WHERE fecha >= ? ORDER BY fecha ASC`
    ).all(semS.toISOString().split('T')[0]);
  } catch(e) {}

  res.render('reflexion', { today, reflexion, page: 'reflexion', rachaRef, ultimas7 });
});

router.post('/', (req, res) => {
  const data = {
    fecha: req.body.fecha || db.todayStr(),
    energia_roba: req.body.energia_roba || '',
    energia_da:   req.body.energia_da   || '',
    freno:        req.body.freno        || '',
    familia:      parseInt(req.body.familia) || 3,
    logro:        req.body.logro        || '',
    aprendizaje:  req.body.aprendizaje  || '',
    diferente:    req.body.diferente    || '',
    satisfaccion:    parseInt(req.body.satisfaccion)    || 5,
    claridad_cierre: parseInt(req.body.claridad_cierre) || 5,
    enfoque:         parseInt(req.body.enfoque)         || 5,
  };
  db.upsertReflexion(data);
  if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
    return res.json({ ok: true });
  }
  res.redirect('/reflexion');
});

router.get('/metricas', (req, res) => {
  const today = db.todayStr();
  const d30 = new Date(); d30.setDate(d30.getDate() - 29);
  const start30 = d30.toISOString().split('T')[0];
  const reflexiones = db.getReflexionesRange(start30, today);

  if (reflexiones.length === 0) {
    return res.render('reflexion-metricas', {
      reflexiones: [], page: 'reflexion',
      stats: null, chartData: '{}', patrones: null, logros: [], aprendizajes: [], calendario: []
    });
  }

  const avg = f => (reflexiones.reduce((s,r) => s + (r[f]||0), 0) / reflexiones.length).toFixed(1);

  // Racha consecutiva
  let racha = 0;
  for (let i = 0; i < 30; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ds = d.toISOString().split('T')[0];
    if (reflexiones.find(r => r.fecha === ds)) racha++;
    else break;
  }

  // Mejor y peor día
  const sorted = [...reflexiones].sort((a,b) => (b.satisfaccion||0) - (a.satisfaccion||0));
  const mejorDia = sorted[0] || null;
  const peorDia  = sorted[sorted.length-1] || null;

  // Tendencia
  const n = Math.min(5, Math.floor(reflexiones.length / 2));
  const avgIni = reflexiones.slice(0,n).reduce((s,r)=>s+(r.satisfaccion||0),0)/n;
  const avgFin = reflexiones.slice(-n).reduce((s,r)=>s+(r.satisfaccion||0),0)/n;
  const tendencia = reflexiones.length >= 4 ? (avgFin - avgIni).toFixed(1) : null;

  // Ranking opciones
  function rankear(campo) {
    const cnt = {};
    reflexiones.forEach(r => { if(r[campo]) cnt[r[campo]] = (cnt[r[campo]]||0)+1; });
    return Object.entries(cnt).sort((a,b)=>b[1]-a[1]).map(([k,v])=>({
      label:k, count:v, pct: Math.round(v/reflexiones.length*100)
    }));
  }

  // Logros y aprendizajes
  const logros = reflexiones
    .filter(r => r.logro && r.logro.trim().length > 5)
    .sort((a,b) => (b.satisfaccion||0) - (a.satisfaccion||0))
    .slice(0, 6);
  const aprendizajes = reflexiones
    .filter(r => r.aprendizaje && r.aprendizaje.trim().length > 5)
    .slice(-5).reverse();

  // Calendario 30 días
  const mapRef = {};
  reflexiones.forEach(r => { mapRef[r.fecha] = r; });
  const calendario = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate()-i);
    const ds = d.toISOString().split('T')[0];
    const ref = mapRef[ds] || null;
    const sat = ref ? ref.satisfaccion : null;
    calendario.push({
      date:ds, dayNum:d.getDate(), dow:d.getDay(), ref, sat,
      color: !ref?'var(--border)':sat>=8?'#22c55e':sat>=6?'#4ade80':sat>=4?'#f59e0b':'#ef4444',
    });
  }

  const chartData = JSON.stringify({
    labels:       reflexiones.map(r=>r.fecha.slice(5)),
    satisfaccion: reflexiones.map(r=>r.satisfaccion||0),
    enfoque:      reflexiones.map(r=>r.enfoque||0),
    claridad:     reflexiones.map(r=>r.claridad_cierre||0),
  });

  const stats = {
    total: reflexiones.length,
    pct30: Math.round(reflexiones.length/30*100),
    racha,
    avgSat:avg('satisfaccion'), avgEnf:avg('enfoque'),
    avgClar:avg('claridad_cierre'), avgFam:avg('familia'),
    mejorDia, peorDia, tendencia,
    diasAltos: reflexiones.filter(r=>(r.satisfaccion||0)>=7).length,
    diasBajos: reflexiones.filter(r=>(r.satisfaccion||0)<=4).length,
  };

  res.render('reflexion-metricas', {
    page:'reflexion', reflexiones, stats, chartData,
    patrones:{ energia_roba:rankear('energia_roba'), energia_da:rankear('energia_da'), freno:rankear('freno') },
    logros, aprendizajes, calendario,
  });
});

module.exports = router;
