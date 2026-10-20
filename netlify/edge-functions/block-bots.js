// Deliberate bot blocking, reviewed 6 October 2026. AI-bot visit logging added 18 October 2026, trimmed 20 October 2026.
// Blocked: MJ12bot, DotBot, PetalBot, Bytespider (ByteDance, the one AI crawler we don't allow) and Scrapy,
// plus anything claiming to be Googlebot or Bingbot that fails reverse-DNS verification.
// Do NOT add rules blocking GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, Claude-User,
// PerplexityBot, Perplexity-User, Google-Extended, Applebot or Meta's crawlers. They are welcome (see robots.txt).
//
// Logging: every visit from a known AI crawler or AI agent writes one JSON line to the Netlify edge function
// log, starting with "[ai-bot]". No IP address is recorded. Other bots and human visitors are never logged.
// Find them in Netlify: Logs and metrics, Edge Functions, function "block-bots", search for "[ai-bot]".

const verifiedIpCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000;

export default async (request, context) => {
  // Fail open: if anything below throws, serve the page instead of crashing the site.
  let response;
  try {
    response = await handle(request, context);
  } catch (e) {
    response = await context.next();
  }
  // Logging can never break a page load.
  try { logVisit(request, context, response); } catch (e) { /* ignore */ }
  return response;
};

// Known AI crawlers and agents: [name pattern, label, purpose].
const AI_BOTS = [
  [/GPTBot/i, "GPTBot", "training"],
  [/OAI-SearchBot/i, "OAI-SearchBot", "search"],
  [/ChatGPT-User/i, "ChatGPT-User", "user request"],
  [/ClaudeBot/i, "ClaudeBot", "training"],
  [/Claude-SearchBot/i, "Claude-SearchBot", "search"],
  [/Claude-User/i, "Claude-User", "user request"],
  [/anthropic-ai/i, "anthropic-ai", "training"],
  [/PerplexityBot/i, "PerplexityBot", "search"],
  [/Perplexity-User/i, "Perplexity-User", "user request"],
  [/Google-Extended|GoogleOther|Google-CloudVertexBot/i, "Google AI", "training or agent"],
  [/Applebot/i, "Applebot", "search and training"],
  [/meta-externalagent|meta-externalfetcher|FacebookBot/i, "Meta AI", "training or user request"],
  [/Amazonbot/i, "Amazonbot", "search and training"],
  [/CCBot/i, "CCBot", "training"],
  [/Bytespider/i, "Bytespider", "training (blocked)"],
  [/cohere-ai/i, "Cohere", "training"],
  [/DuckAssistBot/i, "DuckAssistBot", "user request"],
  [/MistralAI-User/i, "MistralAI-User", "user request"],
  [/YouBot/i, "YouBot", "search"],
  [/Diffbot/i, "Diffbot", "training"],
  [/PanguBot|Timpibot|ImagesiftBot/i, "Other AI crawler", "training"]
];

// Named non-AI visitors, so the log says who they are instead of "unknown".
const OTHER_BOTS = [
  [/Googlebot/i, "Googlebot", "search engine"],
  [/bingbot|msnbot|BingPreview/i, "Bingbot", "search engine"],
  [/DuckDuckBot/i, "DuckDuckBot", "search engine"],
  [/YandexBot/i, "YandexBot", "search engine"],
  [/Baiduspider/i, "Baiduspider", "search engine"],
  [/AhrefsBot|SemrushBot|MJ12bot|DotBot|PetalBot|DataForSeoBot|BLEXBot/i, "SEO crawler", "seo tool"],
  [/Lighthouse|Chrome-Lighthouse|PageSpeed/i, "Lighthouse", "site test"],
  [/Google-InspectionTool|Google-Site-Verification|Storebot-Google/i, "Google tool", "site test"],
  [/HeadlessChrome|Playwright|Puppeteer/i, "Headless browser", "test tool or scraper"],
  [/UptimeRobot|Pingdom|StatusCake|Better Uptime|Site24x7/i, "Uptime monitor", "monitoring"],
  [/curl|wget|python-requests|axios|node-fetch|go-http-client/i, "Script or tool", "script"]
];

function logVisit(request, context, response) {
  const ua = request.headers.get("user-agent") || "";
  const path = new URL(request.url).pathname;
  // Page requests only, plus the files AI agents read: robots.txt, llms.txt and sitemap.xml.
  const isAsset = /\.(webp|png|jpe?g|gif|svg|ico|css|js|woff2?|ttf|map|json|xml|txt|pdf)$/i.test(path)
    && !/^\/(robots\.txt|llms\.txt|sitemap\.xml)$/.test(path);
  if (isAsset) return;

  const ai = AI_BOTS.find(([re]) => re.test(ua));
  const generic = /bot|crawl|spider|scrape|fetch|agent|headless|python-requests|axios|node-fetch|go-http-client/i.test(ua);
  if (!ai) return; // only known AI crawlers are logged; people and other bots never are

  const other = ai ? null : OTHER_BOTS.find(([re]) => re.test(ua));
  const line = {
    bot: ai ? ai[1] : (other ? other[1] : "unknown"),
    purpose: ai ? ai[2] : (other ? other[2] : "unknown"),
    method: request.method,
    path,
    status: response ? response.status : 0,
    ua: ua.slice(0, 200)
  };
  console.log((ai ? "[ai-bot] " : "[other-bot] ") + JSON.stringify(line));
}

async function handle(request, context) {
  const ua = request.headers.get("user-agent") || "";

  const strictAllowedPatterns = [/googlebot/i, /googlebot-image/i, /googlebot-video/i, /bingbot/i, /msnbot/i, /bingpreview/i];
  const aiAgentAllowedPatterns = [/google-extended/i, /googleother/i, /google-cloudvertexbot/i];

  if (strictAllowedPatterns.some((re) => re.test(ua))) {
    const ip = context.ip || request.headers.get("x-nf-client-connection-ip") || "";
    const isBing = /bingbot|msnbot|bingpreview/i.test(ua);
    const pattern = isBing ? /\.search\.msn\.com$/i : /\.googlebot\.com$|\.google\.com$/i;
    const result = await isVerifiedIP(ip, pattern);
    // Fail open: crawlers are never blocked by verification failures.
    if (result !== false) {
      return context.next();
    }
    return new Response("Access restricted.", {
      status: 403,
      headers: { "content-type": "text/plain" }
    });
  }

  if (aiAgentAllowedPatterns.some((re) => re.test(ua))) {
    return context.next();
  }

  // Known spam/SEO crawlers and scraping frameworks only - generic dev/monitoring tools
  // (curl, wget, headless Chrome, Playwright/Puppeteer, uptime monitors) are left unblocked.
  const blockedPatterns = [
    /mj12bot/i, /dotbot/i, /petalbot/i,
    /bytespider/i, /scrapy/i
  ];

  if (blockedPatterns.some((re) => re.test(ua))) {
    return new Response("Access restricted.", {
      status: 403,
      headers: { "content-type": "text/plain" }
    });
  }

  return context.next();
}

// Verifies an IP belongs to the given hostname pattern by reverse-DNS then forward-confirming,
// per Google's documented Googlebot-verification method (same approach works for Bingbot).
// Returns true (verified) or null (error, unmatched PTR or forward-DNS mismatch: fail open). Never blocks.
async function isVerifiedIP(ip, hostnamePattern) {
  if (!ip) return null;
  const cacheKey = ip + '|' + hostnamePattern.source;
  const cached = verifiedIpCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.result;

  try {
    const rdnsRes = await fetch(`https://dns.google/resolve?name=${reverseIpToPtr(ip)}&type=PTR`, { signal: AbortSignal.timeout(1200) });
    const rdnsData = await rdnsRes.json();
    const hostnames = (rdnsData.Answer || []).map((a) => a.data.replace(/\.$/, ""));
    const matchedHostnames = hostnames.filter((h) => hostnamePattern.test(h));
    if (matchedHostnames.length === 0) {
      verifiedIpCache.set(cacheKey, { result: null, at: Date.now() });
      return null; // no matching PTR: fail open
    }

    for (const host of matchedHostnames) {
      const isV6 = ip.includes(':');
      const fwdRes = await fetch(`https://dns.google/resolve?name=${host}&type=${isV6 ? 'AAAA' : 'A'}`, { signal: AbortSignal.timeout(1200) });
      const fwdData = await fwdRes.json();
      const ips = (fwdData.Answer || []).map((a) => a.data);
      if (ips.includes(ip)) {
        verifiedIpCache.set(cacheKey, { result: true, at: Date.now() });
        return true;
      }
    }
    verifiedIpCache.set(cacheKey, { result: null, at: Date.now() });
    return null; // forward-DNS mismatch: fail open
  } catch {
    // A slow or failed lookup (1.2 s cap per call) never delays or blocks a crawler.
    return null; // lookup failed - fail open rather than block a real crawler
  }
}

function reverseIpToPtr(ip) {
  if (ip.includes(':')) {
    const groups = expandIPv6(ip);
    const nibbles = groups.join('').split('').reverse().join('.');
    return nibbles + '.ip6.arpa';
  }
  return ip.split(".").reverse().join(".") + ".in-addr.arpa";
}

function expandIPv6(ip) {
  const [head, tail] = ip.split('::');
  const headParts = head ? head.split(':') : [];
  const tailParts = tail ? tail.split(':') : [];
  const missing = 8 - headParts.length - tailParts.length;
  const fullParts = ip.includes('::')
    ? [...headParts, ...Array(missing).fill('0'), ...tailParts]
    : ip.split(':');
  return fullParts.map((g) => g.padStart(4, '0'));
}
