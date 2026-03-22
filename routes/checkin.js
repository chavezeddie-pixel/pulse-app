const express = require('express');
const router  = express.Router();
const db      = require('../database');

router.get('/', (req, res) => {
  const date   = req.query.date || db.todayStr();
  const checkin = db.getCheckin(date);

  // Ayer
  const ayerDate = new Date(date); ayerDate.setDate(ayerDate.getDate()-1);
  const checkinAyer = db.getCheckin(ayerDate.toISOString().split('T')[0]);

  // Últimos 7 checkins (para sparkline)
  const ultimos7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(date); d.setDate(d.getDate() - i);
    const ds = d.toISOString().split('T')[0];
    const c  = db.getCheckin(ds);
    ultimos7.push({ date: ds, score: c ? Math.round((c.energy+c.mood+c.clarity+(10-c.anxiety))/4*10) : null });
  }

  // Racha de check-ins (días consecutivos hasta hoy)
  let racha = 0;
  for (let i = 0; i < 60; i++) {
    const d = new Date(date); d.setDate(d.getDate() - i);
    const ds = d.toISOString().split('T')[0];
    if (db.getCheckin(ds)) racha++;
    else break;
  }

  // Hábitos de hoy
  const habitos = db.getHabits ? db.getHabits() : [];
  const habitLog = db.getHabitLog ? db.getHabitLog(date) : [];
  const habitosHoy = habitos.filter(h => h.active !== 0).map(h => ({
    ...h,
    done: habitLog.some(l => l.habit_id === h.id),
  }));

  res.render('checkin', { date, checkin, checkinAyer, ultimos7, racha, habitosHoy, page: 'checkin' });
});

router.post('/quick', (req, res) => {
  const data = {
    date:             req.body.date || db.todayStr(),
    energy:           parseInt(req.body.energy) || 5,
    mood:             parseInt(req.body.mood) || 5,
    clarity:          parseInt(req.body.clarity) || 5,
    anxiety:          parseInt(req.body.anxiety) || 5,
    sleep_hours:      parseFloat(req.body.sleep_hours) || 7,
    did_exercise:     req.body.did_exercise ? 1 : 0,
    did_study:        req.body.did_study ? 1 : 0,
    completed_main:   req.body.completed_main ? 1 : 0,
    free_comment:     '',
    did_well:         '',
    improve_tomorrow: '',
  };
  db.upsertCheckin(data);
  res.json({ ok: true, data });
});

router.post('/', (req, res) => {
  const data = {
    date:             req.body.date || db.todayStr(),
    energy:           parseInt(req.body.energy) || 5,
    mood:             parseInt(req.body.mood) || 5,
    clarity:          parseInt(req.body.clarity) || 5,
    anxiety:          parseInt(req.body.anxiety) || 5,
    sleep_hours:      parseFloat(req.body.sleep_hours) || 7,
    did_exercise:     req.body.did_exercise === 'on' ? 1 : 0,
    did_study:        req.body.did_study === 'on' ? 1 : 0,
    completed_main:   req.body.completed_main === 'on' ? 1 : 0,
    free_comment:     req.body.free_comment || '',
    did_well:         req.body.did_well || '',
    improve_tomorrow: req.body.improve_tomorrow || '',
  };
  db.upsertCheckin(data);

  // Si viene con AJAX
  if (req.headers['x-requested-with'] === 'XMLHttpRequest') return res.json({ ok: true });
  res.redirect('/');
});

module.exports = router;
