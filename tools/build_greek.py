# Build per-chapter Greek NT JSON for the app from the Robinson-Pierpont Byzantine text (public domain).
# usage: python3 -I build_greek.py <csv dir> <out dir>
import csv, json, os, sys
src, out = sys.argv[1], sys.argv[2]
BOOKS = {"MAT":40,"MAR":41,"LUK":42,"JOH":43,"ACT":44,"ROM":45,"1CO":46,"2CO":47,"GAL":48,"EPH":49,"PHP":50,
         "COL":51,"1TH":52,"2TH":53,"1TI":54,"2TI":55,"TIT":56,"PHM":57,"HEB":58,"JAM":59,"1PE":60,"2PE":61,
         "1JO":62,"2JO":63,"3JO":64,"JUD":65,"REV":66}
total_v = total_c = 0
for code, num in BOOKS.items():
    chapters = {}
    with open(os.path.join(src, code + ".csv"), encoding="utf-8") as f:
        rows = list(csv.reader(f))
    assert rows[0] == ["chapter", "verse", "text"], rows[0]
    for ch, v, text in rows[1:]:
        text = text.replace("¶", "").strip()      # drop paragraph marks
        if not text:                                   # verses absent from the Byzantine tradition
            continue
        chapters.setdefault(int(ch), {})[str(int(v))] = text
    if code == "ROM":
        # The doxology stands at 14:24-26 in the Byzantine text; English Bibles number it 16:25-27.
        for eng, grk in (("25", "24"), ("26", "25"), ("27", "26")):
            chapters[16][eng] = chapters[14][grk]
    os.makedirs(os.path.join(out, str(num)), exist_ok=True)
    for ch, verses in chapters.items():
        with open(os.path.join(out, str(num), str(ch) + ".json"), "w", encoding="utf-8") as g:
            json.dump(verses, g, ensure_ascii=False, separators=(",", ":"))
        total_c += 1; total_v += len(verses)
print("books", len(BOOKS), "chapters", total_c, "verses", total_v)
