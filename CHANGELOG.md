# Daily Readings — changelog

## Version 35 — Phase 1 (development version, for review; not live)

Built on version 34 (live). Nothing that version 34 offers was removed, except the New King James Version,
which is paused for licensing reasons (below).

### Today
- **Order as briefed:** the day and season first; then Morning Prayers, the Epistle and Gospel, the day's other
  readings, Saints of the Day (with the Lives inside), troparia and kontakia, Evening Prayers; then the Wisdom of
  the Fathers; then the extras the reader chooses.
- **Liturgical season in the day card**, worked out from the Paschalion and the Old Style date: for example
  "Nativity Fast — Day 1 of 40", "Great Lent — Day 17 of 40 · 3rd week of Great Lent", "Christmastide", "Bright
  Week", "Apostles' Fast — Day 24 of 34", "26th week after Pentecost". Information only — no scores or streaks.
- The Liturgy **Epistle and Gospel stand first**; Matins Gospel, Vespers and other readings are folded under
  "Other readings today".
- **Morning and Evening Prayers and the troparia of the day** open directly from Today.
- **Customise Today** (Today and Settings): switch off prayers, other readings, saints, hymns, Wisdom, the
  feast countdown, service notes or "More for this day". The date, season, fast, Epistle and Gospel always stay.
- With no connection and nothing saved, Today says so plainly and shows only what can be worked out exactly
  (dates, tone, season). The day's fast, readings and saints are no longer filled in from the general rule.
- An app left open (or resumed) after midnight moves on to the new day.

### Wisdom of the Fathers
- `fathers.json` format 2: every saying has an id, a status, and — where identified — its work and place.
  66 sourced, 13 adapted (marked "adapted"), 36 awaiting review.
- Sayings awaiting review (unlocated, anonymous, or by writers who are not saints of the Church) are left out of
  the daily rotation. Settings → "Sayings awaiting review" adds them back, marked "Source awaiting review".
- Save a saying with ♡; saved sayings are listed in the Prayer tab (copy, share, remove).

### Offline reading (Settings)
- New: save **the coming 30 days** (readings, saints, fasting), the **New Testament in English (KJV)**, the
  **Greek Byzantine Textform** or the **Greek Patriarchal Text** — each with its size, progress, Retry, Update and
  Remove. Once saved, the 30 days are kept topped up whenever the app is online.
- **Download fix:** version 34 ran four download chains and reported the result as soon as the first chain ran
  out of work, while others were still downloading, and never checked the files. Version 35 waits for every
  file, checks each one is complete and readable before storing it, checks the whole package afterwards, and
  only then marks it saved. A failed or cut-off file is reported ("Saved 25 of 27 books — Retry").
- Storage used is shown; after a successful save the app asks the browser to protect saved texts from clean-up.

### Reliability
- Service worker: cache name carries the version and a build hash (automatic, from `tools/build.py`); new
  versions install completely before replacing the old; only this app's own old caches are removed; package
  list and source registry are kept offline; a friendly page if the app is opened offline for the very first time.
- A damaged file in the offline store is noticed, removed, fetched again and stored only once it reads correctly.
- Saved copies are labelled: "You're offline. Showing the copy of Saturday 28 November 2026 saved today at
  9:14 am." An "Offline" mark appears in the header; when the connection returns the day reloads.
- Requests that hear nothing for 15 seconds are given up (no endless spinner).
- Housekeeping: saved days older than two weeks are cleared (version 34 never cleared any). Personal records are
  never touched.

### Backup and restore (Settings)
- Save a backup file (download, or share on phones that allow it); restore by **merging** or **replacing**
  (with confirmation); **Undo** the last restore. Every entry is checked; anything unrecognised is left out and
  counted. Format documented in `docs/BACKUP-FORMAT.md`. No analytics; nothing is sent anywhere.

### Calendar
- A private written note can be added to a fast day, beside Kept / In part.

### Licensing and sources
- **New King James Version paused.** It was fetched from an unofficial source and its publisher's permission is
  needed. Everyone now reads the King James Version; no request is made to the NKJV source; NKJV copies saved by
  version 34 are cleared from the device. The code stays behind a switch (`NKJV_ENABLED`) for use if permission
  is granted in writing.
- **Content source registry** (`data/sources.json`), shown in Settings → About & sources: title, author,
  edition, translator, publisher, address, licence, attribution, tradition, date checked, review status.
- ΛΟΓΟΣ (Logos): an optional link in Settings appears only once `LOGOS_URL` is set — no placeholder.

### Code
- The single page is now built from modules (`src/css`, `src/html`, `src/js`, `src/sw.template.js`,
  `src/manifest.json`) by `tools/build.py`; still one static page on GitHub Pages, no frameworks, no server.
- Tests: `node test.js` — 232 automated checks (version 34 had 171).

## Version 34 — live since 28 November 2026
Redesign: five tabs (Today, Calendar, Scripture, Prayer, Settings), new palette and typography, New Testament
reader in English and Greek, fasting calendar with month, week and year views, private fasting notes.

## Version 33
Previous live version (kept on the `backup-v33` branch).
