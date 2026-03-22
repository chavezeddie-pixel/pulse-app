require('dotenv').config();
const path = require('path');

// Reemplazar database por database-demo ANTES de cargar las rutas
require.cache[require.resolve('./database')] = require.cache[require.resolve('./database-demo')] || { exports: require('./database-demo') };

const express = require('express');
const methodOverride = require('method-override');

const app = express();
const PORT = 4001;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));

app.use((req, res, next) => {
  res.locals.demoMode = true;
  next();
});

app.get('/', (req, res) => {
  try {
    const db = require('./database-demo');
    const data = db.getDashboardData();
    res.render('dashboard', {...data, page:'dashboard'});
  } catch(err) {
    console.error(err);
    res.status(500).send('<pre>'+err.message+'</pre>');
  }
});

app.use('/checkin', require('./routes/checkin'));
app.use('/habits', require('./routes/habits'));
app.use('/objectives', require('./routes/objectives'));
app.use('/reports', require('./routes/reports'));
app.use('/notas', require('./routes/notas'));
app.use('/mejora', require('./routes/mejora'));
app.use('/reflexion', require('./routes/reflexion'));
app.use('/perfil', require('./routes/perfil'));
app.use('/malos', require('./routes/malos'));
app.get('/rutina', (req,res) => res.render('rutina', {page:'rutina'}));
app.get('/calendario', (req,res) => res.render('calendario', {page:'calendario'}));

app.get('/api/calendario', (req,res) => {
  const db = require('./database-demo');
  const mes = parseInt(req.query.mes) || new Date().getMonth()+1;
  const anio = parseInt(req.query.anio) || new Date().getFullYear();
  const start = anio+'-'+String(mes).padStart(2,'0')+'-01';
  const end = anio+'-'+String(mes).padStart(2,'0')+'-31';
  const checkins = db.getCheckinsRange(start, end);
  const habits = db.getAllHabits();
  const hc = {};
  habits.forEach(h => {
    db.getHabitCompletionDates(h.id).forEach(d => {
      if(!hc[d]) hc[d] = [];
      hc[d].push(h.id);
    });
  });
  hc._total = habits.length;
  res.json({checkins, habitCompletions: hc});
});

app.get('/feedback', (req, res) => {
  res.render('feedback', { page: 'feedback', enviado: false });
});

app.post('/feedback', (req, res) => {
  const Database = require('better-sqlite3');
  const db = new Database(path.join(__dirname, 'data', 'tracker.db'));
  try {
    db.exec('CREATE TABLE IF NOT EXISTS demo_feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT, email TEXT, comentario TEXT, puntuacion INTEGER, created_at TEXT DEFAULT (datetime(\'now\')))');
    db.prepare('INSERT INTO demo_feedback (nombre, email, comentario, puntuacion) VALUES (?,?,?,?)').run(req.body.nombre||'', req.body.email||'', req.body.comentario||'', parseInt(req.body.puntuacion)||5);
  } catch(e) { console.error(e); }
  res.render('feedback', { page: 'feedback', enviado: true });
});

app.listen(PORT, () => {
  console.log('Demo corriendo en http://localhost:' + PORT);
});
```

Guarda con ⌘+S. Luego en la terminal:
```
pkill -f "demo.js" ; sleep 1 ; PORT=4001 node demo.js &