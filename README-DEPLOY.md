# awning.one: deploy notes

This folder is the whole site. Deploy it to Netlify from a Git repository or with the Netlify CLI (`netlify deploy --prod`) so the functions in `netlify/functions` are built. Plain drag-and-drop may skip the functions. Netlify reads `netlify.toml`.

## Environment variables (Netlify > Site configuration > Environment variables)
| Name | Needed | What it does |
|---|---|---|
| `RESEND_API_KEY` | Yes | Sends the scorecard report and the lead notice. Resend is already set up on the awning.one domain. |
| `PAGESPEED_API_KEY` | Strongly advised | Google PageSpeed Insights key (free in Google Cloud). Without it Google limits requests and the speed score may be skipped. |
| `HUBSPOT_TOKEN` | Optional | HubSpot private app token (contacts write). If unset, leads are only emailed. |
| `NOTIFY_TO` | Optional | Where lead notices go. Default `hello@awning.one`. |
| `REPORT_FROM` | Optional | Sender. Default `Awning <hello@awning.one>`. |
| `DAILY_CAP` | Optional | Daily cap on scorecard runs per function instance. Default 500. |

## Before going live (fill these in)
1. `privacy.html` and `terms.html`: replace each yellow highlighted placeholder (registration number, address, Information Officer, retention period, currency and VAT, refund and cancellation terms, care plan edits, jurisdiction).
2. Have a South African lawyer review both pages, then remove `<meta name="robots" content="noindex, follow">` from them and add them to `sitemap.xml`.
3. Search Console and Bing: the verification files are in the root. If they were made for another site, create new ones for awning.one.
4. `https://awning.one/6d04a7f1675f4bb8bd3de4fd5c1eccb1.txt` must open and show only the key (IndexNow). `notify-indexnow.js` runs at each deploy.
5. Google Tag Manager `GTM-5RRDJV9J` loads only after a visitor accepts analytics (`assets/cookie-consent.js`). Do not paste the standard Tag Manager snippet into the pages.
6. Send a test: score a real site, then ask for the report with your own email, and check it arrives (and not in spam).
7. Test the phone number 021 300 8278 from another phone.

## How the scorecard works
- `/api/score` reads the home page, robots.txt and sitemap.xml and returns the Search, AI search and viewport checks.
- `/api/speed` runs Google PageSpeed Insights (mobile) for Speed and the rest of Mobile.
- `assets/compose.js` combines the checks in the browser (weights: Speed 30, Search 25, AI search 25, Mobile 20; bands Good 80+, Fair 50 to 79, Needs work under 50). A check that cannot run is left out and the rest scaled.
- `/.netlify/functions/report-background` re-runs everything and emails the full report. It replies at once and finishes in the background.
- Safeguards: private and internal addresses are refused, only ports 80 and 443, page size and time limits, a hidden honeypot field, a 3-second minimum fill time, and a per-address daily limit. The limit is held in memory per function instance, so treat it as best effort. For a hard limit add a store such as Netlify Blobs.
- Google removed its readable-text audit in Lighthouse 13 (October 2025), so tap targets (Google `target-size`) carry 8 mobile points. If a Google audit is missing or not applicable, the check shows "not scored" and the rest are scaled.

## Content to replace
The before/after slider uses a built-in sample, not a real client site. Swap it for real work once you have it.
