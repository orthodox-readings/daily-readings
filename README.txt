DAILY READINGS  —  v34  (Old Calendar Orthodox daily readings, a home-screen web app)
=====================================================================================

WHAT THIS IS
Each day's Orthodox calendar on the OLD CALENDAR (Julian): the Epistle and Gospel in
full, the saints and Lives of the Saints, the fast with a plain explanation, a saying
from the Fathers, and links for prayer and study. A New Testament reader (English and
Greek) and a fasting calendar sit alongside. Day data comes live from orthocal.info
(Slavic Old-Calendar tradition); everything else is in this folder and works offline.

THE FIVE TABS
  Today      The day card (civil date, Old Style date, tone, feast, fasting guidance,
             liturgical colour when the day determines one, next feast and Pascha),
             Wisdom of the Fathers, Holy Scripture (Epistle and Gospel; English,
             Parallel or Greek; KJV or NKJV; text size), Saints of the Day (com-
             memorations, Lives), service notes. ‹ › or swipe to change day.
  Calendar   Month, Week and Year views. Colours show the general fasting rule
             (fast, strict fast, fish allowed, wine & oil); a cross marks the great
             feasts. Tap a day once to see it, again (or "Open this day's readings")
             to open it. On a fast day, today or earlier, you can make a private note
             (Kept / In part). The Fasting card shows the season's progress.
  Scripture  The New Testament by book and chapter: English (KJV), Greek, or both.
             Tap a verse to copy, share, bookmark or highlight it. The bookmark icon
             lists saved verses; the frame icon gives distraction-free reading. The
             app remembers where you were.
  Prayer     Morning prayers / prayers before sleep, St Theophan's thought for the
             day, the Prologue of Ohrid, the Jordanville (ROCOR) calendar, the full
             service texts (azbyka.ru), and the parish support details.
  Settings   Theme (Auto / Light / Dark), reading size, language, the English text of
             the daily readings, the Greek edition (Byzantine Textform or Patriarchal
             Text), saving the New Testament for offline use, the calendar, About &
             sources.

FILES
  index.html              the whole app (HTML, CSS and JavaScript in one file)
  sw.js                   offline support (service worker). CHANGE "v34" WHENEVER THE APP CHANGES.
  manifest.webmanifest    name and icons for the home screen
  fathers.json            the 115 sayings of the Fathers
  greek/{book}/{ch}.json  Greek NT, Byzantine Textform (Robinson–Pierpont 2018), one file per chapter
  greek-pt/{book}.json    Greek NT, Patriarchal Text (Antoniades 1904/1912; Robinson & Ala-Konni
                          transcription, unaccented), one file per book
  kjv/{book}.json         English NT, King James Version (eBible.org text), one file per book
  fonts/                  Literata (SIL Open Font License) — Latin, Greek and polytonic Greek
  icon-*.png, apple-touch-icon.png, favicon-32.png
  test.js                 automated checks (node test.js; needs Playwright)
  tools/                  build scripts for the Greek and KJV files; make_preview.py

PUBLISHING (GitHub Pages: github.com/orthodox-readings/daily-readings)
  GitHub Pages publishes the site from this repository. main and gh-pages are kept identical:
  always push the same commit to both.
  1. Change the version in sw.js (CACHE = PREFIX + "v35") and APP_VERSION in index.html.
  2. Run the checks:            node test.js        (all must pass)
  3. Commit to main, push main, then push the same commit to gh-pages.
  4. Wait for Pages to rebuild (4–10 minutes). Check the ROOT address with a cache-buster,
     e.g. https://orthodox-readings.github.io/daily-readings/?fresh=1
  Installed phones get the new version the next time the app is opened online (the page
  is fetched network-first; the new service worker then replaces the old cache).
  Saved preferences, saved days and bookmarks live in the phone's browser storage and are
  never touched by an update.

REVIEW COPY (preview)
  python3 tools/make_preview.py ../preview-build
  Publish the output as a folder called "preview/" on the branch GitHub Pages serves (see the
  repository's Settings -> Pages). It then appears at
  https://orthodox-readings.github.io/daily-readings/preview/ with its own service worker and
  cache names, so it never replaces or clears the live app. Remove the folder when done.

SOURCES AND LICENCES (see also Settings → About & sources)
  Readings & calendar: orthocal.info (Slavic Old-Calendar tradition), KJV text.
  Lives of the Saints: Abbamoses.com (John Brady), used with permission via orthocal.
  NKJV: © 1982 Thomas Nelson — fetched from an unofficial source; NOT cleared for a public
        or store release (see the v34 report). KJV is shown whenever NKJV is unavailable.
  KJV: public domain (eBible.org). Byzantine Textform: public domain. Patriarchal Text
        transcription: public domain. Literata: SIL Open Font License (fonts/OFL-Literata.txt).
  Sayings of the Fathers: parish selection; some adapted or paraphrased and marked so.
