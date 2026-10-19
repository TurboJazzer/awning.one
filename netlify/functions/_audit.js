'use strict';
/* Awning scorecard checks. Point values follow the approved scoring rules (19 Oct 2026).
   earned === null means "could not check" (never scored as zero). Home page only in version one. */
const { safeFetch } = require('./_lib');

const attr = (tag, name) => { const m = tag.match(new RegExp('\\b' + name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i')); return m ? (m[2] ?? m[3] ?? m[4] ?? '') : null; };
const tags = (html, name) => html.match(new RegExp('<' + name + '\\b[^>]*>', 'gi')) || [];
const meta = (html, key) => { for (const t of tags(html, 'meta')) { const k = attr(t, 'name') || attr(t, 'property'); if (k && k.toLowerCase() === key) return attr(t, 'content') || ''; } return null; };
const strip = h => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const r1 = n => Math.round(n * 10) / 10;
const C = (id, cat, label, max, earned, found, fix) => ({ id, cat, label, max, earned: earned === null ? null : r1(Math.max(0, Math.min(max, earned))), found, fix });

function robotsGroups(txt) {
  const groups = []; let cur = null, lastWasUA = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim(); if (!line) continue;
    const i = line.indexOf(':'); if (i < 0) continue;
    const k = line.slice(0, i).trim().toLowerCase(), v = line.slice(i + 1).trim();
    if (k === 'user-agent') { if (!cur || !lastWasUA) { cur = { agents: [], disallow: [] }; groups.push(cur); } cur.agents.push(v.toLowerCase()); lastWasUA = true; }
    else { lastWasUA = false; if (cur && k === 'disallow') cur.disallow.push(v); }
  }
  return groups;
}
const blocks = (groups, agent) => groups.some(g => g.agents.includes(agent.toLowerCase()) && g.disallow.includes('/'));

async function pageChecks(u) {
  const out = [];
  let home;
  try { home = await safeFetch(u, { timeout: 9000 }); } catch (e) { return { error: e.message === 'private' ? 'blocked' : 'unreachable', checks: [] }; }
  if (home.status >= 400) return { error: 'status', status: home.status, checks: [] };
  const html = home.body, final = home.url, origin = final.origin;
  const text = strip(html);

  // ---- Mobile: viewport tag (6)
  const vp = tags(html, 'meta').map(t => ({ n: (attr(t, 'name') || '').toLowerCase(), c: attr(t, 'content') || '' })).find(m => m.n === 'viewport');
  out.push(C('viewport', 'mobile', 'Viewport tag', 6, vp && /width\s*=\s*device-width/i.test(vp.c) ? 6 : vp ? 3 : 0,
    vp ? 'Viewport tag found.' : 'No viewport tag.', 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> so phones show the page at the right size.'));

  // ---- Search (25)
  const titles = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/gi) || [];
  const tTxt = titles.length ? strip(titles[0]) : '';
  out.push(C('title', 'search', 'Page title', 3, titles.length === 1 && tTxt.length >= 30 && tTxt.length <= 60 ? 3 : titles.length >= 1 && tTxt ? 1.5 : 0,
    tTxt ? `Title is ${tTxt.length} characters.` : 'No page title.', 'Give the page one clear title of 30 to 60 characters that says what the business does and where.'));
  const desc = meta(html, 'description');
  out.push(C('desc', 'search', 'Meta description', 3, desc && desc.length >= 70 && desc.length <= 160 ? 3 : desc ? 1.5 : 0,
    desc ? `Description is ${desc.length} characters.` : 'No meta description.', 'Add a meta description of 70 to 160 characters that sells the click.'));
  const heads = (html.match(/<h[1-6]\b/gi) || []).map(h => Number(h[2]));
  const h1n = heads.filter(h => h === 1).length;
  let ordered = heads.length > 0; for (let i = 1; i < heads.length; i++) if (heads[i] - heads[i - 1] > 1) ordered = false;
  out.push(C('headings', 'search', 'Headings', 3, (h1n === 1 ? 2 : h1n > 1 ? 1 : 0) + (ordered ? 1 : 0),
    `${h1n} H1 heading${h1n === 1 ? '' : 's'}; heading order ${ordered ? 'is sensible' : 'skips levels or is missing'}.`, 'Use exactly one H1 and keep headings in order (H1, then H2, then H3).'));

  const [sm, rb] = await Promise.all([
    safeFetch(new URL('/sitemap.xml', origin), { timeout: 6000, cap: 400000 }).catch(() => null),
    safeFetch(new URL('/robots.txt', origin), { timeout: 6000, cap: 100000 }).catch(() => null)]);
  const smOk = sm && sm.status === 200 && /<urlset|<sitemapindex/i.test(sm.body);
  out.push(C('sitemap', 'search', 'Sitemap', 3, sm ? (smOk ? 3 : 0) : null, sm ? (smOk ? 'sitemap.xml found.' : 'No valid sitemap.xml.') : 'Could not reach sitemap.xml.', 'Publish a sitemap.xml listing your pages and point to it from robots.txt.'));
  const rbOk = rb && rb.status === 200 && !/text\/html/i.test(rb.headers.get('content-type') || '');
  const groups = rbOk ? robotsGroups(rb.body) : [];
  const wholeBlock = blocks(groups, '*');
  out.push(C('robots', 'search', 'robots.txt', 2, rb ? (rbOk && !wholeBlock ? 2 : 0) : null, rb ? (!rbOk ? 'No robots.txt.' : wholeBlock ? 'robots.txt blocks the whole site.' : 'robots.txt found.') : 'Could not reach robots.txt.', 'Add a robots.txt that allows search engines and lists your sitemap. Never leave "Disallow: /" on a live site.'));
  const og = ['og:title', 'og:description', 'og:image'].filter(k => meta(html, k));
  out.push(C('og', 'search', 'Social preview tags', 2, og.length / 3 * 2, `${og.length} of 3 social preview tags found.`, 'Add Open Graph title, description and image so links look right when shared.'));
  const mixed = /\b(?:src|href)\s*=\s*["']http:\/\/(?!schema\.org|www\.w3\.org)/i.test(html.replace(/<a\b[^>]*>/gi, ''));
  const https = final.protocol === 'https:';
  out.push(C('https', 'search', 'Secure connection', 2, (https ? 1 : 0) + (https && !mixed ? 1 : 0), https ? (mixed ? 'HTTPS, but some files load over HTTP.' : 'HTTPS with no mixed content found.') : 'The site is not on HTTPS.', 'Serve the whole site over HTTPS and load every file over HTTPS.'));

  const hrefs = [...new Set(tags(html, 'a').map(t => attr(t, 'href')).filter(Boolean).map(h => h.trim()).filter(h => !/^(#|mailto:|tel:|javascript:|sms:)/i.test(h)))];
  const internal = []; for (const h of hrefs) { try { const x = new URL(h, final); if (x.origin === origin && x.pathname !== final.pathname) { x.hash = ''; internal.push(x.href); } } catch (e) {} }
  const sample = [...new Set(internal)].slice(0, 8);
  if (!sample.length) out.push(C('links', 'search', 'Working links', 3, 3, 'No other internal pages linked to check.', ''));
  else {
    const res = await Promise.all(sample.map(l => safeFetch(l, { timeout: 4000, cap: 20000 }).then(r => r.status < 400, () => false)));
    const ok = res.filter(Boolean).length;
    out.push(C('links', 'search', 'Working links', 3, ok / sample.length * 3, `${ok} of ${sample.length} internal links checked worked.`, 'Fix or remove the broken internal links.'));
  }
  const imgs = tags(html, 'img');
  const withAlt = imgs.filter(t => attr(t, 'alt') !== null && (attr(t, 'alt') !== '' || /role\s*=\s*["']presentation|aria-hidden/i.test(t) || true)).length;
  const altOk = imgs.filter(t => (attr(t, 'alt') || '').trim().length > 0).length;
  out.push(C('alt', 'search', 'Image descriptions', 2, imgs.length ? altOk / imgs.length * 2 : 2, imgs.length ? `${altOk} of ${imgs.length} images have alt text.` : 'No images found.', 'Describe each meaningful image in its alt text.'));
  const locRe = /\b(address|service area|serving|based in|located in|we serve|our office|suite|street|road|avenue|\d{4,5}\s*(?:,|\b))/i;
  const hasLoc = locRe.test(text), gbp = /g\.page|google\.[a-z.]+\/maps|maps\.app\.goo\.gl|business\.google\.com|goo\.gl\/maps/i.test(html);
  out.push(C('local', 'search', 'Local business signals', 2, (hasLoc ? 1 : 0) + (gbp ? 1 : 0), `${hasLoc ? 'A location or service area is mentioned' : 'No address or service area found'}; ${gbp ? 'Google Business link found' : 'no Google Business link'}.`, 'Show your address or service area and link to your Google Business Profile.'));

  // ---- AI search (25)
  const ld = []; let ldBad = 0;
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { const j = JSON.parse(m[1].trim()); (function walk(n) { if (Array.isArray(n)) n.forEach(walk); else if (n && typeof n === 'object') { if (n['@type']) ld.push(n); if (n['@graph']) walk(n['@graph']); } })(j); } catch (e) { ldBad++; }
  }
  const typeStr = n => [].concat(n['@type']).join(' ');
  const biz = ld.find(n => /Organization|Business|Store|Restaurant|Service|Practice|Studio|Agency/i.test(typeStr(n)) && n.name);
  out.push(C('schema', 'ai', 'Structured data', 6, biz ? (ldBad ? 4 : 6) : ld.length ? 3 : 0, biz ? 'Business structured data found.' : ld.length ? 'Structured data found, but no business details.' : 'No structured data.', 'Add Organization or LocalBusiness structured data (JSON-LD) with your name, URL, contact details and area.'));
  const qh = (html.match(/<h[2-4]\b[^>]*>[\s\S]*?<\/h[2-4]>/gi) || []).map(strip).filter(h => /\?\s*$/.test(h)).length;
  out.push(C('answers', 'ai', 'Answer-style content', 5, qh >= 3 ? 5 : qh >= 1 ? 2.5 : 0, `${qh} question heading${qh === 1 ? '' : 's'} found.`, 'Add a short section of real customer questions as headings, each followed by a short direct answer.'));
  const AI = ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'CCBot', 'OAI-SearchBot', 'anthropic-ai'];
  const blocked = rbOk ? (wholeBlock ? AI : AI.filter(a => blocks(groups, a))) : [];
  const core = ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended'].filter(a => blocked.includes(a));
  out.push(C('aicrawl', 'ai', 'AI crawlers allowed', 4, rb ? (core.length === 0 ? 4 : core.length < 4 ? 2 : 0) : null,
    rb ? (blocked.length ? `robots.txt blocks: ${blocked.join(', ')}.` : 'No AI crawlers are blocked.') : 'Could not read robots.txt.', 'Allow the main AI crawlers in robots.txt if you want AI tools to read and quote you.'));
  const contact = /[\w.+-]+@[\w-]+\.[\w.]+|\+?\d[\d\s().-]{7,}\d/.test(text);
  out.push(C('entity', 'ai', 'Clear business details', 4, (contact ? 2 : 0) + (hasLoc ? 2 : 0), `${contact ? 'Contact details are in the text' : 'No contact details in the text'}; ${hasLoc ? 'location stated' : 'no location stated'}.`, 'State your business name, services, location and contact details in plain text, the same way everywhere.'));
  const dated = /(updated|last updated|modified|reviewed)[^.]{0,40}\b20\d\d\b/i.test(text) || /<time\b[^>]*datetime/i.test(html) || meta(html, 'article:modified_time') || /"dateModified"/.test(html);
  const owner = meta(html, 'author') || /rel\s*=\s*["']author|"author"|"founder"|\bby\s+[A-Z][a-z]+\s+[A-Z][a-z]+/.test(html);
  out.push(C('fresh', 'ai', 'Freshness and ownership', 3, (dated ? 2 : 0) + (owner ? 1 : 0), `${dated ? 'A date is shown' : 'No visible updated date'}; ${owner ? 'an owner or author is shown' : 'no owner or author shown'}.`, 'Show an "updated" date and name the owner or author.'));
  const reviews = /testimonial|reviews?\b|clients say|customers say|what .{0,30} say|★|rated\b|<blockquote/i.test(html);
  const profiles = /linkedin\.com|g\.page|google\.[a-z.]+\/maps|business\.google\.com|facebook\.com|trustpilot\.com/i.test(html);
  out.push(C('trust', 'ai', 'Trust signals', 3, (reviews ? 1.5 : 0) + (profiles ? 1.5 : 0), `${reviews ? 'Reviews or testimonials found' : 'No reviews or testimonials'}; ${profiles ? 'profile links found' : 'no profile links'}.`, 'Add real reviews or testimonials and link to your LinkedIn or Google Business profile.'));

  return { error: null, finalUrl: final.href, checks: out };
}

async function speedChecks(u) {
  const key = process.env.PAGESPEED_API_KEY;
  const api = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed?strategy=mobile&category=performance&category=accessibility&url=' + encodeURIComponent(u.href) + (key ? '&key=' + encodeURIComponent(key) : '');
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), Number(process.env.PSI_TIMEOUT_MS || 24000));
  let j;
  try { const res = await fetch(api, { signal: ctl.signal }); if (!res.ok) throw new Error('psi ' + res.status); j = await res.json(); }
  catch (e) { return { error: 'psi', checks: [
    C('perf', 'speed', 'Google performance score', 18, null, 'Could not run the speed test.', ''),
    C('lcp', 'speed', 'Largest Contentful Paint', 6, null, 'Could not run the speed test.', ''),
    C('weight', 'speed', 'Total page weight', 6, null, 'Could not run the speed test.', ''),
    C('tap', 'mobile', 'Tap targets spaced', 8, null, 'Could not run the speed test.', ''),
    C('hscroll', 'mobile', 'No sideways scrolling', 6, null, 'Could not run the speed test.', '')] }; }
  finally { clearTimeout(timer); }
  const lh = j.lighthouseResult || {}, au = lh.audits || {};
  const perf = lh.categories && lh.categories.performance && lh.categories.performance.score;
  const lcp = au['largest-contentful-paint'] && au['largest-contentful-paint'].numericValue;
  const bytes = au['total-byte-weight'] && au['total-byte-weight'].numericValue;
  const pick = ids => { for (const id of ids) if (au[id] && typeof au[id].score === 'number') return au[id]; return null; };
  const auditPts = (a, max) => a === null ? null : a.score >= 0.9 ? max : a.score * max;
  const out = [];
  out.push(C('perf', 'speed', 'Google performance score', 18, typeof perf === 'number' ? perf * 18 : null, typeof perf === 'number' ? `Google mobile performance score: ${Math.round(perf * 100)} out of 100.` : 'No performance score returned.', 'Compress images, remove unused scripts and use fast hosting to raise your Google performance score.'));
  out.push(C('lcp', 'speed', 'Largest Contentful Paint', 6, typeof lcp === 'number' ? (lcp <= 2500 ? 6 : lcp <= 4000 ? 3 : 0) : null, typeof lcp === 'number' ? `Main content appears in ${(lcp / 1000).toFixed(1)} seconds on a phone.` : 'Not measured.', 'Get the main image or headline on screen in 2.5 seconds or less: smaller hero image, faster server.'));
  out.push(C('weight', 'speed', 'Total page weight', 6, typeof bytes === 'number' ? (bytes < 2e6 ? 6 : bytes < 4e6 ? 3 : 0) : null, typeof bytes === 'number' ? `The page weighs ${(bytes / 1e6).toFixed(1)} MB.` : 'Not measured.', 'Bring the page under 2 MB by resizing and compressing images and video.'));
  // Google removed the readable-text audit (font-size) in Lighthouse 13 (Oct 2025) with no replacement, so its 4 points moved to tap targets.
  const tap = pick(['target-size', 'tap-targets']), cw = pick(['content-width']);
  out.push(C('tap', 'mobile', 'Tap targets spaced', 8, auditPts(tap, 8), tap ? (tap.score >= 0.9 ? 'Buttons and links are easy to tap.' : 'Some buttons or links are too small or too close together.') : 'Not measured.', 'Make buttons and links at least 44px tall with space between them.'));
  out.push(C('hscroll', 'mobile', 'No sideways scrolling', 6, auditPts(cw, 6), cw ? (cw.score >= 0.9 ? 'The page fits the phone screen.' : 'The page is wider than a phone screen.') : 'Not measured.', 'Stop anything wider than the screen from forcing sideways scrolling on phones.'));
  return { error: null, checks: out };
}
module.exports = { pageChecks, speedChecks };
