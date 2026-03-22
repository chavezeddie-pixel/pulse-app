const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/', (req, res) => {
  const weekStart  = db.weekStartStr();
  const monthYear  = db.currentMonthYear();
  const weeklyObjs  = db.getWeeklyObjectives(weekStart);
  const monthlyObjs = db.getMonthlyObjectives(monthYear);
  res.render('objectives', { weeklyObjs, monthlyObjs, weekStart, monthYear, page: 'objectives' });
});

// ── Weekly ──
router.post('/weekly', (req, res) => {
  db.createWeeklyObjective({
    name: req.body.name,
    area: req.body.area || 'personal',
    priority: req.body.priority || 'media',
    deadline: req.body.deadline || null,
    week_start: db.weekStartStr(),
  });
  res.redirect('/objectives');
});

// AJAX: toggle status
router.post('/weekly/:id/status', (req, res) => {
  const id = parseInt(req.params.id);
  const status = req.body.status;
  const progress = status === 'completado' ? 100 : parseInt(req.body.progress) || 0;
  db.updateWeeklyObjectiveStatus(id, status, progress);
  if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
    return res.json({ ok: true, status, progress });
  }
  res.redirect('/objectives');
});

router.delete('/weekly/:id', (req, res) => {
  db.deleteWeeklyObjective(parseInt(req.params.id));
  res.redirect('/objectives');
});

// ── Monthly ──
router.post('/monthly', (req, res) => {
  db.createMonthlyObjective({
    name: req.body.name,
    description: req.body.description || '',
    category: req.body.category || 'personal',
    progress_indicator: req.body.progress_indicator || '',
    target_date: req.body.target_date || null,
    month_year: db.currentMonthYear(),
  });
  res.redirect('/objectives');
});

// AJAX: update percentage + status
router.post('/monthly/:id/update', (req, res) => {
  const id = parseInt(req.params.id);
  const percentage = parseInt(req.body.percentage) || 0;
  const status = req.body.status || (percentage >= 100 ? 'completado' : 'en proceso');
  db.updateMonthlyObjective(id, { percentage, status });
  if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
    return res.json({ ok: true, percentage, status });
  }
  res.redirect('/objectives');
});

router.delete('/monthly/:id', (req, res) => {
  db.deleteMonthlyObjective(parseInt(req.params.id));
  res.redirect('/objectives');
});

module.exports = router;
