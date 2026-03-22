const express = require('express');
const router  = express.Router();
const db      = require('../database');

// Extract #tags from text
function extractTags(text) {
  if (!text) return [];
  const matches = text.match(/#[\w\u00C0-\u024F]+/g) || [];
  return [...new Set(matches.map(t => t.toLowerCase()))];
}

// Word count
function wordCount(text) {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

router.get('/', (req, res) => {
  const today = db.todayStr();
  const notas  = db.getAllNotas();

  // Enrich each nota with tags + wordCount
  const notasRich = notas.map(n => ({
    ...n,
    tags:  extractTags((n.titulo || '') + ' ' + n.contenido),
    words: wordCount(n.contenido),
  }));

  // All unique tags with count
  const tagMap = {};
  notasRich.forEach(n => n.tags.forEach(t => {
    tagMap[t] = (tagMap[t] || 0) + 1;
  }));
  const allTags = Object.entries(tagMap)
    .sort((a, b) => b[1] - a[1])
    .map(([tag, count]) => ({ tag, count }));

  // Stats
  const totalNotas  = notas.length;
  const totalPalabras = notasRich.reduce((s, n) => s + n.words, 0);
  const mesStart = new Date(today); mesStart.setDate(mesStart.getDate() - 30);
  const notasMes = notasRich.filter(n => n.fecha >= mesStart.toISOString().split('T')[0]).length;

  // Writing streak (consecutive days with at least one nota)
  const fechasSet = new Set(notas.map(n => n.fecha));
  let racha = 0;
  for (let i = 0; i < 60; i++) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const ds = d.toISOString().split('T')[0];
    if (fechasSet.has(ds)) racha++;
    else break;
  }

  // Last 30 days activity (for heatmap)
  const activ30 = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(today); d.setDate(d.getDate() - (29 - i));
    const ds = d.toISOString().split('T')[0];
    const count = notas.filter(n => n.fecha === ds).length;
    return { fecha: ds, count };
  });

  res.render('notas', {
    notas: notasRich,
    today,
    page: 'notas',
    allTags,
    totalNotas,
    totalPalabras,
    notasMes,
    racha,
    activ30,
  });
});

router.post('/', (req, res) => {
  const { fecha, titulo, contenido } = req.body;
  if (contenido && contenido.trim()) {
    db.createNota(fecha || db.todayStr(), titulo || '', contenido.trim());
  }
  if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
    return res.json({ ok: true });
  }
  res.redirect('/notas');
});

router.delete('/:id', (req, res) => {
  db.deleteNota(parseInt(req.params.id));
  if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
    return res.json({ ok: true });
  }
  res.redirect('/notas');
});

module.exports = router;
