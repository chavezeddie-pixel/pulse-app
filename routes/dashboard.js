const express = require('express');
const router  = express.Router();
const db      = require('../database');

function quickInsight(data) {
  const c       = data.todayCheckin;
  const habits  = data.habits || [];
  const completed = data.completedToday || [];
  const habPct  = habits.length ? Math.round(completed.length / habits.length * 100) : null;
  const wc      = data.weekCheckins || [];
  const avgE    = wc.length ? (wc.reduce((s,x) => s+x.energy, 0) / wc.length).toFixed(1) : null;

  if (!c) return { texto: 'Sin chequeo registrado hoy — registra tu estado para ver el análisis.', tipo: 'neutro' };
  if (c.anxiety >= 8) return { texto: `Ansiedad alta hoy (${c.anxiety}/10). Considera reducir estímulos y hacer una pausa consciente.`, tipo: 'alerta' };
  if (c.sleep_hours < 6) return { texto: `Solo ${c.sleep_hours}h de sueño — todo rinde menos. Esta noche prioriza el descanso por encima de todo.`, tipo: 'alerta' };
  if (c.energy >= 8) return { texto: `Energía alta hoy (${c.energy}/10). Perfecto para atacar lo más difícil pendiente.`, tipo: 'positivo' };
  if (habPct !== null && habPct >= 80) return { texto: `${completed.length}/${habits.length} hábitos completados (${habPct}%). Buen ritmo — mantén el impulso.`, tipo: 'positivo' };
  if (c.energy <= 4) return { texto: `Energía baja (${c.energy}/10). Elige solo 1 tarea clave hoy y no te disperses.`, tipo: 'alerta' };
  if (wc.length >= 3 && avgE && parseFloat(avgE) >= 7) return { texto: `Semana sólida: energía promedio ${avgE}/10 en ${wc.length} días. Consistencia que da resultados.`, tipo: 'positivo' };
  if (habPct !== null) return { texto: `${completed.length}/${habits.length} hábitos hoy · Energía ${c.energy}/10 · Ánimo ${c.mood}/10.`, tipo: 'neutro' };
  return { texto: `Energía ${c.energy}/10, ánimo ${c.mood}/10, sueño ${c.sleep_hours}h. Sigue registrando para ver tendencias.`, tipo: 'neutro' };
}

router.get('/', (req, res) => {
  try {
    const data = db.getDashboardData();

    // Racha de check-ins (días consecutivos con registro)
    const today = data.today;
    let checkinRacha = 0;
    for (let i = 0; i < 60; i++) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const ds = d.toISOString().split('T')[0];
      if (db.getCheckin(ds)) checkinRacha++;
      else break;
    }

    // Próximas tareas (los próximos 5 días)
    let proximasTareas = [];
    try {
      const dbRaw = db.getDB();
      const manana = new Date(today); manana.setDate(manana.getDate() + 1);
      const d7    = new Date(today); d7.setDate(d7.getDate() + 7);
      proximasTareas = dbRaw.prepare(
        `SELECT * FROM objetivos_dia WHERE fecha >= ? AND fecha <= ? AND completado = 0 ORDER BY fecha ASC, hora ASC LIMIT 6`
      ).all(manana.toISOString().split('T')[0], d7.toISOString().split('T')[0]);
    } catch(e) {}

    // Malos hábitos data enriquecida
    const malosHabitos = db.getMalosHabitos ? db.getMalosHabitos() : [];
    const malosConHoy  = malosHabitos.map(m => ({
      ...m,
      vecesHoy: (data.malosHoy?.find(l => l.malo_id === m.id) || {}).veces || 0,
    }));
    const totalCaidasHoy = malosConHoy.reduce((s, m) => s + m.vecesHoy, 0);

    const coachInsight = quickInsight(data);

    res.render('dashboard', {
      ...data,
      page: 'dashboard',
      coachInsight,
      checkinRacha,
      proximasTareas,
      malosConHoy,
      totalCaidasHoy,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send(err.message);
  }
});

module.exports = router;
