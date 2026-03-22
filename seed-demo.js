process.env.DB_PATH = require('path').join(__dirname, 'data', 'demo.db');
const db = require('./database-demo');

console.log('Cargando datos demo...');

const habits = [
  { name: 'Levantarme a las 6:00', area: 'disciplina' },
  { name: 'Hacer ejercicio', area: 'ejercicio' },
  { name: 'Estudiar 30 minutos', area: 'estudio' },
  { name: 'Tomar agua 2 litros', area: 'energia' },
  { name: 'Revisar finanzas', area: 'finanzas' },
  { name: 'Cierre del dia', area: 'disciplina' },
];
habits.forEach(h => { try { db.createHabit(h.name, h.area); } catch(e) {} });

const malos = [
  { name: 'Redes sociales en exceso', categoria: 'tecnologia', impacto: 8 },
  { name: 'Dormir tarde', categoria: 'sueno', impacto: 7 },
  { name: 'Comer mal', categoria: 'alimentacion', impacto: 6 },
];
malos.forEach(m => { try { db.createMaloHabito(m.name, m.categoria, m.impacto); } catch(e) {} });

const w = db.weekStartStr();
const month = db.currentMonthYear();
try { db.createWeeklyObjective({ name:'Entrenar 3 veces', area:'ejercicio', priority:'alta', deadline:null, week_start:w }); } catch(e) {}
try { db.createWeeklyObjective({ name:'Estudiar Python', area:'estudio', priority:'alta', deadline:null, week_start:w }); } catch(e) {}
try { db.createWeeklyObjective({ name:'Revision financiera', area:'finanzas', priority:'media', deadline:null, week_start:w }); } catch(e) {}
try { db.createMonthlyObjective({ name:'Cerrar 5 ventas', description:'', category:'profesional', progress_indicator:'', target_date:null, month_year:month }); } catch(e) {}
try { db.createMonthlyObjective({ name:'Leer 1 libro', description:'', category:'aprendizaje', progress_indicator:'', target_date:null, month_year:month }); } catch(e) {}

for (let i = 6; i >= 0; i--) {
  const d = new Date(); d.setDate(d.getDate()-i);
  const fecha = d.toISOString().split('T')[0];
  try {
    db.upsertCheckin({
      date: fecha,
      energy: Math.floor(Math.random()*3)+6,
      mood: Math.floor(Math.random()*3)+6,
      clarity: Math.floor(Math.random()*3)+5,
      anxiety: Math.floor(Math.random()*3)+2,
      sleep_hours: (Math.random()*2+6).toFixed(1),
      did_exercise: Math.random()>0.4?1:0,
      did_study: Math.random()>0.5?1:0,
      completed_main: Math.random()>0.3?1:0,
      free_comment: '',
      did_well: 'Complete mis tareas principales',
      improve_tomorrow: 'Dormir antes',
    });
  } catch(e) {}
}

console.log('Demo listo.');
