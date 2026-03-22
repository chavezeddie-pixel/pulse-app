
const db = require('./database');
const habits = [
  { name: 'Levantarme a las 6:00', area: 'disciplina' },
  { name: 'Hacer ejercicio', area: 'ejercicio' },
  { name: 'Estudiar 30 minutos', area: 'estudio' },
  { name: 'Cierre del dia', area: 'disciplina' },
  { name: 'Tomar agua 2 litros', area: 'energia' },
  { name: 'Revisar finanzas', area: 'finanzas' },
  { name: 'Escribir en cuaderno', area: 'salud mental' },
  { name: 'Caminar 30 min', area: 'ejercicio' },
];
habits.forEach(h => { try { db.createHabit(h.name, h.area); } catch(e) {} });
const w = db.weekStartStr();
const m = db.currentMonthYear();
try { db.createWeeklyObjective({ name:'Entrenar 3 veces', area:'ejercicio', priority:'alta', deadline:null, week_start:w }); } catch(e) {}
try { db.createWeeklyObjective({ name:'Estudiar Python 2 horas', area:'estudio', priority:'alta', deadline:null, week_start:w }); } catch(e) {}
try { db.createWeeklyObjective({ name:'Revision financiera', area:'finanzas', priority:'media', deadline:null, week_start:w }); } catch(e) {}
try { db.createMonthlyObjective({ name:'Cerrar 5 cotizaciones', description:'', category:'profesional', progress_indicator:'', target_date:null, month_year:m }); } catch(e) {}
try { db.createMonthlyObjective({ name:'Leer 1 libro', description:'', category:'aprendizaje', progress_indicator:'', target_date:null, month_year:m }); } catch(e) {}
try { db.upsertCheckin({ date:db.todayStr(), energy:7, mood:6, clarity:7, anxiety:3, sleep_hours:7.5, did_exercise:1, did_study:0, completed_main:1, free_comment:'Buen dia.', did_well:'Termine el bloque principal.', improve_tomorrow:'Estudiar 30 min.' }); } catch(e) {}
console.log('Listo!');
