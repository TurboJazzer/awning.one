/* Awning site behaviour: hero video controls, before/after slider, live scorecard. No tracking here. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  /* ---- Hero video: pause/play and sound ---- */
  var video = $('hero-video'), playBtn = $('play-btn'), soundBtn = $('sound-btn');
  if (video && playBtn && soundBtn) {
    // Try to start with sound. Browsers only allow that when the visitor has already shown they want it
    // (earlier visits, a click, a home-screen install). If it is refused, start muted, then switch the sound on
    // with the first tap or key press anywhere on the page.
    var soundOn = function (on) {
      soundBtn.setAttribute('aria-pressed', String(on));
      $('sound-label').textContent = on ? 'Turn sound off' : 'Turn sound on';
    };
    var userChoseSound = false;
    var start = function () {
      if (playBtn.getAttribute('aria-pressed') === 'true') return;
      video.muted = false; video.volume = 0.7;
      var p = video.play();
      if (p && p.then) {
        p.then(function () { soundOn(!video.muted); }).catch(function () {
          video.muted = true; soundOn(false);
          var q = video.play(); if (q && q.catch) q.catch(function () {});
        });
      }
    };
    var reduced = false; // video always plays; the Pause button is the visitor's control
    video.addEventListener('loadeddata', function () { if (video.paused && playBtn.getAttribute('aria-pressed') !== 'true') start(); });
    if (!reduced) start();
    var firstGesture = function (e) {
      if (userChoseSound || !video.muted || playBtn.getAttribute('aria-pressed') === 'true') return;
      if (e.target && e.target.closest && e.target.closest('#play-btn, #sound-btn')) return;
      video.muted = false; video.volume = 0.7; soundOn(true);
      var p = video.play(); if (p && p.catch) p.catch(function () {});
    };
    ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) { document.addEventListener(ev, firstGesture, { once: false, passive: true }); });
    playBtn.addEventListener('click', function () {
      var paused = playBtn.getAttribute('aria-pressed') !== 'true';
      if (paused) video.pause(); else { var p = video.play(); if (p && p.catch) p.catch(function () {}); }
      playBtn.setAttribute('aria-pressed', String(paused));
      $('play-label').textContent = paused ? 'Play video' : 'Pause video';
    });
    soundBtn.addEventListener('click', function () {
      userChoseSound = true;
      var on = soundBtn.getAttribute('aria-pressed') !== 'true';
      video.muted = !on;
      if (on) { video.volume = 0.7; var p = video.play(); if (p && p.catch) p.catch(function () {}); }
      soundBtn.setAttribute('aria-pressed', String(on));
      $('sound-label').textContent = on ? 'Turn sound off' : 'Turn sound on';
    });
  }

  /* ---- Before / after slider ---- */
  var range = $('ba-range');
  if (range) {
    var set = function () {
      var v = Number(range.value);
      $('ba-before').style.clipPath = 'inset(0 ' + (100 - v) + '% 0 0)';
      $('ba-line').style.left = v + '%';
      $('ba-knob').style.left = v + '%';
    };
    range.addEventListener('input', set); set();
  }

  /* ---- Scorecard ---- */
  var form = $('score-form'), repForm = $('report-form');
  if (!form) return;
  var C = window.AwningCompose, lastUrl = '';
  var COLOUR = { Good: '#8FD0A0', Fair: '#E9A23B', 'Needs work': '#FF8A73', 'Could not check': '#B9C0D0' };
  var LABEL = { speed: 'Speed', mobile: 'Mobile', search: 'Search', ai: 'AI search' };
  function show(which) { ['score-empty', 'score-loading', 'score-result'].forEach(function (id) { $(id).hidden = id !== which; }); }
  function err(msg) { var e = $('score-error'); e.textContent = msg || ''; e.hidden = !msg; }
  function post(path, data) {
    var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, 40000);
    return fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: ctl.signal })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j.__status = r.status; return j; }); })
      .finally(function () { clearTimeout(t); });
  }
  function fields(f) { var d = {}; new FormData(f).forEach(function (v, k) { d[k] = v; }); return d; }

  $('score-btn').addEventListener('click', function () {      // block-bots.js flags a blocked submit
    setTimeout(function () {
      if (form.hasAttribute('data-blocked')) { form.removeAttribute('data-blocked'); err('Please give it a moment, then press Score my site again.'); }
    }, 0);
  });
  form.addEventListener('submit', function (e) {
    e.preventDefault(); err('');
    var url = ($('url').value || '').trim();
    if (!url || url.indexOf('.') < 0) { err('Enter your website address, for example yoursite.com.'); return; }
    var btn = $('score-btn'); btn.disabled = true; btn.textContent = 'Checking...'; show('score-loading');
    var base = fields(form);
    Promise.all([post('/api/score', base), post('/api/speed', base)]).then(function (res) {
      var page = res[0], speed = res[1];
      if (page.__status === 429) throw new Error('You have tried this address a few times today. Please try again tomorrow, or book a call and we will run it for you.');
      if (page.error && page.error !== null) {
        throw new Error(page.error === 'blocked' || page.error === 'unreachable' || page.error === 'status'
          ? 'We could not reach that address. Check the spelling and that the site is public.'
          : page.error === 'url' ? 'That does not look like a website address.' : 'Something went wrong. Please try again.');
      }
      var checks = (page.checks || []).concat(speed && speed.checks ? speed.checks : []);
      var r = C.compose(checks);
      lastUrl = page.url || url;
      render(r, page.url || url, !(speed && speed.checks && speed.checks.length && !speed.error));
      show('score-result');
      $('score-result').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }).catch(function (x) {
      show('score-empty'); err(x && x.message && x.name !== 'AbortError' ? x.message : 'That took too long. Please try again.');
    }).finally(function () { btn.disabled = false; btn.textContent = 'Score my site'; });
  });
  function render(r, url, speedMissing) {
    try { $('r-url').textContent = new URL(url).hostname; } catch (e) { $('r-url').textContent = url; }
    $('r-total').textContent = r.total === null ? 'n/a' : r.total;
    $('r-band').textContent = r.total === null ? 'Could not check' : 'out of 100 · ' + r.band;
    Object.keys(LABEL).forEach(function (k) {
      var c = r.cats[k], bar = $('r-' + k + '-b'), col = COLOUR[c.band];
      $('r-' + k + '-l').textContent = c.pct === null ? 'Could not check' : c.band; $('r-' + k + '-l').style.color = col;
      bar.style.width = (c.pct === null ? 0 : c.pct) + '%'; bar.style.background = col;
    });
    var top = $('r-top');
    if (r.topFix) { $('r-top-t').textContent = r.topFix.label + '. ' + r.topFix.fix; top.hidden = false; } else top.hidden = true;
    var note = $('r-note');
    note.textContent = speedMissing ? 'Google’s speed test did not respond, so Speed and part of Mobile were not scored. The other checks were scaled to match. The full report will retry it.' : '';
    note.hidden = !speedMissing;
    $('rep-msg').hidden = true;
  }

  if (repForm) {
    $('rep-btn').addEventListener('click', function () {
      setTimeout(function () { if (repForm.hasAttribute('data-blocked')) { repForm.removeAttribute('data-blocked'); msg('Please give it a moment, then try again.', true); } }, 0);
    });
    repForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = $('rep-name').value.trim(), email = $('rep-email').value.trim();
      if (!name) { msg('Please enter your name.', true); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { msg('Please enter a valid email address.', true); return; }
      if (!$('rep-consent').checked) { msg('Please tick the box so we may email you the report.', true); return; }
      var d = fields(repForm); d.url = lastUrl || $('url').value; d.consent = true;
      var b = $('rep-btn'); b.disabled = true;
      post('/.netlify/functions/report-background', d).then(function (j) {
        if (j.__status === 202 || j.__status === 200) { msg('Done. Your full report is on its way to ' + email + '. It can take a couple of minutes. Check your junk folder if you do not see it.', false); repForm.reset(); }
        else if (j.__status === 429) msg('You have asked for this report a few times already. Please check your inbox or try again tomorrow.', true);
        else msg('Something went wrong. Please try again, or email hello@awning.one.', true);
      }).catch(function () { msg('Something went wrong. Please try again, or email hello@awning.one.', true); }).finally(function () { b.disabled = false; });
    });
  }
  function msg(t, bad) { var m = $('rep-msg'); m.textContent = t; m.style.color = bad ? '#FF8A73' : '#8FD0A0'; m.hidden = false; }
})();
