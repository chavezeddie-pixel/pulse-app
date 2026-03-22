const express = require('express');
const router = express.Router();
const db = require('../database');
const fs = require('fs');
const path = require('path');

/* ═══════════════════════════════════════════════════
   CLAUCH IA — Asistente conversacional de Pulse

   Clauch ES el onboarding. En vez de formularios,
   conversa y llena todo por detrás. El usuario solo
   habla con un amigo y su app se va configurando sola.
   ═══════════════════════════════════════════════════ */

function cargarRutina() {
  const rutinaPath = db.getActiveRutinaPath();
  try { return JSON.parse(fs.readFileSync(rutinaPath, 'utf8')); } catch(e) { return {}; }
}
function guardarRutina(data) {
  const rutinaPath = db.getActiveRutinaPath();
  fs.writeFileSync(rutinaPath, JSON.stringify(data, null, 2));
}
function sumarMinutos(hora, mins) {
  const [h, m] = hora.split(':').map(Number);
  const total = h * 60 + m + mins;
  return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
}

/* ═══════════════════════════════════════════════════
   CENTRAL DE INTELIGENCIA
   ═══════════════════════════════════════════════════ */
function buildCentral() {
  const today = db.todayStr();
  const perfil = db.getPerfil();
  const habits = db.getAllHabits();
  const malos = db.getMalosHabitos();
  const rutina = cargarRutina();
  const completedToday = db.getCompletedHabitsForDate(today);
  const weekStart = db.weekStartStr();
  const weeklyObjs = db.getWeeklyObjectives(weekStart);
  const monthYear = db.currentMonthYear();
  const monthlyObjs = db.getMonthlyObjectives(monthYear);

  let notas = [];
  try { notas = db.getAllNotas().slice(0, 20); } catch(e) {}
  let reflexiones = [];
  try {
    const d14 = new Date(); d14.setDate(d14.getDate() - 14);
    reflexiones = db.getReflexionesRange(d14.toISOString().split('T')[0], today);
  } catch(e) {}
  let estados = [];
  try { estados = db.getEstadoHistorial(7); } catch(e) {}

  const d7 = new Date(); d7.setDate(d7.getDate() - 6);
  const checkins = db.getCheckinsRange(d7.toISOString().split('T')[0], today);
  const rutinaBloques = Object.values(rutina).reduce((sum, day) => sum + (Array.isArray(day) ? day.length : 0), 0);

  const habitStats = habits.map(h => ({
    ...h,
    streak: db.getHabitStreak(h.id),
    rate7: db.getHabitCompletionRate(h.id, 7),
    completedToday: completedToday.includes(h.id),
  }));

  const keywords = extractKeywords(notas, reflexiones, perfil);
  const perfilCampos = ['nombre','edad','genero','ocupacion','objetivos','areas_mejorar'];
  const perfilCompletos = perfilCampos.filter(c => {
    if (!perfil) return false;
    const v = perfil[c];
    if (Array.isArray(v)) return v.length > 0 && v[0] !== '';
    return v && v !== '' && v !== null;
  });

  return {
    today, perfil, perfilCompletos,
    perfilFaltantes: perfilCampos.filter(c => !perfilCompletos.includes(c)),
    habits, habitStats, malos, rutina, rutinaBloques,
    weeklyObjs, monthlyObjs, notas, reflexiones, estados,
    checkins, keywords, completedToday,
  };
}

function extractKeywords(notas, reflexiones, perfil) {
  const allText = [];
  notas.forEach(n => {
    if (n.contenido) allText.push(n.contenido.toLowerCase());
    if (n.titulo) allText.push(n.titulo.toLowerCase());
  });
  reflexiones.forEach(r => {
    ['energia_roba','energia_da','freno','logro','aprendizaje','diferente'].forEach(k => {
      if (r[k]) allText.push(r[k].toLowerCase());
    });
  });
  if (perfil) {
    ['objetivos','areas_mejorar','obstaculos'].forEach(k => {
      if (perfil[k]) allText.push(perfil[k].toString().toLowerCase());
    });
  }
  const combined = allText.join(' ');
  const themes = {
    ejercicio: /ejercicio|deporte|gym|correr|caminar|bici|yoga|nadar/.test(combined),
    estudio: /estudi|leer|libro|curso|aprend|universidad|examen/.test(combined),
    trabajo: /trabaj|oficina|reunión|proyecto|cliente|jefe/.test(combined),
    sueno: /dormir|sueño|descanso|insomnio|trasnochar|madruga/.test(combined),
    alimentacion: /comer|comida|aliment|dieta|cocin|chatarra|saludable/.test(combined),
    estres: /estrés|estres|ansied|presión|agotad|burnout|cansad/.test(combined),
    social: /amigos|familia|pareja|soled|aislad|social|gente/.test(combined),
    disciplina: /disciplin|procrastin|pereza|floj|constanc|motiv/.test(combined),
    digital: /celular|redes|pantalla|instagram|tiktok|youtube|netflix/.test(combined),
    finanzas: /dinero|plata|ahorro|gast|deuda|financ/.test(combined),
    creatividad: /creat|escrib|pintar|música|arte|diseño/.test(combined),
    meditacion: /medita|mindful|respirar|calma|paz|relaj/.test(combined),
  };
  const drainPatterns = [];
  const boostPatterns = [];
  reflexiones.forEach(r => {
    if (r.energia_roba) drainPatterns.push(r.energia_roba);
    if (r.energia_da) boostPatterns.push(r.energia_da);
  });
  return { themes, drainPatterns, boostPatterns, raw: combined };
}

/* ═══════════════════════════════════════════════════
   CONVERSATIONAL FLOW

   The question sequence adapts to what's missing.
   For habits: keeps asking "¿alguno más?" in a loop.
   For estado: asks through natural conversation.
   ═══════════════════════════════════════════════════ */

function getNextQuestion(central, lastQ) {
  const p = central.perfil;
  const falta = central.perfilFaltantes;
  const nombre = p && p.nombre ? p.nombre : '';
  const todayEstados = central.estados.filter(e => e.fecha === central.today);
  const hasEstadoHoy = todayEstados.length > 0;

  const flow = [
    // ── FASE 1: Conocerte ──
    {
      id: 'estado_como_estas',
      condition: () => !hasEstadoHoy,
      q: () => nombre
        ? `${nombre}, antes de todo... ¿cómo estás hoy? Cuéntame con tus palabras, lo que te salga.`
        : '¿Cómo estás hoy? Cuéntame con tus palabras, sin filtro.',
    },
    {
      id: 'ocupacion',
      condition: () => falta.includes('ocupacion'),
      q: () => '¿A qué te dedicas? Trabajo, estudio, ambas, buscando pega... lo que sea.',
    },
    {
      id: 'edad',
      condition: () => falta.includes('edad'),
      q: () => '¿Qué edad tienes?',
    },

    // ── FASE 2: Qué quiere mejorar ──
    {
      id: 'areas_mejorar',
      condition: () => falta.includes('areas_mejorar'),
      q: () => '¿Qué parte de tu vida sientes que podrías mejorar? Salud, productividad, relaciones, sueño... lo primero que se te venga.',
    },

    // ── FASE 3: Hábitos (loop — sigue preguntando) ──
    {
      id: 'habito_1',
      condition: () => central.habits.length === 0,
      q: () => 'Ahora vamos con algo importante. ¿Hay algo que te gustaría hacer todos los días? Algo que sientes que si lo hicieras, tu vida mejoraría. Puede ser súper simple: caminar, leer, tomar agua...',
    },
    {
      id: 'habito_2',
      condition: () => central.habits.length === 1,
      q: () => `Tienes "${central.habits[0].name}". ¿Se te ocurre otro hábito? Piensa en algo distinto: puede ser de salud, estudio, bienestar...`,
    },
    {
      id: 'habito_3',
      condition: () => central.habits.length === 2,
      q: () => `Llevas ${central.habits.map(h=>'"'+h.name+'"').join(' y ')}. ¿Uno más? A veces tres es un buen número para empezar. Si no quieres más, dime "estoy bien así".`,
    },
    {
      id: 'habito_mas',
      condition: () => central.habits.length >= 3 && central.habits.length < 6 && lastQ && lastQ.startsWith('habito'),
      q: () => `Ya tienes ${central.habits.length} hábitos. ¿Quieres agregar otro más o seguimos? Dime "sigo" si estás conforme.`,
    },

    // ── FASE 4: Malos hábitos ──
    {
      id: 'malos_habitos',
      condition: () => central.malos.length === 0,
      q: () => 'Ahora una pregunta honesta... ¿hay algo que haces seguido y sabes que no te ayuda? Redes sociales, trasnochar, comer mal... Todos tenemos algo, no hay juicio aquí 😅',
    },

    // ── FASE 5: Objetivo ──
    {
      id: 'objetivo',
      condition: () => central.weeklyObjs.length === 0 && central.monthlyObjs.length === 0,
      q: () => 'Si esta semana pudieras lograr UNA cosa que te hiciera sentir orgulloso/a, ¿cuál sería?',
    },

    // ── FASE 6: Rutina ──
    {
      id: 'rutina_hora',
      condition: () => central.rutinaBloques < 5,
      q: () => '¿A qué hora te levantas normalmente y a qué hora te acuestas? Así te armo una rutina base.',
    },

    // ── FASE 7: Visión ──
    {
      id: 'objetivos_vida',
      condition: () => falta.includes('objetivos'),
      q: () => 'Última pregunta: pensando más a largo plazo... ¿qué te gustaría lograr en tu vida? No tiene que ser concreto, lo que sientas.',
    },
  ];

  for (const step of flow) {
    if (step.id === lastQ) continue;
    if (step.condition()) {
      return { id: step.id, text: step.q() };
    }
  }

  return null;
}

/* ═══════════════════════════════════════════════════
   PROCESS ANSWERS
   ═══════════════════════════════════════════════════ */
function processAnswer(text, questionId, central) {
  const t = text.trim();
  const tl = t.toLowerCase();
  const saved = [];

  // Universal "paso/skip"
  if (/^(paso|skip|no|nah|nop|no quiero|después|despues|na)$/i.test(tl)) {
    return { messages: ['Dale, sin problema 😊'], saved };
  }

  switch (questionId) {

    case 'estado_como_estas': {
      const estado = detectEmotionalState(tl);
      // Save as estado obligatorio through chat
      const periodo = db.getEstadoPeriodoActual();
      if (periodo) {
        try {
          const emocion = detectEmocionFromText(tl);
          db.saveEstadoObligatorio(central.today, periodo.key, {
            estado_general: estado.estado_general,
            energia: estado.energia,
            estres: estado.estres,
            enfoque: estado.enfoque || 3,
            emocion: emocion,
            contexto: '',
            nota: t,
          });
          saved.push({ field: 'estado', value: `${estado.estado_general}/5` });
        } catch(e) {}
      }

      let reply = '';
      if (estado.estado_general >= 4) {
        reply = '¡Qué bueno saber eso! 😊 Me alegro. ';
      } else if (estado.estado_general <= 2) {
        reply = 'Entiendo... no siempre son días fáciles, y está bien. ';
      } else {
        reply = 'Ok, anotado. ';
      }
      reply += 'Ya registré cómo te sientes hoy.';
      return { messages: [reply], saved };
    }

    case 'ocupacion': {
      let ocup = t.replace(/^(soy|trabajo como|trabajo en|me dedico a|estudio)\s*/i, '').trim();
      if (ocup.length < 2) ocup = t;
      savePerfil({ ocupacion: capitalize(ocup) });
      saved.push({ field: 'ocupación', value: ocup });

      const esEstudiante = /estudi|universidad|colegio|liceo|carrera/.test(tl);
      const esTrabajador = /trabaj|oficina|empresa|negocio|freelance|diseñ|program|desarroll/.test(tl);
      let reply = '¡Anotado!';
      if (esEstudiante && esTrabajador) reply = 'Estudiar y trabajar al mismo tiempo es heavy. Bien ahí. 💪';
      else if (esEstudiante) reply = '¡Genial! El estudio es pesado pero vale la pena.';
      else if (esTrabajador) reply = '¡Entendido! El trabajo ocupa harta energía, así que el balance es clave.';
      else if (/busca|pega|desempleado|nada|sin trabajo/.test(tl)) reply = 'Eso puede ser estresante. Aquí te voy a ayudar a mantener una estructura.';
      return { messages: [reply], saved };
    }

    case 'edad': {
      const numMatch = t.match(/(\d{1,2})/);
      if (numMatch) {
        const edad = parseInt(numMatch[1]);
        if (edad >= 10 && edad <= 99) {
          savePerfil({ edad: edad.toString() });
          saved.push({ field: 'edad', value: edad });
          return { messages: ['Perfecto 👍'], saved };
        }
      }
      return { messages: ['¿Me dices tu edad en número?'], retry: true };
    }

    case 'areas_mejorar': {
      savePerfil({ areas_mejorar: t });
      saved.push({ field: 'áreas', value: t });

      const areas = [];
      if (/salud|físic|cuerpo|ejercicio|peso/.test(tl)) areas.push('salud');
      if (/product|trabajo|enfoque|foco|disciplin|rendir/.test(tl)) areas.push('productividad');
      if (/relacion|social|amig|famili|pareja|soled/.test(tl)) areas.push('relaciones');
      if (/ánimo|emocion|ansiedad|estrés|mental|ansied/.test(tl)) areas.push('bienestar emocional');
      if (/sueño|dormir|descanso|energía|energ/.test(tl)) areas.push('descanso');
      if (/dinero|finanz|ahorro|plata/.test(tl)) areas.push('finanzas');

      let reply = areas.length > 0
        ? `Noto que te importa: ${areas.join(', ')}. Voy a tener eso en cuenta para todo lo que te sugiera.`
        : 'Gracias por la honestidad. Lo tengo en cuenta. 📝';
      return { messages: [reply], saved };
    }

    // ── HÁBITOS (múltiples rondas) ──
    case 'habito_1':
    case 'habito_2':
    case 'habito_3':
    case 'habito_mas': {
      // "sigo", "estoy bien", "no más" → stop loop
      if (/^(sigo|no m[aá]s|estoy bien|suficiente|listo|ya|eso|nada m[aá]s|con eso)/.test(tl)) {
        return { messages: ['Perfecto, con eso partimos. 👍'], saved };
      }

      const habitsCreated = extractHabitsFromText(t, central);
      if (habitsCreated.length > 0) {
        habitsCreated.forEach(h => {
          try { db.createHabit(h.name, h.area); } catch(e) {}
        });
        saved.push({ field: 'hábitos', value: habitsCreated.map(h => h.name).join(', ') });
        const names = habitsCreated.map(h => `"${h.name}"`).join(', ');
        return {
          messages: [`Listo, creé: ${names} ✅`],
          saved,
        };
      }

      // Try to create from raw text
      if (t.length > 1 && t.length < 60) {
        const name = capitalize(t.replace(/^(quiero|me gustaría|quisiera|hacer)\s*/i, '').trim());
        const area = detectArea(name);
        try { db.createHabit(name, area); } catch(e) {}
        saved.push({ field: 'hábito', value: name });
        return {
          messages: [`Agregué "${name}" ✅`],
          saved,
        };
      }
      return { messages: ['No caché bien, ¿me lo dices más específico? Tipo "leer", "correr", "meditar"...'], retry: true };
    }

    case 'malos_habitos': {
      if (/^(no|nada|ninguno|no tengo|soy perfecto)/.test(tl)) {
        return { messages: ['Jaja ojalá todos pudiéramos decir eso 😄 Sigamos.'], saved };
      }

      const malosCreated = extractMalosFromText(t);
      if (malosCreated.length > 0) {
        malosCreated.forEach(m => {
          try { db.createMaloHabito(m.name, m.categoria, m.impacto); } catch(e) {}
        });
        saved.push({ field: 'malos hábitos', value: malosCreated.map(m => m.name).join(', ') });
        const names = malosCreated.map(m => `"${m.name}"`).join(', ');
        return {
          messages: [`Anotado: ${names}. Sin juicio, el primer paso es reconocerlo. 💪`],
          saved,
        };
      }

      if (t.length > 2 && t.length < 80) {
        const name = capitalize(t.replace(/^(tengo|hago|suelo)\s*/i, '').trim());
        try { db.createMaloHabito(name, 'general', 5); } catch(e) {}
        saved.push({ field: 'mal hábito', value: name });
        return {
          messages: [`Registré "${name}". Ahora lo vas a poder trackear. 📊`],
          saved,
        };
      }
      return { messages: ['¿Puedes ser un poco más específico? O dime "paso" si prefieres saltarlo.'], retry: true };
    }

    case 'objetivo': {
      if (/^(no s[eé]|nose|nada|paso|skip)$/i.test(tl)) {
        return { messages: ['Tranqui, cuando se te ocurra algo me dices.'], saved };
      }
      let objName = t.replace(/^(quiero|me gustaría|quisiera|mi meta es)\s*/i, '').trim();
      if (objName.length > 2) {
        objName = capitalize(objName);
        const area = detectArea(objName);
        try {
          db.createWeeklyObjective({
            name: objName, area, priority: 'alta',
            deadline: null, week_start: db.weekStartStr(),
          });
        } catch(e) {}
        saved.push({ field: 'objetivo', value: objName });
        return {
          messages: [`"${objName}" — me gusta. Registrado como tu objetivo de esta semana. 🔥`],
          saved,
        };
      }
      return { messages: ['Dime algo más específico, tipo "hacer ejercicio 3 veces" o "dormir antes de las 12"...'], retry: true };
    }

    case 'rutina_hora': {
      let despertar = '07:00';
      let dormir = '23:00';

      // Try to parse "levanto a las X" and "acuesto a las Y" with context
      const levMatch = tl.match(/(?:levant|despierto|paro)\w*\s+(?:a las |como a las |tipo )(\d{1,2})(?::(\d{2}))?/);
      const acMatch = tl.match(/(?:acuesto|duermo|acost)\w*\s+(?:a las |como a las |tipo )(\d{1,2})(?::(\d{2}))?/);

      if (levMatch) {
        despertar = padHora(levMatch[1] + (levMatch[2] ? ':' + levMatch[2] : ''));
      }
      if (acMatch) {
        let h = parseInt(acMatch[1]);
        // "a las 11" meaning 23:00 if in sleep context
        if (h >= 8 && h <= 12) h += 12; // 11pm = 23
        if (h > 24) h = 23;
        dormir = padHora(h.toString() + (acMatch[2] ? ':' + acMatch[2] : ''));
      }

      // Fallback: just grab two numbers
      if (!levMatch && !acMatch) {
        const horas = tl.match(/(\d{1,2})(?::(\d{2}))?/g);
        if (horas && horas.length >= 1) {
          const h1 = parseInt(horas[0]);
          if (h1 >= 4 && h1 <= 12) despertar = padHora(horas[0]);
        }
        if (horas && horas.length >= 2) {
          const h2 = parseInt(horas[1]);
          if (h2 >= 18 || h2 <= 3) dormir = padHora(horas[1]);
          else if (h2 >= 8 && h2 <= 12) dormir = padHora((h2 + 12).toString()); // assume PM
        }
      }

      const bloques = buildRutinaFromHoras(despertar, dormir, central);
      const rutina = cargarRutina();
      ['lunes','martes','miercoles','jueves','viernes'].forEach(dia => {
        if (!rutina[dia] || rutina[dia].length === 0) rutina[dia] = bloques;
      });
      guardarRutina(rutina);
      saved.push({ field: 'rutina', value: `${despertar}-${dormir}` });

      return {
        messages: [`Te armé una rutina de ${despertar} a ${dormir} para lunes a viernes. Tiene bloques de trabajo, comidas, ejercicio y tiempo libre. Después puedes ajustarla si quieres.`],
        saved,
      };
    }

    case 'objetivos_vida': {
      savePerfil({ objetivos: t });
      saved.push({ field: 'visión', value: t });
      return {
        messages: ['Eso me sirve mucho. Lo voy a tener presente para todo lo que te sugiera. 🎯'],
        saved,
      };
    }

    default:
      return null;
  }
}

/* ── Free messages (no pending question) ── */
function processFreeMessage(text, central) {
  const tl = text.toLowerCase().trim();
  const nombre = central.perfil?.nombre || '';
  const response = { messages: [], saved: [] };

  if (tl === '__start__') return response;

  // ── Greetings ──
  if (/^(hola|hey|buenas|hi|ey|wena|holi)$/i.test(tl)) {
    response.messages.push(nombre ? `¡Hola ${nombre}! ¿Cómo andas?` : '¡Hola! ¿Cómo andas?');
    return response;
  }

  if (/^(gracias|thx|thanks|genial|vale|ok|dale|buena|sí|si)$/i.test(tl)) {
    response.messages.push('😊');
    return response;
  }

  if (/^(paso|skip|no|nah|na|nop|después|sigo)$/i.test(tl)) {
    response.messages.push('Dale, seguimos.');
    return response;
  }

  // ── Create habit ──
  const createHabitMatch = tl.match(/(?:crear|agregar|nuevo|quiero)\s*(?:un\s*)?(?:h[aá]bito|habito)\s*(?:de\s*)?(.+)/i);
  if (createHabitMatch) {
    const name = capitalize(createHabitMatch[1].trim().replace(/['"]/g, ''));
    if (name.length > 1 && name.length < 100) {
      try { db.createHabit(name, detectArea(name)); } catch(e) {}
      response.messages.push(`Creado: "${name}". ✅`);
      response.saved.push({ field: 'hábito', value: name });
      return response;
    }
  }

  // ── Create objective ──
  const createObjMatch = tl.match(/(?:crear|agregar|nuevo|quiero)\s*(?:un\s*)?(?:objetivo|meta)\s*(?:de\s*)?(.+)/i);
  if (createObjMatch) {
    const name = capitalize(createObjMatch[1].trim().replace(/['"]/g, ''));
    if (name.length > 1) {
      try { db.createWeeklyObjective({ name, area: detectArea(name), priority: 'media', deadline: null, week_start: db.weekStartStr() }); } catch(e) {}
      response.messages.push(`Objetivo creado: "${name}". ✅`);
      response.saved.push({ field: 'objetivo', value: name });
      return response;
    }
  }

  // ── Consultation: "qué tengo hoy" ──
  if (/qu[eé] tengo hoy|qu[eé] hay hoy|mi d[ií]a|agenda de hoy/.test(tl)) {
    return buildTodayPlan(central);
  }

  // ── Consultation: "cómo voy con mis hábitos" ──
  if (/mis h[aá]bitos|c[oó]mo voy con|cumplimiento/.test(tl)) {
    return buildHabitsReport(central);
  }

  // ── Consultation: "cómo estuve la semana" ──
  if (/semana pasada|esta semana|[uú]ltimos d[ií]as|últimamente/.test(tl)) {
    return buildWeekReport(central);
  }

  // ── Consultation: "qué debería mejorar" ──
  if (/qu[eé] (?:me falta|debo|puedo|debería) mejorar|sugerencia|consejo|qu[eé] me recomiendas/.test(tl)) {
    return buildSmartSuggestion(central);
  }

  // ── Day analysis ──
  if (/c[oó]mo (?:te )?(?:fue|estuvo|va|anda)|qu[eé] tal|c[oó]mo voy|resumen|mi estado|progreso/.test(tl)) {
    return buildDayAnalysis(central);
  }

  // ── Retroactive: "ayer estuve..." or "estos días han sido..." ──
  if (/ayer|anteayer|hace \d+ d[ií]as?|el lunes|el martes|el mi[eé]rcoles|el jueves|el viernes|el s[aá]bado|el domingo/.test(tl)) {
    return processRetroactive(text, central);
  }

  // ── "Me siento..." — take estado anytime ──
  if (tl.length > 8 && /me siento|estoy|tengo|hoy fue|ando|me cuesta|hoy estoy|me encuentro/.test(tl)) {
    return processPersonalShare(text, central);
  }

  // ── "Quiero empezar..." → create habit ──
  if (/quiero empezar|quiero hacer|debería|necesito empezar|me gustar[ií]a/.test(tl)) {
    const actMatch = tl.match(/(?:empezar|hacer|debería|necesito|gustar[ií]a)\s+(?:a\s+)?(.{3,40}?)(?:\.|,|$)/);
    if (actMatch) {
      const activity = capitalize(actMatch[1].trim());
      try { db.createHabit(activity, detectArea(activity)); } catch(e) {}
      response.messages.push(`Te creé "${activity}" como hábito. ✅`);
      response.saved.push({ field: 'hábito', value: activity });
      return response;
    }
  }

  // ── "Dormí mal / bien" — capture sleep data ──
  if (/dorm[ií]|no pude dormir|insomnio|desvel/.test(tl)) {
    return processSleepShare(text, central);
  }

  // ── Long text that could be emotional sharing ──
  if (tl.length > 15) {
    return processPersonalShare(text, central);
  }

  response.messages.push('Cuéntame más. Puedes hablarme de cómo te sientes, preguntar por tus hábitos, o decirme qué tienes en mente.');
  return response;
}

/* ── Today plan ── */
function buildTodayPlan(central) {
  const response = { messages: [], saved: [] };
  const nombre = central.perfil?.nombre || '';

  // Habits pending
  const pendingHabits = central.habitStats.filter(h => !h.completedToday);
  const doneHabits = central.habitStats.filter(h => h.completedToday);

  if (central.habitStats.length > 0) {
    if (doneHabits.length > 0) {
      response.messages.push(`Ya completaste: ${doneHabits.map(h => h.name).join(', ')}. 👍`);
    }
    if (pendingHabits.length > 0) {
      response.messages.push(`Te falta: ${pendingHabits.map(h => h.name).join(', ')}.`);
    }
    if (pendingHabits.length === 0) {
      response.messages.push('¡Completaste todos tus hábitos de hoy! 🎉');
    }
  }

  // Objectives
  if (central.weeklyObjs.length > 0) {
    const objList = central.weeklyObjs.map(o => {
      return `${o.completed ? '✅' : '⬜'} ${o.name}`;
    }).join(', ');
    response.messages.push(`Objetivos de la semana: ${objList}`);
  }

  // Estado
  const todayEstados = central.estados.filter(e => e.fecha === central.today);
  if (todayEstados.length > 0) {
    const last = todayEstados[todayEstados.length - 1];
    const nivel = ['', 'muy mal', 'bajo', 'normal', 'bien', 'excelente'][last.estado_general] || '';
    response.messages.push(`Tu estado hoy: ${nivel}, energía ${last.energia}/5.`);
  }

  if (response.messages.length === 0) {
    response.messages.push('Todavía no hay mucho registrado hoy. Cuéntame cómo estás y empezamos.');
  }

  return response;
}

/* ── Habits report ── */
function buildHabitsReport(central) {
  const response = { messages: [], saved: [] };

  if (central.habitStats.length === 0) {
    response.messages.push('No tienes hábitos todavía. ¿Quieres crear alguno?');
    return response;
  }

  const lines = central.habitStats.map(h => {
    const rate = h.rate7 >= 0 ? ` (${h.rate7}% esta semana)` : '';
    const streak = h.streak > 0 ? ` 🔥${h.streak}` : '';
    const today = h.completedToday ? '✅' : '⬜';
    return `${today} ${h.name}${rate}${streak}`;
  });

  response.messages.push('Tus hábitos:');
  response.messages.push(lines.join('\n'));

  const weak = central.habitStats.filter(h => h.rate7 < 40 && h.rate7 >= 0);
  if (weak.length > 0) {
    response.messages.push(`Te cuesta más: ${weak.map(h => h.name).join(', ')}. Quizás hacerlos más chicos o en otro horario ayude.`);
  }

  return response;
}

/* ── Week report ── */
function buildWeekReport(central) {
  const response = { messages: [], saved: [] };

  if (central.estados.length > 0) {
    const avg = (field) => {
      const vals = central.estados.filter(e => e[field]).map(e => e[field]);
      return vals.length ? (vals.reduce((a,b) => a+b, 0) / vals.length).toFixed(1) : '?';
    };
    response.messages.push(`Últimos días: estado promedio ${avg('estado_general')}/5, energía ${avg('energia')}/5, estrés ${avg('estres')}/5.`);

    // Trend
    if (central.estados.length >= 3) {
      const recent = central.estados.slice(-3);
      const older = central.estados.slice(0, -3);
      if (older.length > 0) {
        const recentAvg = recent.reduce((s,e) => s + (e.estado_general||3), 0) / recent.length;
        const olderAvg = older.reduce((s,e) => s + (e.estado_general||3), 0) / older.length;
        if (recentAvg > olderAvg + 0.3) response.messages.push('📈 Vas mejorando respecto a antes.');
        else if (recentAvg < olderAvg - 0.3) response.messages.push('📉 Has bajado un poco. ¿Qué cambió?');
        else response.messages.push('Se ha mantenido estable.');
      }
    }
  }

  if (central.keywords.drainPatterns.length > 0) {
    response.messages.push(`Lo que más te drena: "${central.keywords.drainPatterns[0]}".`);
  }
  if (central.keywords.boostPatterns.length > 0) {
    response.messages.push(`Lo que te da energía: "${central.keywords.boostPatterns[0]}".`);
  }

  if (response.messages.length === 0) {
    response.messages.push('No tengo suficientes datos de esta semana todavía. Cuéntame cómo fueron tus últimos días y los registro.');
  }

  return response;
}

/* ── Retroactive data ── */
function processRetroactive(text, central) {
  const tl = text.toLowerCase();
  const response = { messages: [], saved: [] };

  // Detect which day
  let targetDate = null;
  let dayLabel = '';

  if (/ayer/.test(tl)) {
    const d = new Date(); d.setDate(d.getDate() - 1);
    targetDate = d.toISOString().split('T')[0];
    dayLabel = 'ayer';
  } else if (/anteayer|antes de ayer/.test(tl)) {
    const d = new Date(); d.setDate(d.getDate() - 2);
    targetDate = d.toISOString().split('T')[0];
    dayLabel = 'anteayer';
  } else if (/hace (\d+) d[ií]as?/.test(tl)) {
    const m = tl.match(/hace (\d+) d[ií]as?/);
    const days = parseInt(m[1]);
    if (days <= 7) {
      const d = new Date(); d.setDate(d.getDate() - days);
      targetDate = d.toISOString().split('T')[0];
      dayLabel = `hace ${days} días`;
    }
  } else {
    const dayMap = { lunes: 1, martes: 2, miércoles: 3, miercoles: 3, jueves: 4, viernes: 5, sábado: 6, sabado: 6, domingo: 0 };
    for (const [name, dow] of Object.entries(dayMap)) {
      if (tl.includes(name)) {
        const today = new Date();
        let diff = today.getDay() - dow;
        if (diff <= 0) diff += 7;
        const d = new Date(); d.setDate(d.getDate() - diff);
        targetDate = d.toISOString().split('T')[0];
        dayLabel = 'el ' + name;
        break;
      }
    }
  }

  if (targetDate) {
    const estado = detectEmotionalState(tl);
    const emocion = detectEmocionFromText(tl);

    try {
      db.saveEstadoObligatorio(targetDate, 'tarde', {
        estado_general: estado.estado_general,
        energia: estado.energia,
        estres: estado.estres,
        enfoque: estado.enfoque || 3,
        emocion: emocion,
        nota: text,
      });
      response.saved.push({ field: `estado ${dayLabel}`, value: `${estado.estado_general}/5` });
    } catch(e) {}

    const nivel = ['', 'muy mal', 'bajo', 'normal', 'bien', 'excelente'][estado.estado_general] || '';
    response.messages.push(`Registré ${dayLabel}: ${nivel}. Eso me ayuda a completar tu historial. 📊`);

    // Follow up
    response.messages.push('¿Hubo algún otro día de esta semana que quieras contarme?');
  } else {
    response.messages.push('Cuéntame más sobre esos días. ¿Cómo te sentiste? ¿Qué pasó?');
  }

  return response;
}

/* ── Sleep share ── */
function processSleepShare(text, central) {
  const tl = text.toLowerCase();
  const response = { messages: [], saved: [] };

  let sueno = 3;
  if (/bien|genial|excelente|profundo|rico/.test(tl)) sueno = 5;
  else if (/ok|normal|regular/.test(tl)) sueno = 3;
  else if (/mal|poco|pésimo|horrible|no pude|insomnio|desvel/.test(tl)) sueno = 1;

  // Save to estado if not done today
  const todayEstados = central.estados.filter(e => e.fecha === central.today);
  if (todayEstados.length === 0) {
    const periodo = db.getEstadoPeriodoActual();
    if (periodo) {
      const estado = detectEmotionalState(tl);
      try {
        db.saveEstadoObligatorio(central.today, periodo.key, {
          estado_general: estado.estado_general,
          energia: sueno >= 3 ? 4 : 2,
          estres: estado.estres,
          enfoque: sueno >= 3 ? 4 : 2,
          sueno: sueno,
          nota: text,
        });
        response.saved.push({ field: 'sueño', value: `${sueno}/5` });
      } catch(e) {}
    }
  }

  if (sueno <= 2) {
    response.messages.push('Dormir mal afecta todo. Intenta hoy acostarte un poco antes, aunque sea 30 minutos.');
  } else if (sueno >= 4) {
    response.messages.push('¡Bien! Buen descanso es la base de todo lo demás.');
  } else {
    response.messages.push('Anotado. El sueño es importante, lo voy a trackear.');
  }

  return response;
}

/* ── Helpers de análisis ── */
function buildDayAnalysis(central) {
  const response = { messages: [], saved: [] };
  const todayEstados = central.estados.filter(e => e.fecha === central.today);

  if (todayEstados.length > 0) {
    const last = todayEstados[todayEstados.length - 1];
    const nivel = ['', 'muy mal', 'bajo', 'normal', 'bien', 'excelente'][last.estado_general] || 'sin dato';
    response.messages.push(`Según lo que me contaste: te sientes "${nivel}", energía ${last.energia}/5.`);
    if (last.emocion) response.messages.push(`Emoción: ${last.emocion}`);
  }
  const habitsHoy = central.habitStats.filter(h => h.completedToday).length;
  if (central.habitStats.length > 0) {
    response.messages.push(`Hábitos hoy: ${habitsHoy}/${central.habitStats.length}.`);
  }
  if (central.keywords.drainPatterns.length > 0) {
    response.messages.push(`Ojo: lo que más te drena es "${central.keywords.drainPatterns[0]}". 💡`);
  }
  if (response.messages.length === 0) {
    response.messages.push('Todavía no tengo mucha data de hoy. Cuéntame cómo estás.');
  }
  return response;
}

function buildSmartSuggestion(central) {
  const response = { messages: [], saved: [] };
  const tips = [];
  const weakHabits = central.habitStats.filter(h => h.rate7 < 40 && h.rate7 >= 0);
  if (weakHabits.length > 0) {
    tips.push(`Te cuesta mantener: ${weakHabits.map(h => h.name).join(', ')}. Quizás hacerlos más chicos ayude.`);
  }
  const recentEstados = central.estados.slice(-6);
  if (recentEstados.length >= 3) {
    const avgStress = recentEstados.reduce((s, e) => s + (e.estres || 3), 0) / recentEstados.length;
    if (avgStress >= 3.5) tips.push('Tu estrés viene alto. ¿Has probado meditar o caminar un rato?');
  }
  if (central.keywords.boostPatterns.length > 0) {
    tips.push(`Lo que te da energía: "${central.keywords.boostPatterns[0]}". Haz más de eso.`);
  }
  if (tips.length === 0) {
    response.messages.push('¡Vas bien! Mantén la constancia. 💪');
  } else {
    response.messages.push('Algunas cosas que noto:');
    tips.forEach(t => response.messages.push('• ' + t));
  }
  return response;
}

function buildResumen(central) {
  const response = { messages: [], saved: [] };
  const items = [];
  items.push(`${central.perfilFaltantes.length <= 2 ? '✅' : '⬜'} Perfil`);
  items.push(`${central.habits.length >= 3 ? '✅' : '⬜'} Hábitos (${central.habits.length})`);
  items.push(`${central.rutinaBloques >= 5 ? '✅' : '⬜'} Rutina`);
  items.push(`${central.weeklyObjs.length >= 1 ? '✅' : '⬜'} Objetivos`);
  items.push(`${central.malos.length >= 1 ? '✅' : '⬜'} Malos hábitos`);
  response.messages.push(items.join(' · '));
  return response;
}

function processPersonalShare(text, central) {
  const tl = text.toLowerCase();
  const response = { messages: [], saved: [] };
  const estado = detectEmotionalState(tl);

  // Save as estado if no check-in today
  const todayEstados = central.estados.filter(e => e.fecha === central.today);
  if (todayEstados.length === 0) {
    const periodo = db.getEstadoPeriodoActual();
    if (periodo) {
      try {
        db.saveEstadoObligatorio(central.today, periodo.key, {
          estado_general: estado.estado_general,
          energia: estado.energia,
          estres: estado.estres,
          enfoque: estado.enfoque || 3,
          emocion: detectEmocionFromText(tl),
          nota: text,
        });
        response.saved.push({ field: 'estado', value: `${estado.estado_general}/5` });
      } catch(e) {}
    }
  }

  if (estado.estado_general <= 2) {
    response.messages.push('Oye, gracias por contarme. No siempre son días buenos y está bien.');
    if (central.keywords.boostPatterns.length > 0) {
      response.messages.push(`Antes dijiste que "${central.keywords.boostPatterns[0]}" te da energía. Quizás ayude ahora. 💛`);
    }
  } else if (estado.estado_general >= 4) {
    response.messages.push('¡Buena onda! 😊 Aprovecha esa energía.');
  } else {
    response.messages.push('Entendido. Lo tengo en cuenta. 📝');
  }

  if (/quiero empezar|quiero hacer|debería/.test(tl)) {
    const actMatch = tl.match(/(?:empezar|hacer|debería)\s+(?:a\s+)?(.{3,35}?)(?:\.|,|pero|y |$)/);
    if (actMatch) {
      const activity = capitalize(actMatch[1].trim());
      try { db.createHabit(activity, detectArea(activity)); } catch(e) {}
      response.messages.push(`Te creé "${activity}" como hábito. ✅`);
      response.saved.push({ field: 'hábito', value: activity });
    }
  }

  return response;
}

/* ═══════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════ */

function detectArea(text) {
  const t = text.toLowerCase();
  if (/ejercicio|correr|gym|deporte|caminar|nadar|yoga|pesas/.test(t)) return 'salud';
  if (/leer|estudi|libro|curso|aprend/.test(t)) return 'desarrollo';
  if (/meditar|relaj|respir|mindful/.test(t)) return 'bienestar';
  if (/comer|aliment|agua|dieta|cocin/.test(t)) return 'salud';
  if (/trabajo|productiv|foco|enfoque/.test(t)) return 'productividad';
  if (/dinero|ahorro|finanz/.test(t)) return 'finanzas';
  if (/social|amig|famil/.test(t)) return 'social';
  return 'general';
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function padHora(h) {
  if (h.includes(':')) {
    const [hh, mm] = h.split(':');
    return hh.padStart(2, '0') + ':' + mm.padStart(2, '0');
  }
  return h.padStart(2, '0') + ':00';
}

function savePerfil(data) {
  const current = db.getPerfil() || {};
  const merged = { ...current, ...data };
  const defaults = {
    nombre:'',edad:'',genero:'',ocupacion:'',objetivos:'',areas_mejorar:'',
    situacion_familiar:'',hijos:'',pareja:'',horas_trabajo:'',
    energia_general:'',alimentacion:'',sueno:'',salud_fisica:'',
    consumos:'',deporte_actual:'',ansiedad_general:'',animo_general:'',
    estres_general:'',irritabilidad:'',calidad_relaciones:'',soledad:'',
    apoyo_social:'',satisfaccion_laboral:'',burnout:'',proposito:'',
    nivel_disciplina:'',cronotipo:'',situacion_economica:'',ahorra:'',
    obstaculos:'',vicios:'',area_fallo:'',habito_deseado:'',tiempo_disponible:'',
  };
  Object.keys(defaults).forEach(k => { if (merged[k] === undefined) merged[k] = defaults[k]; });
  db.upsertPerfil(merged);
}

function detectEmotionalState(text) {
  const state = { estado_general: 3, energia: 3, estres: 3, enfoque: 3 };

  if (/genial|excelente|increíble|incre[ií]ble|feliz|contento|motivad|energiz|entusiasm|muy bien|de pana|bakan|bacán/.test(text)) {
    state.estado_general = 5; state.energia = 5; state.estres = 1; state.enfoque = 4;
  } else if (/bien|tranquil|ok|relaj|content|decent|piola|bn/.test(text)) {
    state.estado_general = 4; state.energia = 4; state.estres = 2; state.enfoque = 4;
  } else if (/m[aá]s o menos|regular|ah[ií]|maso|masomenos|normal|ni fu ni fa|tir[aá]ndo/.test(text)) {
    state.estado_general = 3; state.energia = 3; state.estres = 3; state.enfoque = 3;
  } else if (/cansad|agotad|sin energ|flojo|pesado|baj[oó]n|muert|fundid|reven/.test(text)) {
    state.estado_general = 2; state.energia = 1; state.estres = 3; state.enfoque = 2;
  } else if (/mal|p[eé]simo|horrible|terrible|triste|deprim|angustiad|para la cag/.test(text)) {
    state.estado_general = 1; state.energia = 1; state.estres = 4; state.enfoque = 1;
  } else if (/estresad|ansios|presion|nervios|agobiad|colapsad/.test(text)) {
    state.estado_general = 2; state.energia = 3; state.estres = 5; state.enfoque = 2;
  }

  return state;
}

function detectEmocionFromText(text) {
  // Map free text to emotion labels from the circumplex
  if (/entusiasm|emocionad|energiz|hyped/.test(text)) return 'Entusiasmado';
  if (/feliz|contento|alegr/.test(text)) return 'Contento';
  if (/tranquil|calm|sereno|relaj|paz/.test(text)) return 'Sereno';
  if (/agradecid|gratitud/.test(text)) return 'Agradecido';
  if (/ansios|nervios/.test(text)) return 'Ansioso';
  if (/frustrad|rabia/.test(text)) return 'Frustrado';
  if (/estresad|presion|agobiad/.test(text)) return 'Estresado';
  if (/enojad|molest|irritad/.test(text)) return 'Enojado';
  if (/triste|pena|melancol/.test(text)) return 'Triste';
  if (/cansad|agotad|fundid/.test(text)) return 'Agotado';
  if (/aburrido|aburrid/.test(text)) return 'Aburrido';
  if (/desmotivad|apatico|apátic/.test(text)) return 'Desmotivado';
  if (/motivad|inspir|con ganas/.test(text)) return 'Motivado';
  if (/satisfech|orgullos/.test(text)) return 'Satisfecho';
  if (/esperanzad|optimist/.test(text)) return 'Esperanzado';
  return '';
}

function extractHabitsFromText(text, central) {
  const tl = text.toLowerCase();
  const existing = central.habits.map(h => h.name.toLowerCase());
  const habits = [];

  const patterns = [
    { rx: /(?:hacer\s+)?ejercicio|entrenar|gym|ir al gym/i, name: 'Ejercicio', area: 'salud' },
    { rx: /correr|trotar|running/i, name: 'Correr', area: 'salud' },
    { rx: /caminar|pasear/i, name: 'Caminar 30min', area: 'salud' },
    { rx: /leer|lectura/i, name: 'Leer 20min', area: 'desarrollo' },
    { rx: /meditar|meditaci[oó]n/i, name: 'Meditar 10min', area: 'bienestar' },
    { rx: /agua|tomar agua|hidrat/i, name: 'Tomar agua 2L', area: 'salud' },
    { rx: /dormir bien|acostarme temprano|7.*horas|sueño/i, name: 'Dormir 7+ horas', area: 'salud' },
    { rx: /estudiar|estudio/i, name: 'Estudiar 1h', area: 'desarrollo' },
    { rx: /cocinar|comer\s*(?:bien|sano|saludable)/i, name: 'Comer saludable', area: 'salud' },
    { rx: /escribir|journaling|diario/i, name: 'Journaling', area: 'bienestar' },
    { rx: /no\s*(?:celular|redes|pantalla)|desconectar|sin redes/i, name: 'Sin redes 1h', area: 'bienestar' },
    { rx: /yoga/i, name: 'Yoga', area: 'salud' },
    { rx: /estirar|stretch|elongar/i, name: 'Estiramientos', area: 'salud' },
    { rx: /respir|respiraci[oó]n/i, name: 'Respiración consciente', area: 'bienestar' },
    { rx: /orden|ordenar|limpiar/i, name: 'Ordenar espacio', area: 'productividad' },
    { rx: /agradecer|gratitud/i, name: 'Gratitud diaria', area: 'bienestar' },
    { rx: /planificar|planear|agenda/i, name: 'Planificar el día', area: 'productividad' },
    { rx: /despertar temprano|madrugar|levantarme temprano/i, name: 'Despertar temprano', area: 'productividad' },
    { rx: /no fumar|dejar.+cigarro/i, name: 'No fumar', area: 'salud' },
    { rx: /vitaminas|suplementos/i, name: 'Tomar vitaminas', area: 'salud' },
    { rx: /ducha fr[ií]a/i, name: 'Ducha fría', area: 'salud' },
    { rx: /m[uú]sica|tocar|instrumento|guitarra|piano/i, name: 'Practicar música', area: 'creatividad' },
  ];

  patterns.forEach(p => {
    if (p.rx.test(tl) && !existing.includes(p.name.toLowerCase())) {
      habits.push({ name: p.name, area: p.area });
    }
  });

  // Comma-separated list
  if (habits.length === 0 && text.includes(',')) {
    text.split(',').forEach(item => {
      const clean = item.trim();
      if (clean.length > 1 && clean.length < 50 && !existing.includes(clean.toLowerCase())) {
        habits.push({ name: capitalize(clean), area: detectArea(clean) });
      }
    });
  }

  // "y" separator
  if (habits.length === 0 && / y /.test(text)) {
    text.split(/ y /i).forEach(item => {
      const clean = item.trim();
      if (clean.length > 1 && clean.length < 50 && !existing.includes(clean.toLowerCase())) {
        // Try pattern match first
        let matched = false;
        patterns.forEach(p => {
          if (p.rx.test(clean.toLowerCase()) && !existing.includes(p.name.toLowerCase()) && !habits.some(h => h.name === p.name)) {
            habits.push({ name: p.name, area: p.area });
            matched = true;
          }
        });
        if (!matched) habits.push({ name: capitalize(clean), area: detectArea(clean) });
      }
    });
  }

  return habits;
}

function extractMalosFromText(text) {
  const tl = text.toLowerCase();
  const malos = [];

  const patterns = [
    { rx: /redes\s*sociales|celular|pantalla|scrolle|instagram|tiktok/i, name: 'Redes sociales excesivas', cat: 'digital', imp: 7 },
    { rx: /trasnochar|acost.+tarde|dormir\s*tarde|acuesto\s*tarde|desvelo/i, name: 'Trasnochar', cat: 'salud', imp: 7 },
    { rx: /comida\s*chatarra|comer\s*mal|comida\s*basura|mc\s*donald|pizza|chatarra/i, name: 'Comida chatarra', cat: 'salud', imp: 6 },
    { rx: /procrastin|postergar|dejar\s*todo|flojear|flojera/i, name: 'Procrastinar', cat: 'productividad', imp: 7 },
    { rx: /fumar|cigarro|vape|vapear/i, name: 'Fumar/Vapear', cat: 'salud', imp: 9 },
    { rx: /alcohol|tomar\s*(?:mucho|de\s*m[aá]s)|carrete/i, name: 'Alcohol en exceso', cat: 'salud', imp: 8 },
    { rx: /cafe[ií]na|caf[eé]|mucho\s*caf[eé]/i, name: 'Exceso de cafeína', cat: 'salud', imp: 5 },
    { rx: /no\s*(?:hacer\s*)?ejercicio|sedentari|no me muevo/i, name: 'Sedentarismo', cat: 'salud', imp: 6 },
    { rx: /youtube|netflix|series|tiktok|pantallas/i, name: 'Pantallas excesivas', cat: 'digital', imp: 6 },
    { rx: /gast|comprar|compras\s*impulsiv/i, name: 'Gastos impulsivos', cat: 'finanzas', imp: 6 },
    { rx: /quejarme|negativi|pesimis/i, name: 'Negatividad', cat: 'bienestar', imp: 5 },
    { rx: /no tomar agua|poca agua|no me hidrato/i, name: 'No tomar agua', cat: 'salud', imp: 4 },
  ];

  patterns.forEach(p => {
    if (p.rx.test(tl)) {
      malos.push({ name: p.name, categoria: p.cat, impacto: p.imp });
    }
  });

  if (malos.length === 0 && text.includes(',')) {
    text.split(',').forEach(item => {
      const clean = item.trim();
      if (clean.length > 2 && clean.length < 60) {
        malos.push({ name: capitalize(clean), categoria: 'general', impacto: 5 });
      }
    });
  }

  if (malos.length === 0 && / y /.test(text)) {
    text.split(/ y /i).forEach(item => {
      const clean = item.trim();
      if (clean.length > 2 && clean.length < 60) {
        let matched = false;
        patterns.forEach(p => {
          if (p.rx.test(clean.toLowerCase()) && !malos.some(m => m.name === p.name)) {
            malos.push({ name: p.name, categoria: p.cat, impacto: p.imp });
            matched = true;
          }
        });
        if (!matched) malos.push({ name: capitalize(clean), categoria: 'general', impacto: 5 });
      }
    });
  }

  return malos;
}

function buildRutinaFromHoras(despertar, dormir, central) {
  const t = central.keywords.themes;
  const bloques = [
    { inicio: despertar, fin: sumarMinutos(despertar, 10), nombre: 'Despertar', categoria: 'rutina' },
    { inicio: sumarMinutos(despertar, 10), fin: sumarMinutos(despertar, 30), nombre: 'Preparación', categoria: 'rutina' },
    { inicio: sumarMinutos(despertar, 30), fin: sumarMinutos(despertar, 60), nombre: 'Desayuno', categoria: 'alimentacion' },
  ];
  if (t.meditacion) {
    bloques.push({ inicio: sumarMinutos(despertar, 60), fin: sumarMinutos(despertar, 75), nombre: 'Meditación', categoria: 'bienestar' });
  }
  bloques.push(
    { inicio: sumarMinutos(despertar, 75), fin: '12:00', nombre: 'Bloque de trabajo/estudio', categoria: 'trabajo' },
    { inicio: '12:00', fin: '13:00', nombre: 'Almuerzo', categoria: 'alimentacion' },
    { inicio: '13:00', fin: '17:00', nombre: 'Bloque de trabajo/estudio', categoria: 'trabajo' },
    { inicio: '18:00', fin: '19:00', nombre: 'Ejercicio', categoria: 'ejercicio' },
    { inicio: '19:00', fin: '20:00', nombre: 'Cena', categoria: 'alimentacion' },
    { inicio: '20:00', fin: sumarMinutos(dormir, -30), nombre: 'Tiempo libre', categoria: 'ocio' },
    { inicio: sumarMinutos(dormir, -30), fin: dormir, nombre: 'Cierre del día', categoria: 'rutina' },
  );
  if (t.estudio) {
    bloques.splice(bloques.length - 2, 0, { inicio: '20:00', fin: '21:00', nombre: 'Estudio', categoria: 'desarrollo' });
  }
  return bloques;
}

/* ═══════════════════════════════════════════════════
   API ENDPOINTS
   ═══════════════════════════════════════════════════ */

router.get('/status', (req, res) => {
  try {
    const central = buildCentral();
    const totalAreas = 6;
    const completadas = [
      central.perfilFaltantes.length <= 2, // nombre already saved
      central.habits.length >= 3,
      central.rutinaBloques >= 5,
      central.weeklyObjs.length >= 1 || central.monthlyObjs.length >= 1,
      central.malos.length >= 1,
      central.estados.length > 0 || central.checkins.length > 0,
    ].filter(Boolean).length;

    res.json({
      perfil: {
        existe: !!central.perfil,
        completo: central.perfilFaltantes.length === 0,
        completados: central.perfilCompletos.length,
        total: 6,
        faltantes: central.perfilFaltantes,
        data: central.perfil,
      },
      habits: { cantidad: central.habits.length, completo: central.habits.length >= 3, nombres: central.habits.map(h => h.name) },
      malosHabitos: { cantidad: central.malos.length, completo: central.malos.length >= 1 },
      rutina: { bloques: central.rutinaBloques, completo: central.rutinaBloques >= 5 },
      checkin: { hecho: central.estados.some(e => e.fecha === central.today) },
      objetivos: { semanales: central.weeklyObjs.length, completo: central.weeklyObjs.length >= 1 || central.monthlyObjs.length >= 1 },
      context: {
        notasCount: central.notas.length,
        reflexionesCount: central.reflexiones.length,
        estadosCount: central.estados.length,
        themes: central.keywords.themes,
      },
      progreso: Math.round((completadas / totalAreas) * 100),
    });
  } catch(e) {
    res.json({ error: e.message });
  }
});

// POST /api/clauch/chat — the main conversational endpoint
router.post('/chat', (req, res) => {
  try {
    const { message, lastQuestion } = req.body;
    if (!message || !message.trim()) return res.json({ error: 'No message' });

    const central = buildCentral();

    // Process the answer to pending question
    let answerResult = null;
    if (lastQuestion) {
      answerResult = processAnswer(message, lastQuestion, central);
    }
    if (!answerResult) {
      answerResult = processFreeMessage(message, central);
    }

    // If estado was saved, clear the clauchNew flag so estado blocker activates normally
    if (answerResult.saved && answerResult.saved.some(s => s.field === 'estado')) {
      if (req._clearClauchNew) req._clearClauchNew();
    }

    // Re-build central after changes
    const updated = buildCentral();

    // Get next question
    let nextQ = null;
    if (!answerResult.retry) {
      nextQ = getNextQuestion(updated, lastQuestion);
    } else {
      nextQ = { id: lastQuestion, text: null };
    }

    const msgs = answerResult.messages || [];

    // Add next question
    if (nextQ && nextQ.text) {
      msgs.push(nextQ.text);
    }

    // All done message
    if (!nextQ && !answerResult.retry && msgs.length > 0) {
      const nombre = updated.perfil?.nombre || '';
      const allDone = updated.habits.length >= 3 && updated.malos.length >= 1;
      if (allDone) {
        msgs.push(`${nombre ? nombre + ', ¡l' : '¡L'}isto! Ya tienes todo configurado. Ahora solo usa la app día a día y cuéntame cómo te va. Estoy aquí siempre que me necesites. 💛`);
      }
    }

    res.json({
      messages: msgs,
      nextQuestion: nextQ ? nextQ.id : null,
      saved: answerResult.saved || [],
      allDone: !nextQ && !answerResult.retry,
    });
  } catch(e) {
    console.error('Clauch error:', e);
    res.json({ messages: ['Ups, algo falló. ¿Puedes repetir?'], nextQuestion: null, saved: [] });
  }
});

// POST /api/clauch/fill (compatibility)
router.post('/fill', (req, res) => {
  try {
    const { topic, data } = req.body;
    if (topic === 'habits' && Array.isArray(data)) {
      data.forEach(h => { try { db.createHabit(h.name, h.area || 'general'); } catch(e) {} });
      return res.json({ ok: true, msg: `${data.length} hábitos creados` });
    }
    if (topic === 'malos' && Array.isArray(data)) {
      data.forEach(h => { try { db.createMaloHabito(h.name, h.categoria || 'general', h.impacto || 5); } catch(e) {} });
      return res.json({ ok: true, msg: `${data.length} malos hábitos registrados` });
    }
    res.json({ error: 'Invalid' });
  } catch(e) { res.json({ error: e.message }); }
});

// POST /api/clauch/clear-new — remove the clauchNew flag after first conversation
router.post('/clear-new', (req, res) => {
  // This is called by frontend after Clauch completes the initial flow
  // The session flag needs to be cleared server-side
  res.json({ ok: true });
});

module.exports = router;
