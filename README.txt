DAILY READINGS  —  v36  (ROCOR, Old Calendar: daily readings, a home-screen web app)
=====================================================================================

WHAT THIS IS
Each day's Orthodox calendar as kept by the Russian Orthodox Church Outside of Russia (ROCOR),
on the OLD CALENDAR (Julian): the season and the fast, the Epistle and Gospel in full, the
saints and Lives of the Saints, a saying from the Fathers, and links for prayer and study. A
New Testament reader (English and Greek) and a fasting calendar sit alongside.
The fasting rule (Typikon, as kept in ROCOR), the liturgical colours (ROCOR Liturgical
Handbook), the season and the ROCOR feasts are worked out on the device. The day's readings
and saints come live from orthocal.info, whose Slavic data follows the OCA's calendar; the
ROCOR differences confirmed so far are corrected in the app and marked on the day.

THE FIVE TABS
  Today      A. The day card: civil date, Old Style date, tone, feast, the liturgical
                season ("Nativity Fast — Day 1 of 40"), fasting guidance, liturgical
                colour when the day determines one, next feast and Pascha.
             B. The daily reading: Morning Prayers, the Epistle and Gospel (English,
                Parallel or Greek; text size), other readings of the day (folded),
                Saints of the Day with the Lives, troparia and kontakia, Evening Prayers.
             C. Wisdom of the Fathers: a sourced saying, its work, share and save (♡).
             D. "Customise Today" hides any of the extra sections.
             ‹ › or swipe to change day.
  Calendar   Month, Week and Year views. Colours show the general fasting rule; a cross
             marks the great feasts. Tap a day once to see it, again to open it. On a
             fast day, today or earlier, a private note (Kept / In part, and a written
             note). The Fasting card shows the season's progress.
  Scripture  The New Testament by book and chapter: English (KJV), Greek, or both.
             Tap a verse to copy, share, bookmark or highlight it.
  Prayer     Morning prayers / prayers before sleep, St Theophan, the Prologue of Ohrid,
             the Holy Trinity calendar (the one Jordanville's website shows), the ROCOR
             diocesan calendar (Australia and New Zealand), service texts (azbyka.ru), saved
             sayings, and the parish support details.
  Settings   Theme, reading size, Customise Today, language, Greek edition, sayings
             awaiting review, OFFLINE READING (the coming 30 days; the New Testament in
             English and in either Greek edition), BACKUP AND RESTORE, TRADITION AND
             CALENDAR (ROCOR; Traditional Julian), About & sources (with the full source
             and licence registry).

HOW THE APP IS MADE
  The app is published as one page (index.html) but edited as modules:
    src/page-head.html       <head> metadata
    src/css/*.css            styles (joined in file-name order)
    src/html/*.html          markup (joined in file-name order)
    src/js/*.js              the app (joined in file-name order, inside one private scope)
    src/sw.template.js       the offline service worker
    src/manifest.json        the home-screen manifest
    data/sources.json        the content source registry (Settings → About & sources)
  Build:   python3 tools/build.py          writes index.html, sw.js, manifest.webmanifest, packages.json
  Check:   python3 tools/build.py --check  (fails if the built files are out of date)
  Never edit index.html or sw.js by hand. The version number is VERSION in tools/build.py; the
  build adds a hash of everything shipped, so the offline copy on every phone updates itself.

OTHER FILES
  fathers.json            the 115 sayings of the Fathers (format 2: id, status, work, reference)
  packages.json           the offline packages and their sizes and versions (made by the build)
  greek/{book}/{ch}.json  Greek NT, Byzantine Textform (Robinson–Pierpont 2018), one file per chapter
  greek-pt/{book}.json    Greek NT, Patriarchal Text (Antoniades 1904/1912; Robinson & Ala-Konni
                          transcription, unaccented), one file per book
  kjv/{book}.json         English NT, King James Version (eBible.org text), one file per book
  fonts/                  Literata (SIL Open Font License) — Latin, Greek and polytonic Greek
  docs/BACKUP-FORMAT.md   the backup file format
  docs/REMINDERS.md       reminders: what is and is not possible, and the recommendation
  CHANGELOG.md            what changed in each version
  test.js                 automated checks (node test.js; needs Playwright)
  tools/                  build.py, make_preview.py, and the scripts that built the Greek and KJV files

SWITCHES IN src/js/00-core.js
  NKJV_ENABLED = false    The New King James Version stays off until its publisher grants permission
                          in writing. Do not switch it on for a public or store release without that.
  LOGOS_URL = ""          Set to the published address of the ΛΟΓΟΣ app to show a link in Settings.

PUBLISHING (GitHub Pages: github.com/orthodox-readings/daily-readings)
  GitHub Pages publishes the site from this repository. main and gh-pages are kept identical:
  always push the same commit to both.
  1. python3 tools/build.py          (then python3 tools/build.py --check)
  2. node test.js                    (all must pass)
  3. Commit to main, push main, then push the same commit to gh-pages.
  4. Wait for Pages to rebuild (4–10 minutes). Check the ROOT address with a cache-buster,
     e.g. https://orthodox-readings.github.io/daily-readings/?fresh=1
  Installed phones get the new version the next time the app is opened online (the page is
  fetched network-first; the new service worker installs completely, then replaces the old
  copy). Preferences, bookmarks, notes and saved texts are never touched by an update.
  Rollback: push the previous commit (for example the backup-v34 branch) to main and gh-pages.
  ROCOR rules: src/js/20-engines.js (fasting and colours); src/js/40-day-links.js (ROCOR feasts and
  corrections to the day's data). Change them only with the ROCOR discrepancy report to hand.

REVIEW COPY (preview)
  python3 tools/build.py && python3 tools/make_preview.py ../preview-build
  Publish the output as a folder called "preview/" on main and gh-pages (leave everything else
  alone). It appears at https://orthodox-readings.github.io/daily-readings/preview/ with its own
  service worker and cache names, so it never replaces or clears the live app. NOTE: the preview
  and the live app are on the same website, so they share saved preferences, bookmarks and notes.
  A restore made in the preview changes them for the live app too — save a backup first.
  Remove the folder when done.

SOURCES AND LICENCES (full registry: data/sources.json, shown in Settings → About & sources)
  Readings & saints: orthocal.info (Slavic tradition, maintained against the OCA's calendar), KJV text.
  Fasting: the Typikon as kept in ROCOR (computed). Colours: ROCOR Liturgical Handbook (computed).
  Lives of the Saints: Abbamoses.com (John Brady), used with permission via orthocal.
  KJV: public domain (eBible.org; Crown patent in the UK). Byzantine Textform: public domain.
  Patriarchal Text transcription: public domain. Literata: SIL Open Font License (fonts/OFL-Literata.txt).
  NKJV: © 1982 Thomas Nelson — PAUSED (no permission). Not shown, not fetched.
  Sayings of the Fathers: parish selection; each names its work; adapted wording is marked; sayings
  whose source is not confirmed are left out unless the reader turns them on.
