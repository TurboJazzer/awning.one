'use strict';
const dns = require('dns').promises;
const net = require('net');

const HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const json = (status, body) => ({ statusCode: status, headers: HEADERS, body: JSON.stringify(body) });

/* ---- Abuse limits (best effort: in-memory per warm function instance) ---- */
const hits = new Map();
let dayKey = '', dayCount = 0;
function limited(ip, url) {
  const day = new Date().toISOString().slice(0, 10);
  if (day !== dayKey) { dayKey = day; dayCount = 0; hits.clear(); }
  const cap = Number(process.env.DAILY_CAP || 500);
  if (++dayCount > cap) return 'cap';
  const k = ip + '|' + url;
  const n = (hits.get(k) || 0) + 1;
  hits.set(k, n);
  if (n > 3) return 'repeat';              // a few retries per address per visitor per day
  return null;
}

/* ---- Bot checks that must be repeated on the server ---- */
function botCheck(b, ua) {
  if (!b || typeof b !== 'object') return 'shape';
  if (b.company_website) return 'honeypot';                       // hidden field must stay empty
  const t = Number(b._loaded_at);
  const age = Date.now() - t;
  if (!t || age < 3000 || age > 86400000) return 'timing';        // under 3 seconds is not a person
  if (/HeadlessChrome|PhantomJS|python-requests|curl\/|Go-http-client/i.test(ua || '')) return 'ua';
  return null;
}

/* ---- Safe fetch: stops the scorecard being used to reach private networks ---- */
function isPrivate(ip) {
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l === '::1' || l === '::' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe8') || l.startsWith('fe9') || l.startsWith('fea') || l.startsWith('feb')) return true;
    const m = l.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return m ? isPrivate(m[1]) : false;
  }
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some(isNaN)) return true;
  const [a, b] = p;
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}
function normaliseUrl(input) {
  let s = String(input || '').trim();
  if (!s || s.length > 300) return null;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  let u;
  try { u = new URL(s); } catch (e) { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  if (u.username || u.password) return null;
  if (u.port && !['80', '443'].includes(u.port)) return null;
  const h = u.hostname;
  if (!h.includes('.') || /\.(local|internal|localhost|lan|home|corp)$/i.test(h)) return null;
  u.hash = '';
  return u;
}
async function assertPublic(u) {
  if (net.isIP(u.hostname)) { if (isPrivate(u.hostname)) throw new Error('private'); return; }
  const addrs = await dns.lookup(u.hostname, { all: true });
  if (!addrs.length || addrs.some(a => isPrivate(a.address))) throw new Error('private');
}
async function readCapped(res, cap) {
  const reader = res.body && res.body.getReader ? res.body.getReader() : null;
  if (!reader) return (await res.text()).slice(0, cap);
  const dec = new TextDecoder('utf-8', { fatal: false });
  let out = '', size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length; out += dec.decode(value, { stream: true });
    if (size >= cap) { try { await reader.cancel(); } catch (e) {} break; }
  }
  return out;
}
async function safeFetch(startUrl, opts = {}) {
  const timeout = opts.timeout || 8000, cap = opts.cap || 1500000, method = opts.method || 'GET';
  let u = startUrl instanceof URL ? startUrl : new URL(startUrl);
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(u);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeout);
    try {
      const res = await fetch(u.href, { method, redirect: 'manual', signal: ctl.signal,
        headers: { 'User-Agent': 'AwningScorecard/1.0 (+https://awning.one)', 'Accept': 'text/html,application/xhtml+xml,text/plain,*/*;q=0.5' } });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        u = new URL(res.headers.get('location'), u);
        if (!/^https?:$/.test(u.protocol)) throw new Error('redirect');
        continue;
      }
      const body = method === 'HEAD' ? '' : await readCapped(res, cap);
      return { status: res.status, url: u, headers: res.headers, body };
    } finally { clearTimeout(timer); }
  }
  throw new Error('redirects');
}

function ipOf(event) {
  const h = event.headers || {};
  return h['x-nf-client-connection-ip'] || (h['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
}
module.exports = { json, limited, botCheck, normaliseUrl, safeFetch, ipOf };
