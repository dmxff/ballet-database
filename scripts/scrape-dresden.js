#!/usr/bin/env node
/**
 * scrape-dresden.js
 * ===========================================================================
 * Collects every upcoming Semperoper Ballett performance and writes it to
 * database/events/dresden.json.
 *
 * Source of truth (official site):
 *   https://www.semperoper.de/spielplan
 *
 * Official structured data instead of HTML scraping:
 *   The public Spielplan embeds the full performance schedule as
 *   `document.NIS__SCHEDULE` — a JSON array maintained by Semperoper's own
 *   CMS (New Image Systems). Each entry carries title, unix timestamp,
 *   genre, venue code, production id (stuecke), and performance uid (sospuid).
 *   There is no separate public REST API (unlike Stuttgart's getschedule.json),
 *   but this embedded schedule IS the official structured source the site's
 *   calendar uses — including events beyond the initially rendered DOM frames.
 *
 *   Playwright is used only for HTTP fetches (context.request.get), matching
 *   the Stuttgart scraper's transport style. Production-page fetches map each
 *   performance uid to the official Eventim ticket-shop event id.
 *
 * Resilience:
 *   Extraction keys off stable schedule fields (genre, hausclass, stuecke,
 *   sospuid) and official URL patterns on semperoper.de / ticket.semperoper.de.
 *   If the site changes beyond what these heuristics can handle, the script
 *   fails loudly (throws / exits non-zero) instead of silently writing empty
 *   or garbled data.
 * ===========================================================================
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

// ---------------------------------------------------------------------------
// Configuration — company-specific values live here, not in shared helpers.
// ---------------------------------------------------------------------------

const BASE_URL = 'https://www.semperoper.de';
const SCHEDULE_URL = `${BASE_URL}/spielplan`;
const TICKET_SHOP = 'https://ticket.semperoper.de/webshop/webticket/shop';

const COMPANY = 'Semperoper Ballett';
const CITY = 'Dresden';

const OUTPUT_PATH = path.join(__dirname, '..', 'database', 'events', 'dresden.json');

// Official Semperoper genre ids from the Spielplan category filter.
const GENRE_BALLET = 3;
const GENRE_BALLET_FOR_KIDS = 39;

// Official pages that link productions to URL slugs (stuecke/stid/<slug>/<id>.html).
const SLUG_SOURCE_URLS = [
  SCHEDULE_URL,
  `${BASE_URL}/spielzeit-2025-26/ballett.html`,
  `${BASE_URL}/spielzeit-2026-27/ballett.html`,
  `${BASE_URL}/en/spielzeit-2026-27/ballet.html`,
];

// Venue codes from the official schedule -> human-readable venue names.
const VENUE_LABELS = {
  'SSO,SSO2': 'Semperoper Dresden',
  SSO: 'Semperoper Dresden',
  SSO2: 'Semperoper Dresden',
  SEMPER2: 'Semper Zwei',
  Schauspielhaus_Kleines_Haus: 'Kleines Haus, Schauspielhaus Dresden',
  Kleiner_Ballettsaal: 'Kleiner Ballettsaal',
};

// ---------------------------------------------------------------------------
// Helpers (same conventions as scripts/scrape.js and scripts/scrape-berlin.js)
// ---------------------------------------------------------------------------

/** Turn a title into a URL/ID-safe slug. */
function slugify(str) {
  return str
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/** Zero-pad a number to 2 digits. */
function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Format a unix timestamp as local Dresden date/time (ISO-like, no TZ suffix). */
function formatBerlinDateTime(tsSeconds) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(tsSeconds * 1000));

  const get = (type) => parts.find((p) => p.type === type).value;
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  const time = `${get('hour')}:${get('minute')}`;
  return { date, time, datetime: `${date}T${time}:00` };
}

function venueLabel(code) {
  return VENUE_LABELS[code] || code || null;
}

// ---------------------------------------------------------------------------
// Official schedule parsing
// ---------------------------------------------------------------------------

/** Extract `document.NIS__SCHEDULE` from the official Spielplan HTML. */
function parseEmbeddedSchedule(html) {
  const marker = 'document.NIS__SCHEDULE = ';
  const start = html.indexOf(marker);
  if (start < 0) {
    throw new Error('Official schedule JSON (NIS__SCHEDULE) not found on Spielplan page.');
  }

  let i = start + marker.length;
  if (html[i] !== '[') {
    throw new Error('Unexpected NIS__SCHEDULE format — expected JSON array.');
  }

  let depth = 0;
  for (; i < html.length; i++) {
    const ch = html[i];
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) {
        return JSON.parse(html.slice(start + marker.length, i + 1));
      }
    }
  }

  throw new Error('Could not parse NIS__SCHEDULE JSON from Spielplan page.');
}

function isBalletEvent(ev) {
  return ev.genre === GENRE_BALLET || ev.genre === GENRE_BALLET_FOR_KIDS;
}

/** Collect stuecke id -> URL slug mappings from official Semperoper pages. */
function collectSlugLinks(html, slugByStueckeId) {
  for (const m of html.matchAll(/spielplan\/stuecke\/stid\/([^/]+)\/(\d+)\.html/g)) {
    slugByStueckeId.set(Number(m[2]), m[1]);
  }
}

/** Build likely slug candidates from an official production title. */
function slugCandidates(title) {
  const base = slugify(title);
  const candidates = [base];
  const stripped = base.replace(/^(der|die|das)-/, '');
  if (stripped !== base) candidates.push(stripped);
  return candidates;
}

/** Resolve an official production slug, verifying the page exists when guessing. */
async function resolveSlug(stueckeId, title, slugByStueckeId, request) {
  const cached = slugByStueckeId.get(stueckeId);
  if (cached) return cached;

  for (const slug of slugCandidates(title)) {
    const url = `${BASE_URL}/spielplan/stuecke/stid/${slug}/${stueckeId}.html`;
    const resp = await request.get(url, { timeout: 60000 });
    if (resp.ok()) {
      const html = await resp.text();
      if (html.includes(`/stid/${slug}/${stueckeId}.html`)) {
        slugByStueckeId.set(stueckeId, slug);
        return slug;
      }
    }
  }

  return null;
}

/** Map performance uid (sospuid) -> official ticket URL from a production page. */
function collectTicketLinks(html) {
  const map = new Map();
  for (const m of html.matchAll(/data-event-id="(\d+)"[\s\S]{0,800}?event=(\d+)/g)) {
    map.set(Number(m[1]), `${TICKET_SHOP}?event=${m[2]}&language=de`);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function scrape() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (compatible; BalletDatabaseBot/1.0; +https://github.com/)',
    locale: 'de-DE',
  });

  console.log(`Fetching official schedule from ${SCHEDULE_URL} ...`);
  const scheduleResp = await context.request.get(SCHEDULE_URL, { timeout: 60000 });
  if (!scheduleResp.ok()) {
    throw new Error(`Official Spielplan returned HTTP ${scheduleResp.status()}.`);
  }
  const scheduleHtml = await scheduleResp.text();
  const schedule = parseEmbeddedSchedule(scheduleHtml);

  const slugByStueckeId = new Map();
  collectSlugLinks(scheduleHtml, slugByStueckeId);

  for (const url of SLUG_SOURCE_URLS) {
    if (url === SCHEDULE_URL) continue;
    console.log(`Fetching slug map from ${url} ...`);
    const resp = await context.request.get(url, { timeout: 60000 });
    if (resp.ok()) collectSlugLinks(await resp.text(), slugByStueckeId);
  }

  const now = new Date();
  const todayParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const todayStr = `${todayParts.find((p) => p.type === 'year').value}-${todayParts.find((p) => p.type === 'month').value}-${todayParts.find((p) => p.type === 'day').value}`;

  const upcomingBallet = schedule.filter(
    (ev) => isBalletEvent(ev) && formatBerlinDateTime(ev.datum_uhrzeit).date >= todayStr
  );

  if (upcomingBallet.length === 0) {
    throw new Error(
      'No upcoming ballet events found in the official NIS__SCHEDULE data. ' +
        'The Spielplan may have changed — check ' +
        `${SCHEDULE_URL} manually before assuming there are no upcoming shows.`
    );
  }

  const stueckeIds = [...new Set(upcomingBallet.map((ev) => ev.stuecke))];
  const ticketBySospuid = new Map();

  for (const stueckeId of stueckeIds) {
    const title = upcomingBallet.find((ev) => ev.stuecke === stueckeId).st_title;
    const slug = await resolveSlug(stueckeId, title, slugByStueckeId, context.request);
    if (!slug) {
      throw new Error(
        `No official URL slug found for ballet production stuecke=${stueckeId} ("${title}"). ` +
          'Check SLUG_SOURCE_URLS or the Semperoper Ballett season pages.'
      );
    }

    const productionUrl = `${BASE_URL}/spielplan/stuecke/stid/${slug}/${stueckeId}.html`;
    console.log(`Fetching ticket map from ${productionUrl} ...`);
    const resp = await context.request.get(productionUrl, { timeout: 60000 });
    if (!resp.ok()) {
      throw new Error(`Official production page returned HTTP ${resp.status()}: ${productionUrl}`);
    }
    ticketBySospuid.set(stueckeId, collectTicketLinks(await resp.text()));
  }

  await browser.close();

  const collected = new Map();

  for (const ev of upcomingBallet) {
    const slug = slugByStueckeId.get(ev.stuecke);
    if (!slug) continue;
    const { date, time, datetime } = formatBerlinDateTime(ev.datum_uhrzeit);
    const ticketUrl = ticketBySospuid.get(ev.stuecke)?.get(ev.sospuid) ?? null;
    const officialUrl = `${BASE_URL}/spielplan/stuecke/stid/${slug}/${ev.stuecke}.html#a_${ev.sospuid}`;

    const key = `${officialUrl}__${date}__${time}`;
    if (!collected.has(key)) {
      collected.set(key, {
        title: ev.st_title,
        venue: venueLabel(ev.venue),
        date,
        time,
        datetime,
        ticketUrl,
        officialUrl,
      });
    }
  }

  const events = Array.from(collected.values())
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
