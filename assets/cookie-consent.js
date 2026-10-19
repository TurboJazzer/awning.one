/*
 * cookie-consent.js  (Awning, awning.one)
 *
 * Shows a cookie banner, remembers the choice in one first-party cookie, and
 * loads Google Tag Manager (and so GA4) ONLY after the visitor accepts.
 * Nothing optional runs before consent. "Reject" keeps the site fully usable.
 *
 * Setup: set GTM_ID below, include the script on every page:
 *   <script src="/cookie-consent.js" defer></script>
 * Footer link to change the choice:
 *   <a href="#" data-cookie-settings>Cookie settings</a>
 */
(function () {
  'use strict';

  var GTM_ID = 'GTM-5RRDJV9J';       
  var COOKIE = 'awning_consent';       // values: accepted | rejected
  var DAYS = 180;

  function read() {
    var m = document.cookie.match(new RegExp('(?:^|; )' + COOKIE + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }
  function write(v) {
    var d = new Date(); d.setTime(d.getTime() + DAYS * 864e5);
    document.cookie = COOKIE + '=' + encodeURIComponent(v) + '; expires=' + d.toUTCString() +
      '; path=/; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : '');
  }

  var CLARITY_ID = 'z03vj963iv';       // Microsoft Clarity project ID
  var clarityLoaded = false;
  function loadClarity() {
    if (clarityLoaded || !CLARITY_ID) return;
    clarityLoaded = true;
    (function (c, l, a, r, i, t, y) {
      c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
      t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i;
      y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
    })(window, document, 'clarity', 'script', CLARITY_ID);
  }

  var loaded = false;
  function loadAnalytics() {
    loadClarity();
    if (loaded || !GTM_ID || GTM_ID.indexOf('XXXX') !== -1) return;
    loaded = true;
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(GTM_ID);
    document.head.appendChild(s);
  }

  function clearAnalyticsCookies() {
    var host = location.hostname.replace(/^www\./, '');
    document.cookie.split('; ').forEach(function (c) {
      var name = c.split('=')[0];
      if (/^(_ga|_gid|_gat|_gcl|_clck|_clsk|CLID|ANONCID|MUID|SM)$|^(_ga|_gid|_gat|_gcl)/.test(name)) {
        document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
        document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=.' + host;
      }
    });
  }

  function choose(v) {
    write(v);
    if (v === 'accepted') loadAnalytics(); else clearAnalyticsCookies();
    var b = document.getElementById('awning-cookie-banner');
    if (b) b.remove();
  }

  function showBanner() {
    if (document.getElementById('awning-cookie-banner')) return;
    var b = document.createElement('div');
    b.id = 'awning-cookie-banner';
    b.setAttribute('role', 'dialog');
    b.setAttribute('aria-label', 'Cookie choices');
    var sm = window.innerWidth < 600;
    b.style.cssText = 'position:fixed;left:' + (sm ? 8 : 16) + 'px;right:' + (sm ? 8 : 16) + 'px;bottom:' + (sm ? 8 : 16) + 'px;z-index:9999;max-width:640px;margin:0 auto;' +
      'background:#101A2E;color:#F4EDE0;border:1px solid #33405C;border-radius:16px;padding:' + (sm ? '10px 14px' : '20px 22px') + ';' +
      'box-shadow:0 20px 50px -20px rgba(0,0,0,.6);font:' + (sm ? 14 : 16) + 'px/1.4 "Hanken Grotesk",system-ui,sans-serif';
    b.innerHTML =
      '<p style="margin:0 0 ' + (sm ? 8 : 14) + 'px">We use analytics cookies to see how the site is used, only if you agree. ' +
      'The site works fully either way. <a href="/privacy.html" style="color:#E9A23B">Privacy notice</a></p>' +
      '<div style="display:flex;flex-wrap:wrap;gap:10px">' +
      '<button type="button" data-c="accepted" style="font:inherit;font-weight:600;padding:' + (sm ? 9 : 11) + 'px 18px;border-radius:999px;border:0;background:#E9A23B;color:#101A2E;cursor:pointer">Accept analytics</button>' +
      '<button type="button" data-c="rejected" style="font:inherit;font-weight:600;padding:' + (sm ? 7 : 9) + 'px 18px;border-radius:999px;border:2px solid #F4EDE0;background:transparent;color:#F4EDE0;cursor:pointer">Reject</button>' +
      '</div>';
    b.addEventListener('click', function (e) {
      var v = e.target && e.target.getAttribute && e.target.getAttribute('data-c');
      if (v) choose(v);
    });
    document.body.appendChild(b);
  }

  function init() {
    var v = read();
    if (v === 'accepted') loadAnalytics();
    else if (v !== 'rejected') showBanner();
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('[data-cookie-settings]') : null;
      if (t) { e.preventDefault(); showBanner(); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
