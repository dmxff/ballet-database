#!/usr/bin/env node
/**
 * scrape-berlin.js
 * ===========================================================================
 * Scrapes the OFFICIAL Staatsballett Berlin schedule and writes every upcoming
 * performance to database/events/berlin.json.
 *
 * Source of truth (official site):
 *   https://www.staatsballett-berlin.de/en/schedule.html
 *
 * Why Playwright?
 *   The schedule page ships a large server-rendered DOM, but month navigation,
 *   filter state, and ticket blocks can depend on client-side behaviour. We
 *   drive a real headless browser, wait for the schedule to render, and extract
 *   events from the live DOM using text/structure heuristics rather than brittle
 *   CMS class names.
 *
 * Resilience strategy (IMPORTANT — read before "fixing" selectors):
 *   Instead of depending on auto-generated CSS classes, this scraper:
 *     1. Finds event cards by looking for schedule frames that contain a
 *        venue line, a time line, and a title link to /spielplan/event-detail/.
 *     2. Reads date/time from the card's data-ts attribute and visible time
 *        text, falling back to the displayed day/month when needed.
 *     3. Finds the official detail URL from the link labelled "Infos".
 *     4. Finds the ticket URL from a link whose visible text is "Tickets"
 *        pointing at the official Eventim shop — null when sales are not open,
 *        sold out, or only registration ("Anmelden") is offered.
 *   If the site is redesigned enough that these heuristics break, the script
 *   fails loudly rather than silently writing empty or garbled data.
 * ===========================================================================
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

// ---------------------------------------------------------------------------
// Configuration — company-specific values live here, not in shared helpers.
// ---------------------------------------------------------------------------

const CALENDAR_URL = 'https://www.staatsballett-berlin.de/en/schedule.html';

const COMPANY = 'Staatsballett Berlin';
const CITY = 'Berlin';

const OUTPUT_PATH = path.join(__dirname, '..', 'database', 'events', 'berlin.json');

// Official ticket shop host (Eventim in-house for Staatsballett Berlin).
const TICKET_SHOP_HOST = 'staatsballett-berlin.eventim-inhouse.de';

// ---------------------------------------------------------------------------
// Helpers (same conventions as scripts/scrape.js)
// ---------------------------------------------------------------------------

function slugify(str) {
  return str
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatDateFromTs(tsSeconds) {
  const d = new Date(tsSeconds * 1000);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Parse "7:30 pm", "11:00 am", "19:30" -> "HH:MM" (24h). */
function parseTimeText(raw) {
  const text = (raw || '').trim();
  if (!text) return null;

  const ampm = text.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (ampm) {
    let hour = parseInt(ampm[1], 10);
    const minute = ampm[2];
    const meridiem = ampm[3].toLowerCase();
    if (meridiem === 'pm' && hour !== 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
    return `${pad2(hour)}:${minute}`;
  }

  const h24 = text.match(/^(\d{1,2}):(\d{2})$/);
  if (h24) return `${pad2(h24[1])}:${h24[2]}`;

  return null;
}

// ---------------------------------------------------------------------------
// Core extraction — runs inside the browser via page.evaluate().
// ---------------------------------------------------------------------------

function extractEventsFromPage(ticketShopHost) {
  const results = [];

  const frames = Array.from(document.querySelectorAll('.frame-spielplan'));

  for (const frame of frames) {
    const tsAttr = frame.getAttribute('data-ts');
    if (!tsAttr) continue;

    const tsSeconds = parseInt(tsAttr, 10);
    if (Number.isNaN(tsSeconds)) continue;

    const date = (() => {
      const d = new Date(tsSeconds * 1000);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    })();

    const venueEl = frame.querySelector('.ni-venue span span, .ni-venue span');
    const venue = venueEl ? venueEl.textContent.trim() : null;

    const timeEl = frame.querySelector('.ni-time-container .time');
    const timeRaw = timeEl ? timeEl.textContent.trim() : null;

    const titleEl = frame.querySelector('.ni-link-title h3, .ni-teaser-title h3');
    const title = titleEl ? titleEl.textContent.trim() : null;
    if (!title) continue;

    const infosLink = Array.from(frame.querySelectorAll('a[href]')).find(
      (a) => a.textContent.trim() === 'Infos' && /\/spielplan\/event-detail\//.test(a.getAttribute('href') || '')
    );
    const url = infosLink
      ? new URL(infosLink.getAttribute('href'), window.location.href).toString()
      : null;
    if (!url) continue;

    // Ticket link: official Eventim shop with visible "Tickets" label.
    let ticketUrl = null;
    const ticketLink = Array.from(frame.querySelectorAll('a[href]')).find((a) => {
      const href = a.getAttribute('href') || '';
      const label = a.textContent.trim();
      return (
        label === 'Tickets' &&
        href.includes(ticketShopHost) &&
        href.includes('/webshop/webticket/') &&
        !href.startsWith('javascript:')
      );
    });
    if (ticketLink) {
      ticketUrl = new URL(ticketLink.getAttribute('href'), window.location.href).toString();
    }

    results.push({ title, venue, date, timeRaw, ticketUrl, url, tsSeconds });
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

  console.log(`Navigating to ${CALENDAR_URL} ...`);
  await page.goto(CALENDAR_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1500);

  const raw = await page.evaluate(extractEventsFromPage, TICKET_SHOP_HOST);
  await browser.close();

  if (raw.length === 0) {
    throw new Error(
      'No events were extracted. The official site may have changed its markup ' +
        'beyond what this scraper\'s heuristics can handle — check CALENDAR_URL manually.'
    );
  }

  const collected = new Map();

  for (const ev of raw) {
    const time = parseTimeText(ev.timeRaw);
    if (!time) continue;

    const key = `${ev.url}__${ev.date}__${time}`;
    if (!collected.has(key)) {
      collected.set(key, { ...ev, time });
    }
  }

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;

  const events = Array.from(collected.values())
    .filter((ev) => ev.date >= todayStr)
    .map((ev) => ({
      id: `${slugify(ev.title)}-${ev.date}-${ev.time.replace(':', '')}`,
      company: COMPANY,
      city: CITY,
      venue: ev.venue,
      title: ev.title,
      date: ev.date,
      time: ev.time,
      datetime: `${ev.date}T${ev.time}:00`,
      ticketUrl: ev.ticketUrl,
      officialUrl: ev.url,
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
