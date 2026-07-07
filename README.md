# Hamburg Ballett Database

Automatically builds and keeps up to date a JSON database of every **upcoming
performance** listed on the **official Hamburg Ballett website**.

- Source: [`https://www.hamburgballett.de/de/kalender/ballett`](https://www.hamburgballett.de/de/kalender/ballett)
  (served by the Hamburgische Staatsoper CMS — this is the same official
  Hamburg Ballett site, just multi-domain hosted)
- Output: [`database/events/hamburg.json`](./database/events/hamburg.json)
- No mock data: every record comes directly from the live site.

## What gets extracted

For every performance:

| Field        | Description                                              |
|--------------|-----------------------------------------------------------|
| `id`         | Stable, generated slug (`title-date-time`)                |
| `company`    | Always `"Hamburg Ballett"`                                 |
| `city`       | Always `"Hamburg"`                                         |
| `title`      | Performance / production title                             |
| `date`       | Performance date, `YYYY-MM-DD`                              |
| `time`       | Performance start time, `HH:MM` (24h)                      |
| `venue`      | Venue name as shown on the site (e.g. `Staatsoper, Großes Haus`) |
| `ticketUrl`  | Direct official ticket-shop URL, or `null` if tickets aren't on sale yet |
| `url`        | Official performance detail page URL                      |

## Requirements

- Node.js 18+
- Internet access (the scraper launches a real headless Chromium browser via
  [Playwright](https://playwright.dev/), because the official calendar renders
  its event list client-side)

## Install & run

```bash
npm install     # installs dependencies and downloads a Playwright Chromium build
npm run fetch   # scrapes the live site and overwrites database/events/hamburg.json
```

Running `npm run fetch` again at any time re-scrapes the site from scratch and
replaces the JSON file with the current, live data. Nothing is appended —
the file always reflects "what the official site currently lists as upcoming".

## How it works

`src/scrape.js`:

1. Opens the official Hamburg Ballett calendar (filtered to the "Ballett"
   category) in headless Chromium.
2. Waits for the calendar to finish client-side rendering.
3. Extracts events using **text-based heuristics** rather than brittle CSS
   class selectors — it looks for the smallest page element containing
   exactly one date/time stamp (e.g. `Sa 5.9.26 16:30`), then reads the
   venue/category/title from the lines of text that follow it, and finds the
   ticket / detail links by their **visible label** (`Tickets`, `Anmeldung`,
   `Details`) rather than by class name.
4. Clicks through the calendar's "next month" control to page forward
   through future months, stopping once two consecutive months in a row
   produce no new events.
5. Filters out anything before today's date (so the file only ever contains
   *upcoming* performances), sorts chronologically, and writes
   `database/events/hamburg.json`.

This approach is deliberately resilient to minor HTML/CSS changes on the
official site (renamed classes, restructured wrapper `div`s, etc.), since it
keys off of visible text patterns instead. If the site undergoes a larger
redesign that breaks these heuristics, the script fails loudly with a
descriptive error rather than silently writing empty or garbled data — check
the console/CI logs and update the heuristics in `src/scrape.js` if that
happens.

## Automatic daily updates (GitHub Actions)

[`.github/workflows/update-hamburg.yml`](./.github/workflows/update-hamburg.yml)
runs `npm run fetch` every day at **03:00 UTC**, and if `hamburg.json`
changed, commits and pushes the update back to the repository automatically.
You can also trigger it manually from the **Actions** tab
(`workflow_dispatch`).

No secrets or configuration are required — it uses the automatically
provisioned `GITHUB_TOKEN` to push the commit.

## Project structure

```
.
├── package.json
├── README.md
├── src/
│   └── scrape.js              # the scraper
├── seed/
│   └── build-seed.js          # one-off helper that produced the initial seed data
├── database/
│   └── events/
│       └── hamburg.json       # generated output — overwritten by `npm run fetch`
└── .github/
    └── workflows/
        └── update-hamburg.yml # daily scheduled scrape + auto-commit
```

## Notes & limitations

- The scraper only visits the official Hamburg Ballett site — no third-party
  ticket resellers or aggregators are used.
- `ticketUrl` is `null` for performances where the official site itself has
  not yet opened ticket sales (shown on-site as messages like *"Wir
  informieren im Servicebereich der Website über aktuelle
  Vorverkaufstermine"*) — this is intentional; it is not a bug.
- Some entries (e.g. `CLICK in` / `Patenklassen Ballett` formats) are
  audience-engagement events rather than public ticketed performances; they
  are included because they appear on the public calendar, with their
  program name folded into the `title` for clarity.
