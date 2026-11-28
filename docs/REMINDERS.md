# Reminders — investigation only (Phase 1)

The brief asked for reminders (for example, morning and evening prayers, or the eve of a feast) to be
investigated, left disabled, and not simulated where they would be unreliable. Nothing in version 35 sends or
schedules a notification.

## What a static web app on GitHub Pages can and cannot do (checked 28 November 2026)

| Approach | Works without a server? | Reliable at a set time? | Notes |
|---|---|---|---|
| Notification Triggers (scheduled local notifications from a web page) | Would have | Would have | Chrome ran an origin trial and then stopped: "The development of Notification Triggers API … has ended." Not available in any browser. |
| Periodic Background Sync | Yes | **No** | Chromium only, installed apps only; the browser decides when it runs (typically no more often than about every 12 hours, depending on how much the app is used). Not supported on iPhone or iPad. Unsuitable for "7 am prayers". |
| Web Push | **No** — needs a push server (VAPID keys, a sender running on a schedule) | Mostly | Supported on Android browsers and, since iOS 16.4, on iPhone/iPad for web apps added to the Home Screen. Needs a server or a paid push service, which the brief rules out without approval. |
| Notifications while the app is open | Yes | Only while the app is open | Not a reminder in any useful sense. |

Sources: Chrome for Developers, "Notification Triggers API" (status banner); M. Firtman, "iOS PWA
Compatibility" notes (last updated 13 Oct 2026): Web Push "16.4 only for installed PWAs", Background Sync and
Periodic Background Sync not supported.

## Recommendation

* **Now (web app):** keep reminders off. Do not offer a reminder switch that might not fire.
* **If reminders are wanted before a native release:** Web Push with a small scheduled sender. This adds a
  server (or a third-party push service), keys to look after and possibly a cost — it needs your approval
  first, per the brief.
* **Native release (Capacitor, a later phase):** the Capacitor Local Notifications plugin schedules
  notifications on the phone itself (Android and iOS) with no server and no cost. This is the clean way to
  offer morning/evening prayer and eve-of-feast reminders, off by default, chosen by the reader.

Whatever is built later: reminders off by default; plain wording; no streaks, counts or pressure; times and
days chosen by the reader; easy to turn off.
