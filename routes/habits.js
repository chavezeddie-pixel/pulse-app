const express = require('express');
const router = express.Router();
const db = require('../database');

function calcularDiagnostico(buenosHabitos, malosHabitos, completados, logMalos) {
  const scoresBH = buenosHabitos.map(h => {
    const completado = completados.includes(h.id);
    return completado ? 10 : 0;
  });

  const scoresMH = malosHabitos.map(h => {
    const log = logMalos.find(l => l.malo_id === h.id);
    return log ? log.score || 5 : 10;
  });

  const todosScores = [...scoresBH, ...scoresMH];
  const scoreDiario = todosScores.length > 0
    ? Math.round(todosScores.reduce((s,v) => s+v, 0) / todosScores.length * 10) / 10
    : 0;

  let estado, color, mensaje;
  if (scoreDiario >= 9) {
    estado = 'Optimo'; color = 'green';
    mensaje = 'Tu cuerpo esta en equilibrio metabolico. Sigue asi.';
  } else if (scoreDiario >= 7) {
    estado = 'Estable'; color = 'amber';
    mensaje = 'Funcionamiento normal, pero con fugas de energia menores.';
  } else if (scoreDiario >= 4) {
    estado = 'Riesgo'; color = 'orange';
    mensaje = 'Desequilibrio sistemico. Tu cuerpo esta compensando.';
  } else {
    estado = 'Alerta'; color = 'red';
    mensaje = 'Agotamiento cronico. Riesgo de enfermedad alto.';
  }

  const todosHabitos = [
    ...buenosHabitos.map((h,i) => ({ nombre: h.name, score: scoresBH[i], tipo: 'bueno' })),
    ...malosHabitos.map((h,i) => ({ nombre: h.name, score: scoresMH[i], tipo: 'malo' })),
  ];
  const fuga = todosHabitos.sort((a,b) => a.score - b.score)[0];

  const diagnosticos = [];
  const accion_correctiva = [];

  const sueno = buenosHabitos.find(h => h.name.toLowerCase().includes('sue') || h.name.toLowerCase().includes('dorm'));
  const ejercicio = buenosHabitos.find(h => h.name.toLowerCase().includes('ejercicio') || h.name.toLowerCase().includes('deporte'));
  const alimentacion = buenosHabitos.find(h => h.name.toLowerCase().includes('aliment') || h.name.toLowerCase().includes('comi') || h.name.toLowerCase().includes('dieta'));
  const pantallas = malosHabitos.find(h => h.name.toLowerCase().includes('pantalla') || h.name.toLowerCase().includes('celular') || h.name.toLowerCase().includes('movil'));
  const procrastinacion = malosHabitos.find(h => h.name.toLowerCase().includes('procrastin'));

  const scoreSueno = sueno ? (completados.includes(sueno.id) ? 10 : 2) : null;
  const scoreEjercicio = ejercicio ? (completados.includes(ejercicio.id) ? 10 : 2) : null;
  const scoreAlimentacion = alimentacion ? (completados.includes(alimentacion.id) ? 10 : 2) : null;
  const scorePantallas = pantallas ? (logMalos.find(l => l.malo_id === pantallas.id)?.score || 5) : null;
  const scoreProcrastinacion = procrastinacion ? (logMalos.find(l => l.malo_id === procrastinacion.id)?.score || 5) : null;

  if (scoreSueno !== null && scoreSueno < 5 && scorePantallas !== null && scorePantallas < 4) {
    diagnosticos.push('Impacto neurologico detectado: la falta de sueno combinada con el exceso de pantallas esta afectando tu sistema nervioso y capacidad de concentracion.');
    accion_correctiva.push('Apaga el movil 1 hora antes de dormir y bebe 500ml de agua extra para limpiar toxinas.');
  }

  if (scoreEjercicio !== null && scoreEjercicio > 8 && scoreAlimentacion !== null && scoreAlimentacion < 4) {
    diagnosticos.push('Riesgo de catabolismo muscular: estas entrenando fuerte sin darle a tu cuerpo los nutrientes necesarios para recuperarse.');
    accion_correctiva.push('Come una fuente de proteina dentro de los 30 minutos despues del ejercicio.');
  }

  if (scoreSueno !== null && scoreSueno < 5 && scoreEjercicio !== null && scoreEjercicio > 8) {
    diagnosticos.push('Sobreentrenamiento detectado: estas estresando tu corazon y musculos sin darles descanso suficiente.');
    accion_correctiva.push('Reduce la intensidad del ejercicio hoy y prioriza dormir al menos 7 horas esta noche.');
  }

  if (scoreProcrastinacion !== null && scoreProcrastinacion < 3 && scorePantallas !== null && scorePantallas < 3) {
    diagnosticos.push('Secuestro dopaminergico: tu cerebro esta buscando estimulos faciles, lo que bloquea tu voluntad y capacidad de enfoque profundo.');
    accion_correctiva.push('Pon el telefono en otra habitacion por 2 horas y trabaja en bloques de 25 minutos sin interrupciones.');
  }

  if (diagnosticos.length === 0) {
    if (scoreDiario >= 7) {
      diagnosticos.push('Tu estilo de vida hoy muestra buena consistencia. Los habitos positivos estan generando un ambiente favorable para tu metabolismo y energia.');
      accion_correctiva.push('Mantén tu rutina actual y enfocate en el habito con menor score hoy.');
    } else {
      diagnosticos.push('Hay desequilibrios en tu estilo de vida de hoy. Identifica el habito mas debil y trabaja en el manana.');
      accion_correctiva.push('Elige un solo habito para mejorar manana y comprometete con el.');
    }
  }

  return {
    scoreDiario,
    estado,
    color,
    mensaje,
    fuga: fuga || null,
    diagnostico: diagnosticos.join(' '),
    accion: accion_correctiva[0] || '',
  };
}

router.get('/', (req, res) => {
  const today = db.todayStr();
  const habits = db.getAllHabits();
  const malos  = db.getMalosHabitos();
  const completados = db.getCompletedHabitsForDate(today);
  const logMalos    = db.getMalosHabitosLog(today);

  // Build 14-day date array
  const last14 = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today); d.setDate(d.getDate() - (13 - i));
    return d.toISOString().split('T')[0];
  });

  const habitsConStats = habits.map(h => {
    const streak  = db.getHabitStreak(h.id);
    const rate7   = db.getHabitCompletionRate(h.id, 7);
    const rate30  = db.getHabitCompletionRate(h.id, 30);
    const doneDates = new Set(db.getHabitCompletionDates(h.id));
    const grid14  = last14.map(d => doneDates.has(d));
    return { ...h, completadoHoy: completados.includes(h.id), streak, rate7, rate30, grid14 };
  });

  // Global stats
  const completadosHoy = habitsConStats.filter(h => h.completadoHoy).length;
  const mejorRacha     = habitsConStats.reduce((mx, h) => Math.max(mx, h.streak), 0);
  const rachaMedia     = habitsConStats.length
    ? Math.round(habitsConStats.reduce((s, h) => s + h.streak, 0) / habitsConStats.length)
    : 0;
  const pctSemana = habitsConStats.length
    ? Math.round(habitsConStats.reduce((s, h) => s + h.rate7, 0) / habitsConStats.length)
    : 0;

  // Top 3 rachas
  const topRachas = [...habitsConStats]
    .filter(h => h.streak > 0)
    .sort((a, b) => b.streak - a.streak)
    .slice(0, 4);

  // Área breakdown
  const areaMap = {};
  habitsConStats.forEach(h => {
    if (!areaMap[h.area]) areaMap[h.area] = { total: 0, done: 0 };
    areaMap[h.area].total++;
    if (h.completadoHoy) areaMap[h.area].done++;
  });
  const areaBars = Object.entries(areaMap).map(([area, v]) => ({
    area, total: v.total, done: v.done,
    pct: Math.round(v.done / v.total * 100),
  }));

  const malosConScore = malos.map(m => ({
    ...m,
    scoreHoy: (logMalos.find(l => l.malo_id === m.id) || {}).score || null,
  }));

  const diagnostico = calcularDiagnostico(habits, malos, completados, logMalos);

  res.render('habits', {
    habits: habitsConStats,
    malos: malosConScore,
    today,
    page: 'habits',
    diagnostico,
    completadosHoy,
    mejorRacha,
    rachaMedia,
    pctSemana,
    topRachas,
    areaBars,
    last14,
  });
});

router.post('/', (req, res) => {
  const { name, area } = req.body;
  if (name && name.trim()) db.createHabit(name.trim(), area || 'general');
  res.redirect('/habits');
});

router.post('/:id/toggle', (req, res) => {
  const id = parseInt(req.params.id);
  const date = req.body.date || db.todayStr();
  db.toggleHabitCompletion(id, date);
  if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
    const completados = db.getCompletedHabitsForDate(date);
    return res.json({ ok: true, completado: completados.includes(id) });
  }
  res.redirect('/habits');
});

router.post('/:id/edit', (req, res) => {
  db.updateHabit(parseInt(req.params.id), req.body.name, req.body.area);
  res.redirect('/habits');
});

router.delete('/:id', (req, res) => {
  db.deleteHabit(parseInt(req.params.id));
  res.redirect('/habits');
});

router.post('/malo/nuevo', (req, res) => {
  const { name, categoria, impacto } = req.body;
  if (name && name.trim()) db.createMaloHabito(name.trim(), categoria || 'general', parseInt(impacto) || 5);
  res.redirect('/habits');
});

router.post('/malo/:id/score', (req, res) => {
  const fecha = req.body.fecha || db.todayStr();
  const score = parseInt(req.body.score) || 5;
  const maloId = parseInt(req.params.id);
  const dbRaw = db.getDB();
  const ex = dbRaw.prepare('SELECT id FROM malos_habitos_log WHERE malo_id=? AND fecha=?').get(maloId, fecha);
  if (ex) {
    dbRaw.prepare('UPDATE malos_habitos_log SET veces=?, score=? WHERE malo_id=? AND fecha=?').run(score, score, maloId, fecha);
  } else {
    dbRaw.prepare('INSERT INTO malos_habitos_log (malo_id, fecha, veces, score) VALUES (?,?,?,?)').run(maloId, fecha, score, score);
  }
  if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
    return res.json({ ok: true, score });
  }
  res.redirect('/habits');
});

router.delete('/malo/:id', (req, res) => {
  db.deleteMaloHabito(parseInt(req.params.id));
  res.redirect('/habits');
});

module.exports = router;