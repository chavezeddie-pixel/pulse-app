/* ═══════════════════════════════════════════════════
   CLAUCH IA — Asistente conversacional de Pulse

   Clauch ES el onboarding. El usuario solo conversa
   y todo se llena solo por detrás. Sin botones,
   sin formularios, pura conversación humana.
   ═══════════════════════════════════════════════════ */

(function() {
  'use strict';

  var enabled = localStorage.getItem('clauch-enabled');
  if (enabled === null) enabled = 'true';

  var isOpen = false;
  var messages = [];
  var currentQuestion = null;
  var started = false;
  var isNew = window.__clauchNew || false;

  /* ═══ DOM ═══ */
  function createWidget() {
    // FAB
    var fab = document.createElement('div');
    fab.id = 'clauch-fab';
    fab.innerHTML = '<span class="cf-icon">💬</span><span class="cf-badge" id="c-badge" style="display:none">1</span>';
    fab.onclick = toggleChat;
    document.body.appendChild(fab);

    // Panel
    var panel = document.createElement('div');
    panel.id = 'clauch-panel';
    panel.innerHTML = [
      '<div class="ch">',
      '  <div class="ch-left">',
      '    <div class="ch-dot-wrap"><span class="ch-dot"></span></div>',
      '    <div><div class="ch-name">Clauch</div><div class="ch-sub">en línea</div></div>',
      '  </div>',
      '  <div class="ch-right">',
      '    <button class="ch-x" onclick="window._cx()">✕</button>',
      '  </div>',
      '</div>',
      '<div class="cm" id="c-msgs"></div>',
      '<div class="ci">',
      '  <input type="text" id="c-inp" placeholder="Escríbeme..." autocomplete="off" />',
      '  <button id="c-btn" onclick="window._cs()">',
      '    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
      '  </button>',
      '</div>',
    ].join('');
    document.body.appendChild(panel);

    // Events
    setTimeout(function() {
      var inp = document.getElementById('c-inp');
      if (inp) inp.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); window._cs(); }
      });
    }, 100);
  }

  /* ═══ TOGGLE ═══ */
  function toggleChat() {
    isOpen = !isOpen;
    var panel = document.getElementById('clauch-panel');
    var fab = document.getElementById('clauch-fab');
    if (isOpen) {
      panel.classList.add('open');
      fab.classList.add('hide');
      hide('c-badge');
      if (!started) startConversation();
      focus();
    } else {
      panel.classList.remove('open');
      fab.classList.remove('hide');
    }
  }

  window._cx = function() {
    isOpen = false;
    document.getElementById('clauch-panel').classList.remove('open');
    document.getElementById('clauch-fab').classList.remove('hide');
  };

  /* ═══ MESSAGES ═══ */
  function bot(text, delay) {
    if (delay) { setTimeout(function() { _msg('b', text); }, delay); }
    else { _msg('b', text); }
  }
  function user(text) { _msg('u', text); }

  function _msg(type, text) {
    messages.push({ t: type, x: text });
    render();
  }

  function typing() {
    var el = document.getElementById('c-msgs');
    if (!el) return;
    var old = document.getElementById('c-typ');
    if (old) old.remove();
    var d = document.createElement('div');
    d.className = 'cm-b';
    d.id = 'c-typ';
    d.innerHTML = '<span class="c-dots"><i></i><i></i><i></i></span>';
    el.appendChild(d);
    el.scrollTop = el.scrollHeight;
  }

  function untyping() {
    var t = document.getElementById('c-typ');
    if (t) t.remove();
  }

  function render() {
    var el = document.getElementById('c-msgs');
    if (!el) return;
    var html = '';
    messages.forEach(function(m) {
      if (m.t === 'b') {
        html += '<div class="cm-b">' + m.x + '</div>';
      } else if (m.t === 'u') {
        html += '<div class="cm-u">' + m.x + '</div>';
      } else if (m.t === 's') {
        html += '<div class="cm-s">' + m.x + '</div>';
      }
    });
    el.innerHTML = html;
    el.scrollTop = el.scrollHeight;
  }

  function focus() {
    setTimeout(function() {
      var inp = document.getElementById('c-inp');
      if (inp) inp.focus();
    }, 300);
  }

  function hide(id) { var e = document.getElementById(id); if (e) e.style.display = 'none'; }
  function show(id) { var e = document.getElementById(id); if (e) e.style.display = 'flex'; }

  /* ═══ API ═══ */
  function chat(text, cb) {
    fetch('/api/clauch/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, lastQuestion: currentQuestion }),
    }).then(function(r) { return r.json(); })
      .then(function(d) { if (cb) cb(d); })
      .catch(function() { if (cb) cb(null); });
  }

  /* ═══ START CONVERSATION ═══ */
  function startConversation() {
    started = true;

    // Fetch status to get name
    fetch('/api/clauch/status').then(function(r) { return r.json(); }).then(function(s) {
      var nombre = s && s.perfil && s.perfil.data ? s.perfil.data.nombre : '';

      if (nombre) {
        bot('¡Hola ' + nombre + '! 😊 Soy Clauch, tu compañero aquí en Pulse.');
      } else {
        bot('¡Hola! 😊 Soy Clauch, tu compañero en Pulse.');
      }

      bot('Voy a hacerte unas preguntas cortitas para conocerte y configurar tu app. Solo responde normal, como si estuvieras hablando con alguien.', 600);

      // Get first question from backend
      setTimeout(function() {
        typing();
        chat('__start__', function(data) {
          untyping();
          if (data && data.messages && data.messages.length > 0) {
            currentQuestion = data.nextQuestion;
            data.messages.forEach(function(m, i) {
              bot(m, i * 400);
            });
          } else {
            bot('Cuéntame, ¿cómo andas hoy?', 300);
          }
          focus();
        });
      }, 1400);
    }).catch(function() {
      bot('¡Hola! 😊 Cuéntame, ¿cómo andas?');
    });
  }

  /* ═══ SEND ═══ */
  window._cs = function() {
    var inp = document.getElementById('c-inp');
    if (!inp || !inp.value.trim()) return;

    var text = inp.value.trim();
    inp.value = '';
    user(text);
    typing();

    chat(text, function(data) {
      untyping();
      if (!data) {
        bot('Perdón, algo falló. ¿Puedes repetir?');
        return;
      }

      currentQuestion = data.nextQuestion || null;

      // Show messages with staggered timing
      if (data.messages && data.messages.length > 0) {
        data.messages.forEach(function(m, i) {
          bot(m, i * 450);
        });
      }

      // Show saved confirmations subtly
      if (data.saved && data.saved.length > 0) {
        var delay = (data.messages ? data.messages.length : 0) * 450;
        setTimeout(function() {
          var savedHTML = data.saved.map(function(s) {
            return '✓ ' + s.field;
          }).join('  ');
          messages.push({ t: 's', x: savedHTML });
          render();
        }, delay);
      }

      // If all done, show a subtle reload hint
      if (data.allDone && !data.nextQuestion) {
        var doneDelay = ((data.messages ? data.messages.length : 0) + 1) * 450 + 300;
        setTimeout(function() {
          messages.push({ t: 's', x: '<a href="javascript:location.reload()" style="color:#f4845f;text-decoration:underline;font-size:.7rem">Recargar para ver todo configurado →</a>' });
          render();
        }, doneDelay);
      }

      focus();
    });
  };

  /* ═══ INIT ═══ */
  function init() {
    createWidget();
    injectStyles();

    // Auto-open for new demo users
    if (isNew) {
      setTimeout(function() {
        toggleChat();
      }, 800);
    } else if (enabled === 'true') {
      // Badge for returning users with incomplete stuff
      setTimeout(function() {
        fetch('/api/clauch/status').then(function(r) { return r.json(); }).then(function(s) {
          if (s && s.progreso < 100) show('c-badge');
        }).catch(function() {});
      }, 3000);
    }
  }

  /* ═══ STYLES ═══ */
  function injectStyles() {
    var s = document.createElement('style');
    s.textContent = '\
#clauch-fab{position:fixed;bottom:1.5rem;right:1.5rem;width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,#f4845f,#f9c74f);display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:10000;box-shadow:0 4px 20px rgba(244,132,95,.35);transition:all .3s}\
#clauch-fab:hover{transform:scale(1.08);box-shadow:0 6px 28px rgba(244,132,95,.45)}\
#clauch-fab.hide{transform:scale(0);opacity:0;pointer-events:none}\
.cf-icon{font-size:1.3rem}\
.cf-badge{position:absolute;top:-3px;right:-3px;min-width:16px;height:16px;border-radius:8px;background:#ef4444;color:#fff;font-size:.55rem;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0 3px;animation:cpulse 2s infinite}\
@keyframes cpulse{0%,100%{transform:scale(1)}50%{transform:scale(1.15)}}\
\
#clauch-panel{position:fixed;bottom:1rem;right:1rem;width:370px;max-height:540px;border-radius:20px;background:#16162b;border:1px solid rgba(255,255,255,.05);z-index:10001;display:flex;flex-direction:column;opacity:0;transform:translateY(16px) scale(.96);pointer-events:none;transition:all .3s cubic-bezier(.4,0,.2,1);box-shadow:0 12px 48px rgba(0,0,0,.5);overflow:hidden}\
#clauch-panel.open{opacity:1;transform:translateY(0) scale(1);pointer-events:auto}\
\
.ch{display:flex;align-items:center;justify-content:space-between;padding:.6rem .85rem;border-bottom:1px solid rgba(255,255,255,.04);background:rgba(255,255,255,.02)}\
.ch-left{display:flex;align-items:center;gap:.5rem}\
.ch-dot-wrap{width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#f4845f,#f9c74f);display:flex;align-items:center;justify-content:center}\
.ch-dot{width:7px;height:7px;border-radius:50%;background:#fff}\
.ch-name{font-size:.8rem;font-weight:700;color:#fef9ef;font-family:"DM Sans",sans-serif}\
.ch-sub{font-size:.55rem;color:rgba(254,249,239,.3);font-family:"DM Sans",sans-serif}\
.ch-x{background:none;border:none;color:rgba(254,249,239,.25);font-size:1rem;cursor:pointer;padding:.2rem;transition:color .2s}\
.ch-x:hover{color:#fef9ef}\
\
.cm{flex:1;overflow-y:auto;padding:.7rem;max-height:380px;scroll-behavior:smooth;display:flex;flex-direction:column;gap:.25rem}\
.cm-b,.cm-u,.cm-s{padding:.5rem .7rem;border-radius:16px;font-size:.78rem;line-height:1.55;max-width:87%;animation:cin .25s ease;word-wrap:break-word;font-family:"DM Sans",system-ui,sans-serif}\
@keyframes cin{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}\
.cm-b{background:rgba(255,255,255,.055);color:rgba(254,249,239,.78);border-bottom-left-radius:5px;align-self:flex-start}\
.cm-u{background:linear-gradient(135deg,rgba(244,132,95,.18),rgba(249,199,79,.12));color:#fef9ef;border-bottom-right-radius:5px;align-self:flex-end}\
.cm-s{font-size:.6rem;color:rgba(244,132,95,.5);align-self:flex-start;padding:.2rem .5rem;background:rgba(244,132,95,.06);border-radius:4px}\
\
.c-dots{display:flex;gap:3px;padding:2px 0}\
.c-dots i{width:5px;height:5px;border-radius:50%;background:rgba(244,132,95,.5);animation:cdot 1.2s infinite}\
.c-dots i:nth-child(2){animation-delay:.2s}\
.c-dots i:nth-child(3){animation-delay:.4s}\
@keyframes cdot{0%,100%{opacity:.3;transform:scale(.8)}50%{opacity:1;transform:scale(1)}}\
\
.ci{display:flex;gap:.3rem;padding:.5rem .65rem;border-top:1px solid rgba(255,255,255,.03);background:rgba(255,255,255,.01)}\
#c-inp{flex:1;padding:.45rem .65rem;border-radius:12px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.035);color:#fef9ef;font-size:.78rem;font-family:"DM Sans",system-ui,sans-serif;transition:border-color .2s}\
#c-inp::placeholder{color:rgba(254,249,239,.2)}\
#c-inp:focus{outline:none;border-color:rgba(244,132,95,.3);background:rgba(255,255,255,.05)}\
#c-btn{width:34px;height:34px;border-radius:50%;border:none;background:linear-gradient(135deg,#f4845f,#f9c74f);color:#1a1a2e;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform .15s;flex-shrink:0}\
#c-btn:hover{transform:scale(1.06)}\
#c-btn:active{transform:scale(.94)}\
\
@media(max-width:500px){\
#clauch-panel{right:0;left:0;bottom:0;width:100%;max-height:85vh;border-radius:20px 20px 0 0}\
#clauch-fab{bottom:1rem;right:1rem;width:46px;height:46px}\
.cf-icon{font-size:1.1rem}\
}';
    document.head.appendChild(s);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
