const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/', (req, res) => {
  const today    = db.todayStr();
  const weekStart = db.weekStartStr();
  const monthYear = db.currentMonthYear();

  // Período seleccionado (7 o 30 días)
  const dias = parseInt(req.query.dias) || 7;
  const dStart = new Date(); dStart.setDate(dStart.getDate() - (dias - 1));
  const startStr = dStart.toISOString().split('T')[0];

  const checkinsReal   = db.getCheckinsRange(startStr, today);
  const checkins7Real  = db.getCheckinsRange((() => { const d=new Date(); d.setDate(d.getDate()-6); return d.toISOString().split('T')[0]; })(), today);
  const checkins30Real = db.getCheckinsRange((() => { const d=new Date(); d.setDate(d.getDate()-29); return d.toISOString().split('T')[0]; })(), today);

  // Función: rellenar días sin registro con valores neutros (5) sin tocar la BD
  function fillNeutral(realArr, numDias) {
    const map = {};
    realArr.forEach(c => { map[c.date] = c; });
    const filled = [];
    for (let i = numDias - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = d.toISOString().split('T')[0];
      filled.push(map[ds] || {
        date: ds, energy: 5, mood: 5, clarity: 5, anxiety: 5,
        sleep_hours: 7, did_exercise: 0, did_study: 0, completed_main: 0,
        _neutral: true, // marca para saber que es estimado
      });
    }
    return filled;
  }

  const checkins   = fillNeutral(checkinsReal, dias);
  const checkins7  = fillNeutral(checkins7Real, 7);
  const checkins30 = fillNeutral(checkins30Real, 30);

  const habits     = db.getAllHabits();
  const weeklyObjs = db.getWeeklyObjectives(weekStart);
  const monthlyObjs = db.getMonthlyObjectives(monthYear);

  // Stats por hábito
  const habitStats = habits.map(h => {
    const dates = db.getHabitCompletionDates(h.id); // array de fechas completadas
    // últimos 28 días para el mini grid
    const grid = [];
    for (let i = 27; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = d.toISOString().split('T')[0];
      grid.push({ date: ds, done: dates.includes(ds) });
    }
    return {
      id: h.id, nombre: h.name, area: h.area,
      racha:   db.getHabitStreak(h.id),
      rate7:   db.getHabitCompletionRate(h.id, 7),
      rate30:  db.getHabitCompletionRate(h.id, 30),
      grid,
    };
  });

  const fortalezas  = [...habitStats].sort((a,b) => b.rate7 - a.rate7).slice(0, 5);
  const debilidades = [...habitStats].sort((a,b) => a.rate7 - b.rate7).filter(h => h.rate7 < 70).slice(0, 5);
  const mejorRacha  = habitStats.length ? Math.max(...habitStats.map(h => h.racha)) : 0;
  const mejorRachaNombre = habitStats.find(h => h.racha === mejorRacha);
  const habitosConsistentes = habitStats.filter(h => h.rate7 >= 70).length;

  // Promedios del período
  const avgOf = (arr, f) => arr.length ? (arr.reduce((s,c) => s + (c[f]||0), 0) / arr.length).toFixed(1) : '—';
  const avgEnergia  = avgOf(checkins, 'energy');
  const avgAnimo    = avgOf(checkins, 'mood');
  const avgClarity  = avgOf(checkins, 'clarity');
  const avgAnsiedad = avgOf(checkins, 'anxiety');
  const avgSueno    = avgOf(checkins, 'sleep_hours');
  const exerciseDays = checkins.filter(c => c.did_exercise).length;
  const studyDays    = checkins.filter(c => c.did_study).length;

  // Score de bienestar 0-100
  const bienestar = checkins.length
    ? Math.round((parseFloat(avgEnergia)*10 + parseFloat(avgAnimo)*10 + parseFloat(avgClarity)*10 + (10 - parseFloat(avgAnsiedad))*10) / 4)
    : null;

  // Tendencia energía
  const eTrend = checkins.length >= 2 ? checkins[checkins.length-1].energy - checkins[0].energy : 0;
  const aTrend = checkins.length >= 2 ? checkins[checkins.length-1].anxiety - checkins[0].anxiety : 0;

  // Objetivos
  const objTotal      = weeklyObjs.length + monthlyObjs.length;
  const objCompletados = weeklyObjs.filter(o => o.status==='completado').length + monthlyObjs.filter(o => o.status==='completado').length;

  // Tendencias detalladas
  const tendencias = [];
  if (checkins.length >= 3) {
    if (eTrend > 0)       tendencias.push({ label:'Energía',   icono:'📈', texto:`Subiendo +${eTrend} pts esta semana`,     tipo:'up' });
    else if (eTrend < 0)  tendencias.push({ label:'Energía',   icono:'📉', texto:`Bajando ${eTrend} pts — revisa rutina`,   tipo:'down' });
    else                   tendencias.push({ label:'Energía',   icono:'➡️', texto:`Estable en ${avgEnergia}/10`,             tipo:'ok' });
    if (aTrend > 1)        tendencias.push({ label:'Ansiedad',  icono:'⚠️', texto:`Aumentando — identifica la fuente`,       tipo:'down' });
    else if (aTrend < -1)  tendencias.push({ label:'Ansiedad',  icono:'✅', texto:`Bajando — vas en buen camino`,            tipo:'up' });
    else                   tendencias.push({ label:'Ansiedad',  icono:'➡️', texto:`Estable en ${avgAnsiedad}/10`,            tipo:'ok' });
    const exPct = Math.round(exerciseDays / checkins.length * 100);
    if (exPct >= 60)       tendencias.push({ label:'Ejercicio', icono:'💪', texto:`${exerciseDays} días (${exPct}%) — excelente`, tipo:'up' });
    else if (exPct === 0)  tendencias.push({ label:'Ejercicio', icono:'❌', texto:`Sin ejercicio esta semana`,               tipo:'down' });
    else                   tendencias.push({ label:'Ejercicio', icono:'⚡', texto:`${exerciseDays} días — puedes mejorar`,   tipo:'warn' });
    const stPct = Math.round(studyDays / checkins.length * 100);
    if (stPct >= 60)       tendencias.push({ label:'Estudio',   icono:'📚', texto:`${studyDays} días (${stPct}%) — constante`, tipo:'up' });
    else if (stPct === 0)  tendencias.push({ label:'Estudio',   icono:'❌', texto:`Sin estudio esta semana`,                tipo:'down' });
    else                   tendencias.push({ label:'Estudio',   icono:'📖', texto:`${studyDays} días — mantén el ritmo`,    tipo:'warn' });
    if (parseFloat(avgSueno) < 6.5) tendencias.push({ label:'Sueño', icono:'😴', texto:`Promedio ${avgSueno}h — por debajo del óptimo`, tipo:'down' });
    else                   tendencias.push({ label:'Sueño',     icono:'😴', texto:`Promedio ${avgSueno}h — aceptable`,       tipo:'ok' });
  }

  // Recomendaciones mejoradas
  const recomendaciones = [];
  if (debilidades.length > 0 && debilidades[0].rate7 < 40) recomendaciones.push(`Refuerza "${debilidades[0].nombre}" — solo ${debilidades[0].rate7}% de consistencia en 7 días. Ponlo como hábito ancla.`);
  if (parseFloat(avgSueno) < 6.5) recomendaciones.push(`Sueño promedio ${avgSueno}h. Acuéstate 30 min antes esta semana — es la palanca más fácil.`);
  if (parseFloat(avgAnsiedad) > 6) recomendaciones.push(`Ansiedad alta (${avgAnsiedad}/10). Añade 10 min de descompresión al final del día.`);
  if (exerciseDays === 0 && checkins.length >= 3) recomendaciones.push(`Sin ejercicio en ${checkins.length} días. Empieza con 20 minutos — mejora energía y ánimo directamente.`);
  if (studyDays === 0 && checkins.length >= 3) recomendaciones.push(`Sin estudio esta semana. Reserva 30 min fijos cada día — a la misma hora.`);
  if (fortalezas.length > 0 && fortalezas[0].rate7 >= 70) recomendaciones.push(`Mantén "${fortalezas[0].nombre}" — tu hábito más consistente (${fortalezas[0].rate7}% · ${fortalezas[0].racha}d racha).`);
  if (eTrend >= 2) recomendaciones.push(`Energía subiendo +${eTrend} pts. Identifica qué lo está causando y repítelo.`);
  if (recomendaciones.length === 0) recomendaciones.push('Sigue registrando tu chequeo diario para recibir recomendaciones personalizadas.');

  // Chart data
  const chartData = JSON.stringify({
    labels:  checkins.map(c => c.date.slice(5)),
    energy:  checkins.map(c => c.energy),
    mood:    checkins.map(c => c.mood),
    clarity: checkins.map(c => c.clarity),
    anxiety: checkins.map(c => c.anxiety),
    sleep:   checkins.map(c => c.sleep_hours),
  });

  // Chart hábitos (barras de consistencia)
  const chartHabits = JSON.stringify({
    labels: habitStats.map(h => h.nombre.length > 14 ? h.nombre.slice(0,14)+'…' : h.nombre),
    rate7:  habitStats.map(h => h.rate7),
    rate30: habitStats.map(h => h.rate30),
  });

  res.render('mejora', {
    page: 'mejora', dias, chartData, chartHabits,
    checkins, checkins7, checkins30,
    weeklyObjs, monthlyObjs,
    mejora: {
      fortalezas, debilidades, tendencias, recomendaciones,
      mejorRacha, mejorRachaNombre,
      habitosConsistentes, totalHabitos: habits.length,
      avgEnergia, avgAnimo, avgClarity, avgAnsiedad, avgSueno,
      exerciseDays, studyDays, objCompletados, objTotal,
      habitStats, bienestar, eTrend, aTrend,
    }
  });
});

module.exports = router;
