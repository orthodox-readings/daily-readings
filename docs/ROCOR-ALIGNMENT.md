# ROCOR alignment — what the app follows, and why (version 36)

The full discrepancy report (sources, every difference found, open questions) was delivered with version 36.
This file is the maintainer's summary. Rules live in `src/js/20-engines.js` (fasting, colours, seasons) and
`src/js/40-day-links.js` (ROCOR feasts and corrections to the day's data).

## Where each part comes from

| Part of the app | Source followed | Status |
|---|---|---|
| Fasting rule (Today and Calendar) | Typikon ch. 32–33 as kept in ROCOR (orthodox.net, St Nicholas, McKinney TX); Holy Trinity calendar shown by jordanville.org | Computed on the device; checked day by day |
| Liturgical colours | Liturgical Handbook of the Russian Orthodox Church Abroad (Diocese of Great Britain and Western Europe) | Computed; the handbook notes limited local variation |
| Pascha, movable feasts, tones, seasons, memorial Saturdays | Julian Paschalion; checked against the ROCOR ANZ diocesan calendar (Nov 2026) and Jordanville (27 Nov 2026) | Computed |
| Readings, saints, Lives | orthocal.info — its Slavic data is compiled and checked against the OCA's calendar (its own docs) | Live; ROCOR corrections below |
| ROCOR feasts the data lacks | ROCOR ANZ diocesan calendar; ROCOR diocesan reports | Bundled supplement |

## ROCOR corrections to orthocal.info

| Rule | ROCOR | orthocal.info | Evidence |
|---|---|---|---|
| Wed/Fri of the Paschal season | Fish | Wine and oil | Holy Trinity calendar samples (22, 24, 29 Apr 2026) |
| Polyeleos saint on an ordinary Wed/Fri | Wine and oil | Strict | Holy Trinity calendar, 7 of 7 samples |
| Leavetaking of Theophany / St Sava (14 Jan OS) on Wed/Fri | Fish | Strict | Holy Trinity calendar sample |
| Nativity Fast ranked days (Typikon ch. 33) | Tue/Thu fish; Mon/Wed/Fri wine and oil | Weekday rule only | ROCOR parish table for 1998 (same weekdays as 2026): 40 of 40 days, one documented exception |
| Kazan Icon (22 Oct OS) | Feast, vigil; fish on Wed/Fri; its readings | Absent | ROCOR ANZ diocesan calendar, 4 Nov 2026 |
| Kursk Root Icon (27 Nov OS) | Feast, vigil; fish | Absent | ROCOR parish typikon note (orthodox.net) |
| New Martyrs and Confessors (Sunday closest to 25 Jan OS) | Kept | Missed in early-Pascha years (2026) — a year-boundary bug | EAD reports, 8 Feb 2026 and 9 Feb 2025 |
| St John of Kronstadt (19 Oct OS) | His readings added | Not given | ROCOR ANZ diocesan calendar, 1 Nov 2026 |
| Wed and Fri of the 5th week of Lent | Strict (Thursday wine and oil) | Wine and oil (the OCA's Great Canon/Akathist allowances) | orthocal's own audit notes; Typikon |
| OCA-only allowances (27 Feb, 31 Mar, 7 Apr, 7 May, 26 Jul, 9 Aug, 24 Sep, 9 Oct OS) | Not used | Used | OCA commemorations (some on New Style dates placed in Old Style slots) |
| Sunday "Synaxis of the Holy Unmercenaries" | Not kept (1 Nov OS) | Sunday transfer | ROCOR ANZ diocesan calendar, 15 Nov 2026 |
| Memorials of revered people who are not saints | Not listed | Listed among saints | — |

## Verification (version 36)

- All 730 days of 2026–2027 compared with a port of orthocal's own rule (`tools/rocor/orthocal_port.py`, which
  reproduces all 62 orthocal.info pages read on 28 Nov 2026): 673 identical; the 57 differences are exactly the rows
  above.
- `node test.js` section 14 checks the ROCOR references (62 orthocal dates with the 6 ROCOR differences, the 40-day
  Nativity table, the Holy Trinity samples, Jordanville 27 Nov 2026, ANZ tones and feasts, New Martyrs Sunday,
  colours, and the local date in Australia/Sydney).

## Open questions (for Fr Dionysios)

1. Fasting convention: the Typikon (followed) or the more lenient Russian lay table published by St George parish,
   Sydney (fish on Tuesdays and Thursdays in the Apostles' and Nativity Fasts).
2. Apostles' Fast: the Typikon allows fish when a saint with a doxology or polyeleos falls on Monday, Tuesday or
   Thursday. Not applied (saints' ranks for June not confirmed for ROCOR).
3. The Annunciation in Holy Week (next: when Pascha falls between 26 Mar and 1 Apr OS): orthocal keeps Great
   Monday–Wednesday strict; the app follows; the Typikon may allow fish.
4. St Matthew and St Andrew on a Monday, Wednesday or Friday of the Nativity Fast: wine and oil (Typikon 14 Nov
   instruction, followed) or fish (orthocal).
5. Liturgical colours: the ANZ diocese has published no colour guide; the GB handbook is followed.
6. The six earlier parish-supplement commemorations remain to be confirmed.
