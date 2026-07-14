DAILY ORTHODOX READINGS  —  your home-screen app
=================================================

WHAT THIS IS
A small web app showing each day's Orthodox calendar — the full list of
saints & feasts, the fast, and the Epistle & Gospel in full — on the OLD
CALENDAR (Julian) by default. It also has a "Thought for the Day" card that
opens St Theophan the Recluse's official English reflection for the day on
OrthoChristian. Data is pulled live from orthocal.info (Old-Calendar
reckoning of Holy Trinity Monastery, Jordanville), so it stays correct every
day with nothing to update.

FILES (keep them all together in one folder)
  index.html            the app
  manifest.webmanifest  app name + icons
  sw.js                 offline support
  icon-192.png / icon-512.png / apple-touch-icon.png / favicon-32.png  icons


STEP 1  —  PUT IT ONLINE (once, on a computer)
The app has to live at a web address (https) before a phone can install it.
Easiest, free, no coding:
  1. Go to   app.netlify.com/drop
  2. Drag this whole folder onto the page.
  3. In a few seconds you get a link like  https://your-name.netlify.app
  4. (Optional) Make a free Netlify account to keep the link permanently and
     rename it to something tidy.

STEP 2  —  ADD IT TO YOUR PHONE
  iPhone (must use Safari):
    1. Open the link in Safari.
    2. Tap Share (the square with an up-arrow).
    3. Tap "Add to Home Screen"  ->  Add.
  Android (Chrome):
    1. Open the link in Chrome.
    2. Tap the  three-dot menu  ->  "Add to Home screen" / "Install app".

A gold-cross icon appears on your home screen. Tap it each morning.


USING IT
  - ‹ › arrows beside the date (or swipe) move a day; TAP THE DATE to open
    the visual month calendar — fast days shaded, fish-allowed marks, great
    feasts marked with a cross, liturgical-colour dots; tap any day to open
    it. (Tap the month title for a quick year picker.) "Go to today" appears
    when you're away from today.
  - Settings live behind the GEAR (top right): Old/New Calendar,
    Bible text (KJV / NKJV), and A−/A+ text size — all remembered.
  - NKJV loads per reading (unofficial source; © Thomas Nelson) and falls
    back to KJV automatically; the badge beside each reference tells you
    which text you are reading.
  - Commemorations, Epistle and Gospel fold into slim bars — tap to open.
  - Fast days with no noted relaxation show the traditional strict norm.
  - Feast & fast tracker: current fast day count, next Great Feast,
    Pascha countdown.
  - Lives of the Saints: tap a name to read the Jordanville note.
  - Troparia & Kontakia: opens the day's hymns on the Jordanville calendar.
  - "A Thought for the Day": St Theophan's reflection on OrthoChristian.
  - Wisdom of the Fathers: a daily rotating saying (bundled, offline).
  - Share button (top right): send the day to WhatsApp, Signal, etc.
  - Days you've already opened are saved, so they still show offline.
  - Design: black & gold, always — made for OLED screens and easy eyes.


NOTES
  - Double-clicking index.html on your computer (file://) will NOT load the
    readings — it must be hosted online first (Step 1). This is normal.
  - Permanent free alternative to Netlify — GitHub Pages:
    create a repository, upload these files, then Settings -> Pages ->
    deploy from the main branch (root). Your URL becomes
    https://<username>.github.io/<repository>/
  - If orthocal.info is ever unreachable, the app shows your last saved day.
