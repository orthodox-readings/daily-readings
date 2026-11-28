# Daily Readings — backup file format (version 1)

Settings → Backup and restore → **Save a backup** writes one JSON file, named
`daily-readings-backup-YYYY-MM-DD.json`. It holds only the reader's own records and settings. It never holds
saved days of readings, offline texts, anything about the device, or anything from the calendar service.
The app does not send the file anywhere; the reader chooses where it goes.

The file contains private fasting notes, bookmarks and highlights. Anyone who has the file can read them.

## Layout

```json
{
  "format": "daily-readings-backup",
  "version": 1,
  "created": "2026-11-28T09:15:00.000Z",
  "app": "35",
  "about": "Personal data from the Daily Readings app …",
  "data": {
    "settings": {
      "pref:lang": "par",
      "pref:greek": "1",
      "pref:theme": "auto",
      "pref:scale": "110",
      "pref:gkEd": "rp",
      "pref:txt": "kjv",
      "pref:reviewQuotes": "0",
      "pref:todayHide": ["notes"]
    },
    "reader": { "b": 43, "c": 3, "v": 16 },
    "bookmarks":  [ { "b": 43, "c": 3, "v": 16, "s": "For God so loved the world…", "t": 1764300000000 } ],
    "highlights": [ { "b": 45, "c": 8, "v": 28, "s": "And we know that all things…", "t": 1764300000000 } ],
    "fastlog":   { "2026-11-28": "k", "2026-11-30": "p" },
    "fastnotes": { "2026-11-28": "A private written note" },
    "savedSayings": ["q001", "q042"]
  }
}
```

| Field | Meaning | Rules checked on restore |
|---|---|---|
| `format` | Always `daily-readings-backup` | Any other value: the file is refused |
| `version` | Format version, a number | Higher than the app understands: refused, with a request to update the app |
| `created` | When the file was made (ISO 8601, UTC) | Shown to the reader; optional |
| `app` | App version that made the file | Shown to the reader; optional |
| `settings` | Reading and display choices, as stored | Each value must be one the app offers (language `en`/`par`/`grc`; theme `auto`/`light`/`dark`; size 90–160 in the app's steps; Greek edition `rp`/`pt`; `pref:todayHide` only the app's section names) |
| `reader` | Last place in the Scripture reader | Book 40–66, a chapter that exists in that book, verse 1–200 |
| `bookmarks`, `highlights` | Verses: book `b` (40 Matthew … 66 Revelation), chapter `c`, verse `v`, a short excerpt `s`, time `t` (ms) | Same checks as `reader`; duplicates dropped; excerpt cut to 200 characters |
| `fastlog` | Fasting notes by civil date: `k` kept, `p` kept in part | Date `YYYY-MM-DD`; value `k` or `p` |
| `fastnotes` | Written notes by civil date | Date `YYYY-MM-DD`; non-empty text, cut to 500 characters |
| `savedSayings` | Ids of saved sayings of the Fathers (`fathers.json`) | `q` followed by 3–4 digits; duplicates dropped |

Anything that does not pass is left out, and the reader is told how many entries were left out before
anything is changed.

## Restoring

The reader chooses:

* **Merge with this device** (the default). The backup fills in what this device lacks. Where both hold an
  entry for the same verse or day, this device's entry is kept. Settings and the reading position on this
  device stay as they are (the reading position is taken from the backup only if this device has none).
* **Replace what is on this device.** This device is made to match the backup exactly — records, reading
  position and settings. Anything here that is not in the backup is removed. The app asks for confirmation
  first, naming what is on the device now.

Before either kind of restore, the app keeps a copy of what was there (`backup:undo` in local storage), and
Settings offers **Undo the last restore** until the next restore.

## Storage keys covered

`pref:lang`, `pref:greek`, `pref:theme`, `pref:scale`, `pref:gkEd`, `pref:txt`, `pref:todayHide`,
`pref:reviewQuotes`, `reader:pos`, `user:bookmarks`, `user:highlights`, `user:fastlog`, `user:fastnotes`,
`user:favQuotes`.

Not covered (working copies, not personal data): `day:*` (saved days), `pkg:*` (offline-package records),
`nkjv:*`, `pref:installDismissed`, `backup:*`.

## Changing the format

Add fields freely within version 1 (older apps ignore what they do not know). Raise `version` only when a
field changes meaning; older apps then refuse the file instead of misreading it.
