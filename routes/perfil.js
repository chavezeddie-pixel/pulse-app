const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/', (req, res) => {
  const perfil = db.getPerfil();
  const report = db.getReportData('month');
  const chartData = JSON.stringify({
    labels:  report.checkins.map(c => c.date.slice(5)),
    energy:  report.checkins.map(c => c.energy),
    mood:    report.checkins.map(c => c.mood),
    clarity: report.checkins.map(c => c.clarity),
    anxiety: report.checkins.map(c => c.anxiety),
  });
  res.render('perfil', {
    perfil, page: 'perfil',
    checkins:     report.checkins,
    summary:      report.summary,
    strengths:    report.strengths,
    weaknesses:   report.weaknesses,
    habitStats:   report.habitStats,
    chartData,
  });
});

router.post('/', (req, res) => {
  const arr = (v) => Array.isArray(v) ? v : (v ? [v] : []);
  const data = {
    nombre: req.body.nombre || '',
    edad: parseInt(req.body.edad) || 0,
    genero: req.body.genero || '',
    situacion_familiar: arr(req.body.situacion_familiar),
    hijos: req.body.hijos || '',
    pareja: req.body.pareja || '',
    ocupacion: arr(req.body.ocupacion),
    horas_trabajo: req.body.horas_trabajo || '',
    energia_general: arr(req.body.energia_general),
    alimentacion: arr(req.body.alimentacion),
    sueno: arr(req.body.sueno),
    salud_fisica: arr(req.body.salud_fisica),
    consumos: arr(req.body.consumos),
    deporte_actual: req.body.deporte_actual || '',
    ansiedad_general: req.body.ansiedad_general || '',
    animo_general: req.body.animo_general || '',
    estres_general: req.body.estres_general || '',
    irritabilidad: req.body.irritabilidad || '',
    calidad_relaciones: req.body.calidad_relaciones || '',
    soledad: req.body.soledad || '',
    apoyo_social: req.body.apoyo_social || '',
    satisfaccion_laboral: req.body.satisfaccion_laboral || '',
    burnout: req.body.burnout || '',
    proposito: req.body.proposito || '',
    nivel_disciplina: req.body.nivel_disciplina || '',
    cronotipo: req.body.cronotipo || '',
    situacion_economica: req.body.situacion_economica || '',
    ahorra: req.body.ahorra || '',
    objetivos: arr(req.body.objetivos),
    areas_mejorar: arr(req.body.areas_mejorar),
    obstaculos: arr(req.body.obstaculos),
    vicios: arr(req.body.vicios),
    area_fallo: req.body.area_fallo || '',
    habito_deseado: arr(req.body.habito_deseado),
    tiempo_disponible: req.body.tiempo_disponible || '',
  };
  db.upsertPerfil(data);
  res.redirect('/perfil');
});

module.exports = router;