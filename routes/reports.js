const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/', (req, res) => {
  const period = req.query.period || 'week';
  const data = db.getReportData(period);
  const alerts = db.generateAlerts();
  const chartLabels = data.checkins.map(c => c.date.slice(5));
  res.render('reports', {
    ...data,
    alerts,
    page: 'reports',
    chartData: JSON.stringify({
      labels: chartLabels,
      energy: data.checkins.map(c => c.energy),
      mood: data.checkins.map(c => c.mood),
      clarity: data.checkins.map(c => c.clarity),
      anxiety: data.checkins.map(c => c.anxiety),
      sleep: data.checkins.map(c => c.sleep_hours),
    }),
  });
});

module.exports = router;
