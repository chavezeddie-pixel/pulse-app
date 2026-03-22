const express = require('express');
const router = express.Router();
const db = require('../database');
const fs = require('fs');
const path = require('path');

const DIAS_KEY = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
const DIAS_LABEL = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

function cargarRutina() {
  const rutinaPath = db.getActiveRutinaPath();
  try { return JSON.parse(fs.readFileSync(rutinaPath, 'utf8')); } catch(e) { return {}; }
}

// ─── CONTEXTO COMPLETO ───────────────────────────────────────────────────────

function buildContext(today) {
  const dbRaw = db.getDB ? db.getDB() : null;

  const checkin       = db.getCheckin(today);
  const habits        = db.getAllHabits();
  const completedToday = db.getCompletedHabitsForDate(today);
  const weekStart     = db.weekStartStr();
  const weeklyObjs    = db.getWeeklyObjectives(weekStart);
  const perfil        = db.getPerfil();
  const malosHabitos  = db.getMalosHabitos();
  const malosLog      = db.getMalosHabitosLog(today);

  // Últimos 7 días de checkins
  const d7 = new Date(); d7.setDate(d7.getDate() - 6);
  const start7 = d7.toISOString().split('T')[0];
  const checkins7 = db.getCheckinsRange(start7, today);

  // Reflexiones
  const ayer = new Date(); ayer.setDate(ayer.getDate() - 1);
  const ayerStr = ayer.toISOString().split('T')[0];
  const reflexionAyer = db.getReflexion(ayerStr);
  const reflexionHoy  = db.getReflexion(today);

  // Últimas 7 reflexiones
  const d14 = new Date(); d14.setDate(d14.getDate() - 13);
  const reflexiones7 = (() => { try { return db.getReflexionesRange(d14.toISOString().split('T')[0], today); } catch(e) { return []; } })();

  // Rutina
  const rutina = cargarRutina();
  const diaHoy = DIAS_KEY[new Date().getDay()];
  const bloquesHoy = rutina[diaHoy] || [];
  const completionsHoy = db.getRutinaCompletions(today);
  const bloquesCompletados = bloquesHoy.filter(b => completionsHoy.includes(diaHoy + '|' + b.inicio));

  // Objetivos mensuales
  const mesActual = db.currentMonthYear ? db.currentMonthYear() : today.slice(0, 7);
  const monthlyObjs = (() => { try { return db.getMonthlyObjectives(mesActual); } catch(e) { return []; } })();

  // Tareas de hoy (agenda)
  const tareasHoy = (() => {
    try {
      const raw = db.getDB();
      return raw.prepare(`SELECT * FROM objetivos_dia WHERE fecha = ? ORDER BY completado ASC, hora ASC, id ASC`).all(today);
    } catch(e) { return []; }
  })();

  // Próximas tareas (agenda próximos 7 días)
  const proximasTareas = (() => {
    try {
      const raw = db.getDB();
      const d7f = new Date(); d7f.setDate(d7f.getDate() + 7);
      return raw.prepare(
        `SELECT * FROM objetivos_dia WHERE fecha > ? AND fecha <= ? AND completado = 0 ORDER BY fecha ASC, hora ASC LIMIT 15`
      ).all(today, d7f.toISOString().split('T')[0]);
    } catch(e) { return []; }
  })();

  // Notas recientes
  const notas = (() => {
    try {
      const todas = db.getAllNotas();
      return todas.slice(0, 10); // últimas 10
    } catch(e) { return []; }
  })();

  // Stats de hábitos
  const habitStats = habits.map(h => ({
    id: h.id,
    nombre: h.name,
    area: h.area,
    completadoHoy: completedToday.includes(h.id),
    racha: db.getHabitStreak(h.id),
    consistencia7d:  db.getHabitCompletionRate(h.id, 7),
    consistencia30d: db.getHabitCompletionRate(h.id, 30),
  }));

  return {
    checkin, habits, habitStats, completedToday,
    weeklyObjs, monthlyObjs,
    perfil, malosHabitos, malosLog,
    checkins7, bloquesHoy, bloquesCompletados,
    reflexionAyer, reflexionHoy, reflexiones7,
    tareasHoy, proximasTareas, notas,
    diaHoy,
  };
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function avg(arr, field) {
  if (!arr || !arr.length) return 0;
  return arr.reduce((s, c) => s + (c[field] || 0), 0) / arr.length;
}

function fmtFecha(f) {
  if (!f) return '';
  const parts = f.split('-');
  return parts[2] + '/' + parts[1];
}

// ─── METRIC TAG HELPERS ──────────────────────────────────────────────────────
// Sintaxis especial que el frontend convierte a HTML visual:
//   [[M:label:value:color]]   → pill de métrica
//   [[BAR:label:pct:color]]   → barra de progreso
//   [[RX:texto]]              → bloque prescripción
//   [[ALERT:texto]]           → bloque alerta
//   [[OK:texto]]              → bloque positivo

function M(label, value, color) {
  return `[[M:${label}:${value}:${color || 'muted'}]]`;
}
function BAR(label, pct, color) {
  return `[[BAR:${label}:${Math.round(pct)}:${color || 'accent'}]]`;
}
function RX(text)    { return `[[RX:${text}]]`; }
function ALERT(text) { return `[[ALERT:${text}]]`; }
function OK(text)    { return `[[OK:${text}]]`; }

function colorVal(v, good, bad) {
  return v >= good ? 'green' : v >= bad ? 'amber' : 'red';
}

// ─── MOTOR DE ANÁLISIS ───────────────────────────────────────────────────────

function generarAnalisis(ctx, tipo, pregunta) {
  const {
    checkin, habitStats, checkins7, weeklyObjs, monthlyObjs,
    perfil, malosHabitos, malosLog,
    bloquesHoy, bloquesCompletados,
    reflexionAyer, reflexionHoy, reflexiones7,
    tareasHoy, proximasTareas, notas,
    diaHoy,
  } = ctx;

  // ── métricas base ──
  const habComp    = habitStats.filter(h => h.completadoHoy).length;
  const habTotal   = habitStats.length;
  const habPct     = habTotal ? Math.round(habComp / habTotal * 100) : null;
  const habFuertes = habitStats.filter(h => h.consistencia7d >= 70);
  const habDebiles = habitStats.filter(h => h.consistencia7d < 40);
  const habRacha0  = habitStats.filter(h => h.racha === 0);
  const mejorRacha = habitStats.reduce((best, h) => h.racha > (best ? best.racha : 0) ? h : best, null);
  const rutPct     = bloquesHoy.length ? Math.round(bloquesCompletados.length / bloquesHoy.length * 100) : null;
  const objSemanComp  = weeklyObjs.filter(o => o.status === 'completado').length;
  const objSemanTotal = weeklyObjs.length;
  const objMesComp    = monthlyObjs.filter(o => o.status === 'completado').length;
  const objMesTotal   = monthlyObjs.length;
  const avgE  = checkins7.length ? avg(checkins7, 'energy').toFixed(1) : null;
  const avgM  = checkins7.length ? avg(checkins7, 'mood').toFixed(1) : null;
  const avgA  = checkins7.length ? avg(checkins7, 'anxiety').toFixed(1) : null;
  const avgS  = checkins7.length ? avg(checkins7, 'sleep_hours').toFixed(1) : null;
  const exDays = checkins7.filter(c => c.did_exercise).length;
  const stDays = checkins7.filter(c => c.did_study).length;
  const eTrend = checkins7.length >= 2 ? checkins7[checkins7.length-1].energy - checkins7[0].energy : 0;
  const tareasPend = tareasHoy.filter(t => !t.completado);
  const tareasComp = tareasHoy.filter(t => t.completado);

  // ─── ANÁLISIS COMPLETO DEL DÍA ───────────────────────────────────────────
  if (tipo === 'analisis') {
    const lines = [];

    lines.push('ESTADO GENERAL');
    if (!checkin) {
      lines.push(ALERT('Sin chequeo de hoy — sin datos de energía ni ánimo.'));
      if (checkins7.length >= 3) {
        lines.push(M('Energía media', avgE + '/10', colorVal(parseFloat(avgE),7,4)));
        lines.push(M('Ánimo medio',   avgM + '/10', colorVal(parseFloat(avgM),7,4)));
      }
    } else {
      // Pills de estado de hoy en una línea
      lines.push([
        M('Energía', checkin.energy + '/10', colorVal(checkin.energy,7,4)),
        M('Ánimo',   checkin.mood   + '/10', colorVal(checkin.mood,7,4)),
        M('Sueño',   checkin.sleep_hours + 'h', checkin.sleep_hours>=7?'green':checkin.sleep_hours>=6?'amber':'red'),
        M('Ansiedad',checkin.anxiety + '/10', checkin.anxiety<=3?'green':checkin.anxiety<=6?'amber':'red'),
      ].join(' '));
      if (checkins7.length >= 3) {
        const tendIcon = eTrend > 1 ? '↑' : eTrend < -1 ? '↓' : '→';
        lines.push([
          M('Media 7d ⚡', avgE + ' ' + tendIcon, colorVal(parseFloat(avgE),7,4)),
          M('Sueño 7d',    avgS + 'h', parseFloat(avgS)>=7?'green':parseFloat(avgS)>=6?'amber':'red'),
          M('Ansiedad 7d', avgA + '/10', parseFloat(avgA)<=3?'green':parseFloat(avgA)<=6?'amber':'red'),
        ].join(' '));
      }
    }
    if (tareasHoy.length > 0) {
      lines.push(BAR('Agenda hoy', tareasComp.length / tareasHoy.length * 100, tareasComp.length === tareasHoy.length ? 'green' : 'amber'));
    }
    lines.push('');

    lines.push('PUNTOS FUERTES');
    if (mejorRacha && mejorRacha.racha >= 3) {
      lines.push(OK(`${mejorRacha.nombre}: racha de ${mejorRacha.racha} días 🔥`));
    }
    if (habTotal > 0) {
      lines.push(BAR('Hábitos hoy', habPct, habPct >= 70 ? 'green' : habPct >= 40 ? 'amber' : 'red'));
    }
    if (habFuertes.length) {
      lines.push('Hábitos sólidos (≥70%): ' + habFuertes.map(h => `${h.nombre} ${M('', h.consistencia7d+'%', 'green')}`).join(', '));
    }
    if (rutPct !== null) {
      lines.push(BAR('Rutina hoy', rutPct, rutPct >= 70 ? 'green' : rutPct >= 40 ? 'amber' : 'red'));
    }
    if (objSemanTotal > 0) {
      lines.push(BAR('Objetivos semana', objSemanComp / objSemanTotal * 100, objSemanComp === objSemanTotal ? 'green' : 'amber'));
    }
    if (checkin && checkin.did_exercise) lines.push(OK('Ejercicio cumplido hoy ✓'));
    if (checkin && checkin.did_study)    lines.push(OK('Estudio cumplido hoy ✓'));
    if (exDays >= 4) lines.push(OK(`Ejercicio ${exDays}/${checkins7.length} días esta semana — constancia real`));
    lines.push('');

    lines.push('ÁREAS CRÍTICAS');
    let hayCriticas = false;
    if (checkin && checkin.anxiety >= 7) {
      lines.push(ALERT(`Ansiedad alta ${M('',checkin.anxiety+'/10','red')} — identifica la fuente hoy`));
      hayCriticas = true;
    }
    if (checkin && checkin.sleep_hours < 6) {
      lines.push(ALERT(`Solo ${checkin.sleep_hours}h de sueño — todo lo demás se resiente`));
      hayCriticas = true;
    }
    if (habDebiles.length) {
      lines.push(ALERT('Hábitos débiles (<40% en 7d): ' + habDebiles.map(h => h.nombre).join(', ')));
      habDebiles.forEach(h => lines.push(BAR(h.nombre, h.consistencia7d, 'red')));
      hayCriticas = true;
    }
    if (rutPct !== null && rutPct < 40) {
      lines.push(ALERT(`Rutina al ${rutPct}% — menos de la mitad completada`));
      hayCriticas = true;
    }
    if (avgA && parseFloat(avgA) >= 6) {
      lines.push(ALERT(`Ansiedad promedio alta esta semana: ${M('', avgA+'/10', 'red')}`));
      hayCriticas = true;
    }
    if (!hayCriticas) lines.push(OK('Sin áreas críticas hoy. ¡Buen trabajo, mantén el ritmo!'));
    lines.push('');

    lines.push('ACCIÓN PRIORITARIA');
    let accion = '';
    if (!checkin) {
      accion = 'Registra tu chequeo de hoy — sin datos no hay análisis real.';
    } else if (checkin.anxiety >= 7) {
      accion = 'Dedica 10 minutos a escribir qué está causando la ansiedad. Nombrarlo ya lo reduce.';
    } else if (checkin.sleep_hours < 6) {
      accion = 'Esta noche: pantallas fuera a las 22h. El sueño es la palanca número uno.';
    } else if (tareasPend.length > 0) {
      accion = `Cierra primero: "${tareasPend[0].nombre}". La tarea más urgente de tu agenda de hoy.`;
    } else if (habRacha0.length >= habTotal * 0.5 && habTotal > 0) {
      accion = `Completa ${Math.ceil(habTotal * 0.5)} hábitos hoy para no perder más terreno.`;
    } else if (objSemanTotal > 0 && objSemanComp / objSemanTotal < 0.3) {
      accion = 'Elige 1 objetivo semanal y avanza en él hoy.';
    } else if (checkin.energy < 5) {
      accion = 'Energía baja: solo la tarea más importante. El resto espera.';
    } else {
      accion = 'Buen estado hoy. Ataca la tarea más difícil en las próximas 2 horas.';
    }
    lines.push(RX(accion));
    lines.push('');

    if (checkins7.length >= 3) {
      lines.push('PATRÓN DE LA SEMANA');
      // Mini barra de ejercicio
      lines.push([
        M('Ejercicio', exDays + '/' + checkins7.length + 'd', exDays >= 4 ? 'green' : exDays >= 2 ? 'amber' : 'red'),
        M('Estudio',   stDays + '/' + checkins7.length + 'd', stDays >= 3 ? 'green' : stDays >= 1 ? 'amber' : 'red'),
        M('Ánimo med.', avgM + '/10', colorVal(parseFloat(avgM), 7, 4)),
      ].join(' '));
      let patron = '';
      if (exDays === 0) patron = `0 días de ejercicio en ${checkins7.length} registros. El cuerpo afecta al rendimiento mental.`;
      else if (parseFloat(avgS) < 6.5) patron = `Sueño promedio ${avgS}h — por debajo de lo óptimo. Ajusta el horario de acostarte.`;
      else if (eTrend <= -2) patron = `Energía bajando ${Math.abs(eTrend)} puntos. Algo te está drenando — revisa rutina y carga de trabajo.`;
      else if (eTrend >= 2) patron = `Energía subiendo +${eTrend} puntos esta semana. Lo que estás haciendo funciona.`;
      else if (parseFloat(avgA) >= 6) patron = `Ansiedad persistente (${avgA}/10 de media). Considera reducir compromisos.`;
      else patron = `Semana estable: energía ${avgE}/10, ánimo ${avgM}/10. El margen de mejora está en los hábitos débiles.`;
      lines.push(patron);
    }

    return lines.join('\n');
  }

  // ─── PREGUNTAS ESPECÍFICAS ────────────────────────────────────────────────
  const p = (pregunta || '').toLowerCase();

  // AGENDA / TAREAS
  if (/agenda|tarea|pendiente|hoy.*qué|qué.*hoy|event/.test(p)) {
    const res = [];
    if (tareasHoy.length === 0 && proximasTareas.length === 0) {
      return ALERT('No hay tareas registradas en la agenda. Añade algunas en la sección Agenda.');
    }
    if (tareasHoy.length > 0) {
      res.push(`Agenda de hoy (${DIAS_LABEL[new Date().getDay()]})`);
      res.push([
        M('Completadas', tareasComp.length + '/' + tareasHoy.length, tareasComp.length === tareasHoy.length ? 'green' : 'amber'),
        M('Pendientes', tareasPend.length + '', tareasPend.length === 0 ? 'green' : tareasPend.length <= 2 ? 'amber' : 'red'),
      ].join(' '));
      res.push(BAR('Progreso', tareasComp.length / tareasHoy.length * 100, tareasComp.length === tareasHoy.length ? 'green' : 'amber'));
      tareasHoy.slice(0, 8).forEach(t => {
        const estado = t.completado ? '✓' : '○';
        const hora = t.hora ? ` [${t.hora}]` : '';
        res.push(`${estado}${hora} ${t.nombre}`);
      });
    } else {
      res.push('Sin tareas registradas para hoy.');
    }
    if (proximasTareas.length > 0) {
      res.push('');
      res.push('Próximas:');
      proximasTareas.slice(0, 4).forEach(t => {
        res.push(`  • ${fmtFecha(t.fecha)}${t.hora ? ' ' + t.hora : ''} — ${t.nombre}`);
      });
    }
    return res.join('\n');
  }

  // TAREAS PENDIENTES
  if (/pendiente|sin completar|falta/.test(p)) {
    const pend = tareasHoy.filter(t => !t.completado);
    if (pend.length === 0) return OK('¡Todo completado hoy! No hay tareas pendientes. 🎉');
    const res = [M('Pendientes hoy', pend.length + '', pend.length <= 2 ? 'amber' : 'red')];
    pend.forEach(t => res.push(`  • ${t.hora ? '[' + t.hora + '] ' : ''}${t.nombre}`));
    return res.join('\n');
  }

  // PRÓXIMAS TAREAS
  if (/próxim|proxim|semana.*tarea|tarea.*semana|mañana/.test(p)) {
    if (proximasTareas.length === 0) return 'Sin tareas programadas para los próximos días.';
    const res = [M('Próximas tareas', proximasTareas.length + '', 'amber')];
    proximasTareas.slice(0, 8).forEach(t => {
      res.push(`  • ${fmtFecha(t.fecha)}${t.hora ? ' ' + t.hora : ''} — ${t.nombre}`);
    });
    return res.join('\n');
  }

  // OBJETIVOS
  if (/objetivo|meta/.test(p)) {
    const res = [];
    if (objSemanTotal > 0) {
      res.push(M('Semana', objSemanComp + '/' + objSemanTotal, objSemanComp === objSemanTotal ? 'green' : 'amber'));
      res.push(BAR('Objetivos semanales', objSemanComp / objSemanTotal * 100, objSemanComp === objSemanTotal ? 'green' : 'amber'));
      const pendSeman = weeklyObjs.filter(o => o.status !== 'completado');
      if (pendSeman.length) {
        pendSeman.slice(0, 4).forEach(o => res.push(`  ○ ${o.name}${o.priority ? ' [' + o.priority + ']' : ''}`));
      }
    } else {
      res.push('Sin objetivos semanales registrados.');
    }
    if (objMesTotal > 0) {
      res.push('');
      res.push(M('Mes', objMesComp + '/' + objMesTotal, objMesComp === objMesTotal ? 'green' : 'amber'));
      res.push(BAR('Objetivos del mes', objMesComp / objMesTotal * 100, 'accent'));
      const pendMes = monthlyObjs.filter(o => o.status !== 'completado');
      if (pendMes.length) pendMes.slice(0, 3).forEach(o => res.push(`  ○ ${o.name}`));
    }
    return res.join('\n') || 'Sin objetivos registrados aún.';
  }

  // REFLEXIÓN
  if (/reflexión|reflexion|ayer|diario/.test(p)) {
    const res = [];
    const ref = reflexionHoy || reflexionAyer;
    const label = reflexionHoy ? 'Reflexión de hoy' : 'Reflexión de ayer';
    if (ref) {
      res.push(label);
      res.push([
        M('Satisfacción', ref.satisfaccion + '/10', colorVal(ref.satisfaccion, 7, 4)),
        M('Enfoque',      ref.enfoque + '/10',      colorVal(ref.enfoque, 7, 4)),
        M('Claridad',     ref.claridad_cierre + '/10', colorVal(ref.claridad_cierre, 7, 4)),
      ].join(' '));
      if (ref.energia_roba) res.push(`⚡ Te robó energía: ${ref.energia_roba}`);
      if (ref.energia_da)   res.push(`✅ Te dio energía: ${ref.energia_da}`);
      if (ref.logro)        res.push(OK('Logro: ' + ref.logro));
      if (ref.aprendizaje)  res.push(`📚 Aprendiste: ${ref.aprendizaje}`);
    } else {
      res.push(ALERT('Sin reflexiones recientes registradas.'));
    }
    if (reflexiones7.length >= 3) {
      const avgSat = (reflexiones7.reduce((s,r) => s + (r.satisfaccion||0), 0) / reflexiones7.length).toFixed(1);
      const avgEnf = (reflexiones7.reduce((s,r) => s + (r.enfoque||0), 0) / reflexiones7.length).toFixed(1);
      res.push('');
      res.push(`Media de ${reflexiones7.length} reflexiones recientes:`);
      res.push([
        M('Satisfacción', avgSat + '/10', colorVal(parseFloat(avgSat), 7, 4)),
        M('Enfoque',      avgEnf + '/10', colorVal(parseFloat(avgEnf), 7, 4)),
      ].join(' '));
    }
    return res.join('\n');
  }

  // NOTAS
  if (/nota|cuaderno|escrib|apunt/.test(p)) {
    if (notas.length === 0) return ALERT('No hay notas en el Cuaderno. Puedes escribir libremente en la sección Cuaderno.');
    const res = [M('Notas en cuaderno', notas.length + '', 'accent')];
    notas.slice(0, 5).forEach(n => {
      const titulo = n.titulo ? `"${n.titulo}"` : '(sin título)';
      res.push(`  • ${fmtFecha(n.fecha)} ${titulo}`);
    });
    return res.join('\n');
  }

  // HÁBITOS
  if (/hábito|habito|racha/.test(p)) {
    if (habTotal === 0) return ALERT('No tienes hábitos configurados. Añade algunos en la sección Hábitos.');
    const res = [
      M('Completados', habComp + '/' + habTotal, habPct >= 70 ? 'green' : habPct >= 40 ? 'amber' : 'red'),
    ];
    res.push(BAR('Hábitos hoy', habPct, habPct >= 70 ? 'green' : habPct >= 40 ? 'amber' : 'red'));
    if (habFuertes.length) {
      res.push('Sólidos (≥70%):');
      habFuertes.forEach(h => res.push([
        `  • ${h.nombre}`,
        M('7d', h.consistencia7d + '%', 'green'),
        M('racha', h.racha + 'd', h.racha >= 7 ? 'green' : 'amber'),
      ].join(' ')));
    }
    if (habDebiles.length) {
      res.push('Débiles (<40%):');
      habDebiles.forEach(h => {
        res.push(`  • ${h.nombre} ` + M('7d', h.consistencia7d + '%', 'red'));
        res.push(BAR(h.nombre, h.consistencia7d, 'red'));
      });
    }
    if (mejorRacha && mejorRacha.racha >= 2) res.push(OK(`Mejor racha: ${mejorRacha.nombre} · ${mejorRacha.racha} días`));
    const listaPend = habitStats.filter(h => !h.completadoHoy);
    if (listaPend.length) res.push('Pendientes hoy: ' + listaPend.map(h => h.nombre).join(', '));
    return res.join('\n');
  }

  // RUTINA
  if (/rutina|bloque/.test(p)) {
    if (bloquesHoy.length === 0) return ALERT('Sin rutina configurada para hoy. Añade bloques en la sección Rutina.');
    const res = [
      M('Bloques', bloquesCompletados.length + '/' + bloquesHoy.length, rutPct >= 70 ? 'green' : rutPct >= 40 ? 'amber' : 'red'),
    ];
    res.push(BAR('Rutina hoy (' + DIAS_LABEL[new Date().getDay()] + ')', rutPct, rutPct >= 70 ? 'green' : rutPct >= 40 ? 'amber' : 'red'));
    bloquesHoy.forEach(b => {
      const hecho = bloquesCompletados.find(x => x.inicio === b.inicio);
      res.push(`  ${hecho ? '✓' : '○'} ${b.inicio}–${b.fin} ${b.bloque}`);
    });
    return res.join('\n');
  }

  // ENERGÍA
  if (/energía|energia|cansad/.test(p)) {
    if (!checkin) return ALERT('Sin chequeo de hoy no tengo datos de energía.');
    const res = [
      M('Energía hoy', checkin.energy + '/10', colorVal(checkin.energy, 7, 4)),
      M('Sueño', checkin.sleep_hours + 'h', checkin.sleep_hours >= 7 ? 'green' : checkin.sleep_hours >= 6 ? 'amber' : 'red'),
    ];
    if (checkins7.length >= 3) {
      res.push('');
      res.push([
        M('Media 7d', avgE + '/10', colorVal(parseFloat(avgE), 7, 4)),
        M('Tendencia', eTrend > 1 ? '+' + eTrend + ' ↑' : eTrend < -1 ? eTrend + ' ↓' : 'estable →', eTrend > 1 ? 'green' : eTrend < -1 ? 'red' : 'muted'),
      ].join(' '));
      res.push(BAR('Energía 7d', parseFloat(avgE) * 10, colorVal(parseFloat(avgE), 7, 4)));
    }
    if (checkin.energy < 5 && checkin.sleep_hours < 6) res.push(ALERT('La causa más probable es el poco sueño.'));
    else if (checkin.energy < 5 && !checkin.did_exercise) res.push(RX('20 minutos de movimiento pueden revertirlo hoy.'));
    else if (checkin.energy >= 7) res.push(OK('Buena energía — úsala en lo que más importa.'));
    return res.join('\n');
  }

  // TENDENCIAS / PATRONES
  if (/patrón|patron|tendencia|semana/.test(p)) {
    if (checkins7.length < 3) return ALERT(`Solo ${checkins7.length} registros — necesito al menos 3 para detectar patrones.`);
    const res = [`Análisis de los últimos ${checkins7.length} días:`];
    res.push([
      M('Energía', avgE + '/10', colorVal(parseFloat(avgE), 7, 4)),
      M('Ánimo',   avgM + '/10', colorVal(parseFloat(avgM), 7, 4)),
      M('Sueño',   avgS + 'h',  parseFloat(avgS) >= 7 ? 'green' : parseFloat(avgS) >= 6 ? 'amber' : 'red'),
      M('Ansiedad',avgA + '/10', parseFloat(avgA) <= 3 ? 'green' : parseFloat(avgA) <= 6 ? 'amber' : 'red'),
    ].join(' '));
    res.push(BAR('Energía media', parseFloat(avgE) * 10, colorVal(parseFloat(avgE), 7, 4)));
    res.push(BAR('Sueño medio (vs 8h)', parseFloat(avgS) / 8 * 100, parseFloat(avgS) >= 7 ? 'green' : 'amber'));
    res.push([
      M('Ejercicio', exDays + '/' + checkins7.length + 'd', exDays >= 4 ? 'green' : exDays >= 2 ? 'amber' : 'red'),
      M('Estudio',   stDays + '/' + checkins7.length + 'd', stDays >= 3 ? 'green' : stDays >= 1 ? 'amber' : 'red'),
    ].join(' '));
    if (eTrend > 1)   res.push(OK(`Energía subiendo (+${eTrend}): algo está funcionando bien.`));
    if (eTrend < -1)  res.push(ALERT(`Energía bajando (${eTrend}): revisa sueño, carga de trabajo y rutina.`));
    if (parseFloat(avgA) >= 6) res.push(ALERT(`Ansiedad alta de media (${avgA}/10) — patrón a vigilar.`));
    return res.join('\n');
  }

  // QUÉ PRIORIZAR
  if (/prioriz|qué hacer|empez/.test(p)) {
    if (!checkin) return ALERT('Sin chequeo de hoy no puedo evaluar tu estado. Empieza por registrarlo.');
    const res = ['Orden de prioridad para hoy:'];
    res.push(M('Energía disponible', checkin.energy + '/10', colorVal(checkin.energy, 7, 4)));
    if (tareasPend.length > 0) res.push(`1️⃣ Agenda: "${tareasPend[0].nombre}"${tareasPend[0].hora ? ' a las ' + tareasPend[0].hora : ''}`);
    const habSinHacer = habitStats.filter(h => !h.completadoHoy).slice(0, 2);
    if (habSinHacer.length) res.push(`2️⃣ Hábitos: ${habSinHacer.map(h => h.nombre).join(', ')}`);
    if (objSemanTotal > 0 && objSemanComp / objSemanTotal < 0.5) {
      const obj = weeklyObjs.find(o => o.status !== 'completado');
      if (obj) res.push(`3️⃣ Objetivo semanal: "${obj.name}"`);
    }
    const accionF = checkin.energy >= 7 ? 'Buena energía. Ataca la tarea más difícil pendiente.' : 'Energía limitada. Elige solo 1 cosa importante.';
    res.push(RX(accionF));
    return res.join('\n');
  }

  // ACCIÓN CONCRETA
  if (/acción|accion|mejorar|concret/.test(p)) {
    if (!checkin) return ALERT('Registra el chequeo de hoy para darte una recomendación personalizada.');
    let accion = '';
    if (checkin.sleep_hours < 6)    accion = `Esta noche duerme más. ${checkin.sleep_hours}h no es suficiente — está limitando todo.`;
    else if (tareasPend.length > 0) accion = `Cierra esta tarea ahora: "${tareasPend[0].nombre}". Es lo más concreto que puedes hacer.`;
    else if (habDebiles.length)     accion = `Elige 1 hábito débil (${habDebiles[0].nombre}) y hazlo hoy sin excusas.`;
    else if (rutPct !== null && rutPct < 50) accion = 'Completa el siguiente bloque de rutina antes de hacer otra cosa.';
    else accion = 'Revisa tu reflexión de ayer y elige UNA mejora concreta para mañana.';
    return RX(accion);
  }

  // MALOS HÁBITOS
  if (/malo|vicio|reduce|evit/.test(p)) {
    if (malosHabitos.length === 0) return ALERT('No tienes malos hábitos registrados en el tracker.');
    const res = [M('Malos hábitos', malosHabitos.length + '', 'muted')];
    malosHabitos.forEach(m => {
      const log = malosLog.find(l => l.malo_id === m.id);
      const veces = log ? log.veces : 0;
      res.push([
        `• ${m.name}`,
        M('impacto', m.impacto + '/10', m.impacto >= 7 ? 'red' : 'amber'),
        M('hoy', veces + 'x', veces === 0 ? 'green' : veces <= 2 ? 'amber' : 'red'),
      ].join(' '));
      if (veces > 0) res.push(BAR(m.name, Math.min(100, veces * 20), 'red'));
    });
    return res.join('\n');
  }

  // RESUMEN GENERAL
  const res = ['Resumen de hoy:'];
  if (checkin) {
    res.push([
      M('Energía', checkin.energy + '/10', colorVal(checkin.energy, 7, 4)),
      M('Ánimo',   checkin.mood + '/10',   colorVal(checkin.mood, 7, 4)),
      M('Sueño',   checkin.sleep_hours + 'h', checkin.sleep_hours >= 7 ? 'green' : checkin.sleep_hours >= 6 ? 'amber' : 'red'),
    ].join(' '));
  }
  if (habTotal) res.push(BAR('Hábitos', habPct, habPct >= 70 ? 'green' : habPct >= 40 ? 'amber' : 'red'));
  if (tareasHoy.length) res.push(BAR('Agenda', tareasComp.length / tareasHoy.length * 100, 'amber'));
  if (bloquesHoy.length) res.push(BAR('Rutina', rutPct, rutPct >= 70 ? 'green' : 'amber'));
  if (objSemanTotal) res.push(BAR('Objetivos semana', objSemanComp / objSemanTotal * 100, 'accent'));
  if (res.length === 1) return ALERT('Sin datos suficientes. Registra tu chequeo diario para obtener análisis personalizado.');
  res.push('');
  res.push('Puedes preguntarme por: agenda, hábitos, rutina, objetivos, reflexión, energía o tendencias.');
  return res.join('\n');
}

// ─── RENDER HELPER ───────────────────────────────────────────────────────────

function safeRender(res, ctx, coachMsg) {
  const history = (() => { try { return db.getCoachHistory(8); } catch(e) { return []; } })();
  res.render('coach', {
    page: 'coach',
    today: ctx.today || db.todayStr(),
    checkin: ctx.checkin || null,
    habitStats: ctx.habitStats || [],
    weeklyObjs: ctx.weeklyObjs || [],
    perfil: ctx.perfil || null,
    checkins7: ctx.checkins7 || [],
    bloquesHoy: ctx.bloquesHoy || [],
    bloquesCompletados: ctx.bloquesCompletados || [],
    malosLog: ctx.malosLog || [],
    tareasHoy: ctx.tareasHoy || [],
    coachMsg: coachMsg || null,
    history,
  });
}

// ─── RUTAS ───────────────────────────────────────────────────────────────────

router.get('/', (req, res) => {
  const today = db.todayStr();
  try {
    const ctx = buildContext(today);
    safeRender(res, { ...ctx, today }, null);
  } catch(err) {
    console.error('Coach GET error:', err);
    safeRender(res, { today }, null);
  }
});

router.post('/analizar', (req, res) => {
  const today = db.todayStr();
  let ctx = {};
  try { ctx = buildContext(today); } catch(err) { console.error('buildContext error:', err); }
  try {
    const coachMsg = generarAnalisis(ctx, 'analisis', null);
    try { db.saveCoachAnalysis(today, coachMsg); } catch(e) {}
    safeRender(res, { ...ctx, today }, coachMsg);
  } catch (err) {
    console.error('Coach analizar error:', err);
    safeRender(res, { ...ctx, today }, 'Error al generar el análisis.');
  }
});

router.post('/chat', (req, res) => {
  const today = db.todayStr();
  const userMsg = (req.body.mensaje || '').trim();
  if (!userMsg) return res.json({ error: 'Mensaje vacío' });
  let ctx = {};
  try { ctx = buildContext(today); } catch(e) {}
  try {
    const isAnalisis = /analiz|diagnos|cómo.*estoy|como.*estoy/i.test(userMsg);
    const respuesta = generarAnalisis(ctx, isAnalisis ? 'analisis' : 'pregunta', userMsg);
    if (isAnalisis) {
      try { db.saveCoachAnalysis(today, respuesta); } catch(e) {}
    }
    res.json({ respuesta });
  } catch (err) {
    console.error('Coach chat error:', err.message);
    res.json({ respuesta: 'Error al generar respuesta.' });
  }
});

module.exports = router;
