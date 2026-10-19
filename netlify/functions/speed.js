'use strict';
/* POST /api/speed  { url, company_website, _loaded_at }  ->  Google PageSpeed checks (speed and phone-friendliness) */
const { json, limited, botCheck, normaliseUrl, ipOf } = require('./_lib');
const { speedChecks } = require('./_audit');
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method' });
  let b; try { b = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'bad' }); }
  if (botCheck(b, (event.headers || {})['user-agent'])) return json(400, { error: 'bad' });
  const u = normaliseUrl(b.url);
  if (!u) return json(400, { error: 'url' });
  const lim = limited(ipOf(event), 'speed|' + u.hostname);
  if (lim) return json(429, { error: lim });
  try { return json(200, await speedChecks(u)); } catch (e) { return json(502, { error: 'speed' }); }
};
