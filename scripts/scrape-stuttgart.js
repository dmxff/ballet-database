#!/usr/bin/env node
/**
 * scrape-stuttgart.js
 * ===========================================================================
 * Collects every upcoming Stuttgart Ballet performance and writes it to
 * database/events/stuttgart.json.
 *
 * Source of truth (official site + official API):
 *   https://www.stuttgart-ballet.de/schedule/calendar/
 *   Data endpoint (the site's own calendar callback, returns JSON):
 *     https://www.stuttgart-ballet.de/callbacks/getschedule.json
 *       ?filter=&loadForwardFrom=<D.M.YYYY>&searchterm=
 *
 * API instead of HTML scraping:
 *   The public calendar loads its months from the official JSON callback above.
 *   Each response is JSON with { DatesFrom, DatesTo, Calendar, Schedule, ... };
 *   the `Schedule` field is an HTML fragment whose performances carry
 *   schema.org/Event microdata (startDate, name, url, location). We therefore
 *   read the OFFICIAL JSON API directly and page forward month-by-month using
 *   `loadForwardFrom = <previous DatesTo>` instead of driving a rendered page.
 *
 *   Playwright is used only to parse the returned HTML fragment's microdata via
 *   a real DOM (page.setContent + page.evaluate) — the same extraction style as
 *   the Hamburg/Berlin scrapers — not to click through a live page.
 *
 * Resilience:
 *   Extraction keys off stable schema.org microdata (itemprop="startDate" /
 *   "name" / "url") and the ticket link's dedicated class, rather than brittle
 *   layout classes. If the API/markup changes beyond what these heuristics can
 *   handle, the script fails loudly (throws / exits non-zero) instead of
 *   silently writing an empty or garbled file.
 * ===========================================================================
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

// ---------------------------------------------------------------------------
// Configuration — company-specific values live here, not in shared helpers.
// ---------------------------------------------------------------------------

const BASE_URL = 'https://www.stuttgart-ballet.de';
const SCHEDULE_API = `${BASE_URL}/callbacks/getschedule.json`;

const COMPANY = 'Stuttgart Ballet';
const CITY = 'Stuttgart';

const OUTPUT_PATH = path.join(__dirname, '..', 'database', 'events', 'stuttgart.json');

// Safety cap on how many months we page forward, so a bug in the
// pagination-detection logic can never turn into an infinite loop.
const MAX_MONTHS = 24;

// ---------------------------------------------------------------------------
// Helpers (same conventions as scripts/scrape.js and scripts/scrape-berlin.js)
// ---------------------------------------------------------------------------

/** Turn a title into a URL/ID-safe slug. */
function slugify(str) {
  return str
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents (é -> e, etc.)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/** Zero-pad a number to 2 digits. */
function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Format a Date as the API's "D.M.YYYY" (no leading zeros). */
function toApiDate(d) {
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
}

/** "2026-07-31" -> "31.7.2026" for the loadForwardFrom parameter. */
function isoToApiDate(iso) {
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  return `${d}.${m}.${y}`;
}

// ---------------------------------------------------------------------------
// Core extraction — runs inside the browser via page.evaluate() against the
// HTML fragment returned by the official JSON API. Plain, dependency-free JS.
// ---------------------------------------------------------------------------

function extractEventsFromSchedule(baseUrl) {
  const results = [];

  const performances = Array.from(
    document.querySelectorAll('[itemscope][itemtype="http://schema.org/Event"]')
  );

  for (const p of performances) {
    // schema.org startDate carries the full local ISO datetime, e.g.
    // "2026-07-02T19:00:00".
    const startEl = p.querySelector('meta[itemprop="startDate"]');
    const datetime = startEl ? (startEl.getAttribute('content') || '').trim() : null;
    if (!datetime) continue; // day markers without a real performance

    // Title + official detail URL live in the headline link. Scope to the
    // headline so we don't pick up the hidden location block's itemprop="name".
    const nameEl = p.querySelector('.performance__headline [itemprop="name"]');
    const title = nameEl ? nameEl.textContent.replace(/\s+/g, ' ').trim() : null;
    if (!title) continue;

    const urlEl = p.querySelector('.performance__headline a[itemprop="url"]');
    const officialUrl = urlEl
      ? new URL(urlEl.getAttribute('href'), baseUrl).toString()
      : null;
    if (!officialUrl) continue;

    const venueEl = p.querySelector('.performance__location');
    const venue = venueEl ? venueEl.textContent.replace(/\s+/g, ' ').trim() : null;

    // Ticket link: an <a class="performance__ticketlink"> pointing at the
    // official ticket shop. When sales aren't open / sold out, the same slot is
    // a <span> (no href), so ticketUrl stays null.
    const ticketAnchor = p.querySelector('a.performance__ticketlink[href]');
    let ticketUrl = null;
    if (ticketAnchor) {
      const href = ticketAnchor.getAttribute('href') || '';
      if (href && href !== '#' && !href.startsWith('javascript:')) {
        ticketUrl = new URL(href, baseUrl).toString();
      }
    }

    results.push({ datetime, title, venue, ticketUrl, officialUrl });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function scrape() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (compatible; BalletDatabaseBot/1.0; +https://github.com/)',
    locale: 'en-GB',
  });
  const page = await context.newPage();

  const collected = new Map(); // dedupe key -> raw event

  // Start one day before today so today's performances are included, then page
  // forward month-by-month using each response's DatesTo.
  const start = new Date();
  start.setDate(start.getDate() - 1);
  let loadForwardFrom = toApiDate(start);

  let emptyMonths = 0;
  let lastDatesTo = null;

  for (let i = 0; i < MAX_MONTHS; i++) {
    const url = `${SCHEDULE_API}?filter=&loadForwardFrom=${encodeURIComponent(loadForwardFrom)}&searchterm=`;
    console.log(`Fetching ${url} ...`);

    const resp = await context.request.get(url, { timeout: 60000 });
    if (!resp.ok()) {
      throw new Error(`Official schedule API returned HTTP ${resp.status()} for ${url}`);
    }

    const data = await resp.json();
    if (data.ResultCode && data.ResultCode !== 'Ok') {
      throw new Error(`Official schedule API reported ResultCode "${data.ResultCode}".`);
    }

    const scheduleHtml = data.Schedule || '';
    await page.setContent(scheduleHtml, { waitUntil: 'domcontentloaded' });
    const raw = await page.evaluate(extractEventsFromSchedule, BASE_URL);

    if (raw.length === 0) {
      emptyMonths++;
    } else {
      emptyMonths = 0;
      for (const ev of raw) {
        const key = `${ev.officialUrl}__${ev.datetime}`;
        if (!collected.has(key)) collected.set(key, ev);
      }
    }

    // Stop once the published schedule runs out (a couple of empty months in a
    // row), or if the API stops advancing its DatesTo cursor.
    if (emptyMonths >= 2) break;

    const datesTo = data.DatesTo;
    if (!datesTo || datesTo === lastDatesTo) break;
    lastDatesTo = datesTo;
    loadForwardFrom = isoToApiDate(datesTo);
  }

  await browser.close();

  if (collected.size === 0) {
    throw new Error(
      'No events were extracted from the official Stuttgart Ballet schedule API. ' +
        'The endpoint or its markup may have changed — check ' +
        `${SCHEDULE_API} manually before assuming there are no upcoming shows.`
    );
  }

  // -------------------------------------------------------------------------
  // Build final records in the required shape, filter to upcoming only, and
  // sort chronologically.
  // -------------------------------------------------------------------------
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;

  const events = Array.from(collected.values())
    .map((ev) => {
      const date = ev.datetime.slice(0, 10); // YYYY-MM-DD
      const time = ev.datetime.slice(11, 16); // HH:MM
      return { ...ev, date, time };
    })
    .filter((ev) => /^\d{4}-\d{2}-\d{2}$/.test(ev.date) && ev.date >= todayStr)
    .map((ev) => ({
      id: `${slugify(ev.title)}-${ev.date}-${ev.time.replace(':', '')}`,
      company: COMPANY,
      city: CITY,
      venue: ev.venue,
      title: ev.title,
      date: ev.date,
      time: ev.time,
      datetime: ev.datetime,
      ticketUrl: ev.ticketUrl,
      officialUrl: ev.officialUrl,
    }));

  events.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(events, null, 2) + '\n', 'utf-8');

  console.log(`Wrote ${events.length} upcoming events to ${OUTPUT_PATH}`);
}

scrape().catch((err) => {
  console.error('Scrape failed:', err);
  process.exit(1);
});
