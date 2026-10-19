'use strict';
/* POST /api/report  (Netlify background function: replies 202 at once, then works for up to 15 minutes)
   Body: { url, name, email, consent, company_website, _loaded_at }
   Runs every check, emails the visitor the full report through Resend, tells hello@awning.one about the lead,
   and (if HUBSPOT_TOKEN is set) adds the contact to HubSpot. Environment variables: see README-DEPLOY.md */
const { botCheck, normaliseUrl, limited, ipOf } = require('./_lib');
const { pageChecks, speedChecks } = require('./_audit');
const { compose } = require('../../assets/compose.js');

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CATNAME = { speed: 'Speed', mobile: 'Mobile', search: 'Search', ai: 'AI search' };
const FROM = process.env.REPORT_FROM || 'Awning <hello@awning.one>';
const NOTIFY = process.env.NOTIFY_TO || 'hello@awning.one';
const BOOK = 'https://calendly.com/wayne-wayneconrad/awning-15-minute-intro-call';

async function resend(payload) {
  const res = await fetch('https://api.resend.com/emails', { method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error('resend ' + res.status + ' ' + (await res.text()).slice(0, 200));
}

function reportHtml(name, site, r, checks, when) {
  const colour = b => b === 'Good' ? '#2E7D4F' : b === 'Fair' ? '#B7791F' : '#B3321B';
  const rows = checks.map(c => {
    const state = c.earned === null ? 'Could not check' : c.earned >= c.max ? 'Full marks' : c.earned > 0 ? 'Partly' : 'Missing';
    const pts = c.earned === null ? 'not scored' : `${c.earned} of ${c.max}`;
    return `<tr><td style="padding:10px 8px;border-top:1px solid #E5DCC8"><strong>${esc(c.label)}</strong><br><span style="color:#4A4F5C">${esc(c.found)}</span>${c.earned !== null && c.earned < c.max && c.fix ? `<br><span style="color:#101A2E"><em>Fix:</em> ${esc(c.fix)}</span>` : ''}</td><td style="padding:10px 8px;border-top:1px solid #E5DCC8;white-space:nowrap;vertical-align:top">${state}<br><span style="color:#4A4F5C">${pts}</span></td></tr>`;
  }).join('');
  const bars = Object.keys(CATNAME).map(k => { const c = r.cats[k]; return `<tr><td style="padding:4px 0">${CATNAME[k]}</td><td style="padding:4px 0;text-align:right;color:${colour(c.band)}"><strong>${c.pct === null ? 'Could not check' : c.pct + '% · ' + c.band}</strong></td></tr>`; }).join('');
  const prio = checks.filter(c => c.earned !== null && c.earned < c.max).sort((a, b) => (b.max - b.earned) - (a.max - a.earned));
  const list = prio.length ? prio.map((c, i) => `<li style="margin:0 0 8px"><strong>${esc(c.label)}</strong> (${r1(c.max - c.earned)} points to win). ${esc(c.fix)}</li>`).join('') : '<li>Nothing to fix. Well done.</li>';
  return `<!doctype html><html><body style="margin:0;background:#F4EDE0;font-family:Arial,Helvetica,sans-serif;color:#101A2E"><div style="max-width:640px;margin:0 auto;padding:24px">
<div style="font-size:26px;font-weight:700;margin:0 0 4px">awning</div><div style="color:#4A4F5C;margin:0 0 20px">Website scorecard report for ${esc(site)}</div>
<p>Hi ${esc(name)}, here is the full report you asked for.</p>
<div style="background:#101A2E;color:#F4EDE0;border-radius:14px;padding:20px;margin:0 0 20px"><div style="font-size:44px;font-weight:700">${r.total === null ? 'n/a' : r.total}<span style="font-size:16px;font-weight:400"> out of 100 · ${esc(r.band)}</span></div>
<table style="width:100%;border-collapse:collapse;color:#F4EDE0;margin-top:10px">${bars}</table></div>
<h2 style="font-size:20px;margin:24px 0 8px">Fix these first, in priority order</h2><ol style="padding-left:20px;margin:0 0 20px">${list}</ol>
<h2 style="font-size:20px;margin:24px 0 8px">Every check</h2><table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>
<h2 style="font-size:20px;margin:28px 0 8px">Want these fixed?</h2><p>Book a free 15-minute call and we will go through this report together. No obligation.</p>
<p><a href="${BOOK}" style="display:inline-block;background:#C2331B;color:#fff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:999px">Book a free 15-minute call</a></p>
<p style="color:#4A4F5C;font-size:12px;margin-top:28px">Run on ${esc(when)}. Only the home page is scored. Scores come from Awning's own method, not Google's, and change as websites change. They are not a guarantee of ranking, traffic or sales. You asked for this report at awning.one. To stop hearing from us, reply "unsubscribe". Awning, a division of Poseidon Network Systems CC. Privacy: privacy@awning.one.</p></div></body></html>`;
}
const r1 = n => Math.round(n * 10) / 10;

exports.handler = async (event) => {
  let b; try { b = JSON.parse(event.body || '{}'); } catch (e) { return { statusCode: 400 }; }
  if (botCheck(b, (event.headers || {})['user-agent'])) return { statusCode: 400 };
  const u = normaliseUrl(b.url);
  const email = String(b.email || '').trim(), name = String(b.name || '').trim().slice(0, 80);
  if (!u || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 200 || !name || b.consent !== true) return { statusCode: 400 };
  if (limited(ipOf(event), 'report|' + email.toLowerCase())) return { statusCode: 429 };
  try {
    const [p, s] = await Promise.all([pageChecks(u), speedChecks(u)]);
    if (p.error) {
      await resend({ from: FROM, to: [email], reply_to: NOTIFY, subject: 'Your Awning scorecard: we could not reach your site',
        html: `<p>Hi ${esc(name)},</p><p>We could not reach ${esc(u.hostname)} to run your scorecard. Check that the address is right and that the site is public, then try again at https://awning.one. If it keeps failing, reply to this email and we will run it for you.</p>` });
    } else {
      const checks = [...p.checks, ...s.checks];
      const r = compose(checks);
      const when = new Date().toISOString().slice(0, 10);
      await resend({ from: FROM, to: [email], reply_to: NOTIFY, subject: `Your website scorecard: ${r.total === null ? 'result' : r.total + ' out of 100'}`, html: reportHtml(name, u.hostname, r, checks, when) });
    }
    await resend({ from: FROM, to: [NOTIFY], reply_to: email, subject: 'New scorecard lead: ' + u.hostname,
      html: `<p>${esc(name)} (${esc(email)}) asked for the full report on ${esc(u.href)}. Consent to email: yes.</p>` });
    if (process.env.HUBSPOT_TOKEN) {
      await fetch('https://api.hubapi.com/crm/v3/objects/contacts', { method: 'POST',
        headers: { Authorization: 'Bearer ' + process.env.HUBSPOT_TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ properties: { email, firstname: name, website: u.href } }) }).catch(() => {});
    }
  } catch (e) { console.log('report failed:', e.message); }
  return { statusCode: 202 };
};
