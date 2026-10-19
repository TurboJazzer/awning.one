/*
 * block-bots.js  (Awning, awning.one)
 *
 * Client-side first line of defence for forms and the scorecard.
 * It does NOT hide the site from search or AI crawlers (they should read it).
 * It only stops automated browsers from submitting forms, and adds two
 * signals (a honeypot and a time check) that the Netlify function must
 * verify again on the server. Client code alone is never enough.
 *
 * Use: add data-protect to any <form>, and include this script on the page:
 *   <script src="/block-bots.js" defer></script>
 * Read the signals before posting:
 *   const sig = window.AwningBots.signals();   // send in the request body
 */
(function () {
  'use strict';

  var MIN_FILL_MS = 3000;      // a person takes longer than 3 seconds to fill a form
  var HONEYPOT_NAME = 'company_website'; // real visitors never see or fill this
  var loadedAt = Date.now();

  // 1. Automation signals. Two or more marks the visitor as a bot.
  function automationSignals() {
    var n = window.navigator || {};
    var ua = String(n.userAgent || '');
    var hits = [];
    if (n.webdriver === true) hits.push('webdriver');
    if (/HeadlessChrome|PhantomJS|Puppeteer|Playwright|Selenium|Nightmare/i.test(ua)) hits.push('headless-ua');
    if (!n.languages || n.languages.length === 0) hits.push('no-languages');
    if (/Chrome\//.test(ua) && !/Mobile|Android/i.test(ua) && n.plugins && n.plugins.length === 0) hits.push('no-plugins');
    if (window.callPhantom || window._phantom || window.__nightmare) hits.push('phantom');
    if (document.__selenium_unwrapped || document.__webdriver_evaluate || document.__driver_evaluate) hits.push('selenium');
    if (window.screen && window.screen.width === 0 && window.screen.height === 0) hits.push('zero-screen');
    return hits;
  }

  var hits = automationSignals();
  var isBot = hits.length >= 2;

  // 2. Add the honeypot and the load-time field to every protected form.
  function protect(form) {
    if (form.__awningProtected) return;
    form.__awningProtected = true;

    var trap = document.createElement('input');
    trap.type = 'text';
    trap.name = HONEYPOT_NAME;
    trap.tabIndex = -1;
    trap.autocomplete = 'off';
    trap.setAttribute('aria-hidden', 'true');
    trap.style.cssText = 'position:absolute;left:-10000px;top:auto;width:1px;height:1px;overflow:hidden;opacity:0';
    form.appendChild(trap);

    var stamp = document.createElement('input');
    stamp.type = 'hidden';
    stamp.name = '_loaded_at';
    stamp.value = String(loadedAt);
    form.appendChild(stamp);

    form.addEventListener('submit', function (e) {
      var elapsed = Date.now() - loadedAt;
      if (isBot || trap.value !== '' || elapsed < MIN_FILL_MS) {
        e.preventDefault();
        e.stopImmediatePropagation();
        // Look normal to the sender; the server also rejects these requests.
        form.setAttribute('data-blocked', '1');
      }
    }, true);

    if (isBot) {
      var controls = form.querySelectorAll('button, input[type="submit"]');
      for (var i = 0; i < controls.length; i++) controls[i].disabled = true;
    }
  }

  function init() {
    var forms = document.querySelectorAll('form[data-protect]');
    for (var i = 0; i < forms.length; i++) protect(forms[i]);
    if (isBot) document.documentElement.setAttribute('data-bot', '1');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 3. Signals the page sends to the server with each request.
  window.AwningBots = {
    isBot: function () { return isBot; },
    signals: function () {
      return {
        bot: isBot,
        hits: hits,
        loaded_at: loadedAt,
        elapsed_ms: Date.now() - loadedAt
      };
    }
  };
})();
